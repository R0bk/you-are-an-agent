import React, { useState, useEffect, useRef } from 'react';
import { Level, Message } from '../types';
import { Terminal } from './Terminal';
import { DesktopEnvironment } from './DesktopEnvironment';
import { GoogleGenAI } from "@google/genai";
import { ChatMessage } from './ChatMessage';
import { BootSequence } from './BootSequence';
import { TerminalLevelIntro } from './TerminalLevelIntro';
import { TerminalPromptBoxInput } from './TerminalPromptBoxInput';
import { AdvancedSequentialTypewriter } from './AdvancedSequentialTypewriter';
import { useTerminalWheelScrollStep } from './useTerminalWheelScrollStep';
import { LevelCompleteOverlay } from './LevelCompleteOverlay';
import { webvmService } from '../services/webvmService';
import { WebVMFrame } from './WebVMFrame';

interface SimulationViewProps {
  level: Level;
  onSuccess: () => void;
  imageUrl?: string;
  isRealisticMode?: boolean;
  setIsRealisticMode?: React.Dispatch<React.SetStateAction<boolean>>;
  crtUiCurvature?: number;
  crtUiWarp2d?: number;
  typewriterSpeed?: 1 | 2 | 4 | 8 | 16;
}

export const SimulationView: React.FC<SimulationViewProps> = ({
  level,
  onSuccess,
  imageUrl,
  isRealisticMode = false,
  setIsRealisticMode,
  crtUiCurvature = 0,
  crtUiWarp2d = 0,
  typewriterSpeed = 1,
}) => {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'IDLE' | 'THINKING' | 'ERROR' | 'SUCCESS'>('IDLE');
  const [loadingText, setLoadingText] = useState('PROCESSING...');
  const [feedback, setFeedback] = useState('');
  const [history, setHistory] = useState<Message[]>([]);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [useWebVM, setUseWebVM] = useState(false);
  const [isLevelIntroAnimating, setIsLevelIntroAnimating] = useState(true);
  const [introCanvasText, setIntroCanvasText] = useState<string | undefined>(undefined);
  
  // Controls sequential streaming of messages
  // Index of the message currently animating. Messages < index are fully shown. Messages > index are hidden.
  const [animatingIndex, setAnimatingIndex] = useState(0);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useTerminalWheelScrollStep(scrollRef, { linesPerStep: 1 });

  // Initialize Level & Context
  useEffect(() => {
    // Check if this level needs a boot sequence
    const initLevel = async () => {
        if (level.id === 4) { // Level 4 uses WebVM
            setIsBooting(true);
            setUseWebVM(true);
            try {
                // Give React a tick to mount the iframe before booting.
                await new Promise(r => setTimeout(r, 0));
                await webvmService.boot();
            } catch (e) {
                console.error("WebVM boot failed", e);
            }
        } else {
            setIsBooting(false);
            setUseWebVM(false);
        }

        setInput('');
        setStatus('IDLE');
        setFeedback('');
        setShowSuccessOverlay(false);
        setAnimatingIndex(0);
        setIsLevelIntroAnimating(true);
        setIntroCanvasText(undefined);

        // --- CONSTRUCT INITIAL CONTEXT WINDOW ---
        const initialMessages: Message[] = [];

        // 1. System Message (Prompt ONLY)
        const systemContent = `### SYSTEM_PROMPT\n${level.systemPrompt}`;
        initialMessages.push({ role: 'system', content: systemContent });

        // 2. Developer Message (Tooling / Definitions)
        // In this simulator, we keep tool definitions out of the SYSTEM prompt to mimic real API structures.
        let developerContent: string | null = null;
        if (!level.hideToolsInSystemPrompt) {
          if (isRealisticMode && level.realisticTools) {
            const requestedFormat = level.realisticToolsFormat ?? 'PLAIN_JSON';
            const shouldUseMcpWrapper = level.id === 7 && requestedFormat === 'MCP';

            if (shouldUseMcpWrapper) {
              developerContent = `<mcp_servers>\nConnected servers:\n- Name: "simulation-mcp"\n  URL: "https://mcp.simulation.app/sse"\n</mcp_servers>`;
              developerContent += `\n\n<mcp_tool_definitions server="simulation-mcp">\n`;
              developerContent += JSON.stringify(level.realisticTools, null, 2);
              developerContent += `\n</mcp_tool_definitions>`;
            } else {
              developerContent = `### TOOL_DEFINITIONS\n`;
              developerContent += JSON.stringify(level.realisticTools, null, 2);
            }
          } else if (level.tools && level.tools.length > 0) {
            developerContent = `### AVAILABLE_TOOLS\n` + level.tools.map((t) => `- ${t}`).join('\n');
          }
        }

        if (developerContent) {
          initialMessages.push({ role: 'developer', content: developerContent });
        }

        // 3. User Message (The Task)
        initialMessages.push({ role: 'user', content: level.userPrompt });

        setHistory(initialMessages);

        // If not booting, focus immediately.
        // (We wait for the intro animation to finish before focusing.)
    };

    initLevel();
  }, [level, isRealisticMode]); // Re-run if level OR mode changes


  // Handle Boot Completion
  const handleBootComplete = () => {
      setIsBooting(false);
      if (level.id === 4 && inputRef.current) {
          inputRef.current.focus();
      }
  };

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, status, animatingIndex]); // Scroll when animation progresses too

  // Autofocus input once the "streaming" animation is done and we're idle.
  useEffect(() => {
    const isAnimatingHistory = animatingIndex < history.length;
    if (isBooting) return;
    if (showSuccessOverlay) return;
    if (status !== 'IDLE') return;
    if (isAnimatingHistory) return;
    if (isLevelIntroAnimating) return;
    if (!inputRef.current) return;

    // Delay one frame so layout settles (and so we don't fight with other focus attempts).
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [animatingIndex, history.length, status, isBooting, showSuccessOverlay]);

  const generateUserCritique = async (userInput: string, validationMessage: string) => {
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
              model: 'gemini-2.0-flash-exp',
              contents: `You are simulating a user for an AI agent training game.
              The agent was given this task: "${level.userPrompt}"
              The agent responded with: "${userInput}"
              This response was rejected because: "${validationMessage}"
              
              Task: Write a short, natural, human reply (1-2 sentences) from the User to the Agent complaining about this specific failure.
              Tone: Slightly annoyed, direct, or confused. NOT robotic.
              Examples:
              - "That's not what I asked for."
              - "Are you sure? That looks wrong."
              - "Please actually use the tool."
              
              Reply ONLY with the message text.`
          });
          return response.text.trim();
      } catch (e) {
          return "That doesn't look right. Please try again.";
      }
  };

  const handleSubmit = async () => {
    if (!input.trim()) return;

    // --- DETERMINE LOADING STATE ---
    // Heuristic: What action is the user simulating?
    const lowerInput = input.trim().toLowerCase();
    if (lowerInput.startsWith("search_web")) {
        setLoadingText("SEARCHING WEB...");
    } else if (lowerInput.startsWith("mouse_") || lowerInput.startsWith("click") || lowerInput.startsWith("type")) {
        setLoadingText("UPDATING DESKTOP...");
    } else if (lowerInput.startsWith("execute_shell") || lowerInput.startsWith("write_file")) {
        setLoadingText("SERIAL_TTY0: SENDING...");
    } else {
        setLoadingText("WAITING FOR USER...");
    }

    setStatus('THINKING');
    
    // Simulate model inference latency (minimum)
    await new Promise(resolve => setTimeout(resolve, 600));

    try {
      const validation = await level.validate(input, history);
      
      // 1. Commit the Assistant's message to history
      const newHistory = [...history, { role: 'assistant', content: input } as Message];
      setHistory(newHistory);
      setInput('');

      if (validation.status === 'SUCCESS') {
        setStatus('SUCCESS');
        setFeedback(validation.message);
        if (validation.toolOutput) {
            setHistory(prev => [...prev, { role: 'tool', content: validation.toolOutput } as Message]);
        }
        setTimeout(() => {
            setShowSuccessOverlay(true);
        }, 1000);

      } else if (validation.status === 'INTERMEDIATE') {
        setStatus('IDLE');
        if (validation.toolOutput) {
            setHistory(prev => [...prev, { role: 'tool', content: validation.toolOutput } as Message]);
        }
        if (inputRef.current) inputRef.current.focus();

      } else {
        // FAIL STATUS
        setStatus('IDLE'); // Allow them to try again immediately
        
        if (validation.failType === 'TOOL_ERROR') {
             // Show structured tool error
             setHistory(prev => [...prev, { role: 'tool', content: validation.message, isError: true } as Message]);
        } else {
             // USER_COMPLAINT: Generate user response via Gemini
             setLoadingText("USER REPLYING...");
             setStatus('THINKING'); // Keep thinking state for the "User" typing
             
             const critique = await generateUserCritique(input, validation.message);
             
             setStatus('IDLE');
             setHistory(prev => [...prev, { role: 'user', content: critique } as Message]);
        }
        
        if (inputRef.current) inputRef.current.focus();
      }
    } catch (e) {
      console.error(e);
      setStatus('ERROR');
      setFeedback("SYSTEM ERROR: Simulation Runtime Exception");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleNextLevel = () => {
      setShowSuccessOverlay(false);
      onSuccess();
  }

  const activeImageUrl = level.imageUrl || imageUrl;
  const tokenCount = Math.round(input.length * 1.5 + history.length * 50);

  return (
    <>
    {isBooting && <BootSequence onComplete={handleBootComplete} />}
    
    <div className="w-full max-w-7xl mx-auto p-2 md:px-4 md:pt-2 md:pb-4 lg:py-16 flex flex-col gap-4 h-screen max-h-[calc(100vh)] overflow-scroll relative">
      
      {/* SUCCESS OVERLAY */}
      <LevelCompleteOverlay
        open={showSuccessOverlay}
        levelId={level.id}
        levelTitle={level.title}
        feedback={feedback}
        tokenCount={tokenCount}
        onContinue={handleNextLevel}
      />

      <div
        className={`flex flex-col gap-4 flex-1 min-h-0 ${crtUiWarp2d > 0 ? '' : 'crt-curvature'}`}
        style={{
          ['--crt-curvature' as any]: crtUiCurvature,
          // SVG displacement maps apply a pixel-space `scale` from the filter itself.
          // We control strength by scaling the entire element slightly (cheap),
          // and by applying the filter only when enabled.
          ...(crtUiWarp2d > 0 ? { filter: 'url(#crtWarp2d)' } : null),
        }}
      >
        {/* Header Info */}
      <div className={`flex items-start justify-between text-terminal-text font-mono text-sm opacity-70 px-4 shrink-0 leading-relaxed ${isLevelIntroAnimating ? 'hidden' : 'pt-5'}`}>
          <div className={`flex flex-col gap-0 min-w-0 ${isLevelIntroAnimating ? 'opacity-0 pointer-events-none' : ''}`}>
              <span className="text-terminal-green font-bold tracking-widest uppercase text-[10px]">
                  Simulation // Level {level.id.toString().padStart(2, '0')}
              </span>
              <span className="text-terminal-text uppercase tracking-widest font-bold opacity-70">
                {level.title}
              </span>
          </div>

          {/* EASY/REALISTIC selector (terminal-style, right-aligned on desktop) */}
          {level.id >= 2 && setIsRealisticMode && (
            <div
              className="hidden md:flex items-center gap-2 shrink-0 cursor-pointer select-none"
              role="button"
              tabIndex={0}
              aria-label="Toggle mode between Easy and Realistic"
              onClick={() => setIsRealisticMode((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsRealisticMode((v) => !v);
                }
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRealisticMode(false);
                }}
                className="text-terminal-text font-mono font-bold tracking-widest uppercase cursor-pointer"
                aria-label="Set mode to Easy"
              >
                {isLevelIntroAnimating ? (
                  <AdvancedSequentialTypewriter
                    renderAs="span"
                    showCursor={false}
                    preset="bare"
                    segments={[{ text: 'EASY' }]}
                    isAnimating={true}
                    speedMultiplier={typewriterSpeed}
                    delayProfile={{
                      baseDelayMs: 12,
                      whitespaceDelayMs: 0,
                      wordGapDelayMs: 0,
                      punctuationDelayMs: 0,
                      styleChangeDelayMs: 0,
                      newlineDelayMs: 0,
                      maxDelayMs: 120,
                    }}
                  />
                ) : (
                  'EASY'
                )}
              </button>

              <div className="flex items-center gap-0">
                <button
                  type="button"
                  aria-label="Set mode to Easy"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRealisticMode(false);
                  }}
                  className={`w-4 h-4 border-2 transition-colors ${
                    isRealisticMode ? 'border-terminal-red/80' : 'border-white/80'
                  } ${!isRealisticMode ? 'bg-white' : isRealisticMode ? 'bg-transparent hover:bg-terminal-red/10' : 'bg-transparent hover:bg-white/10'}`}
                />
                <button
                  type="button"
                  aria-label="Set mode to Realistic"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRealisticMode(true);
                  }}
                  className={`w-4 h-4 border-2 -ml-[2px] transition-colors ${
                    isRealisticMode ? 'border-terminal-red/80 bg-terminal-red' : 'border-white/80 bg-transparent hover:bg-white/10'
                  }`}
                />
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRealisticMode(true);
                }}
                className={`font-mono font-bold tracking-widest uppercase cursor-pointer ${
                  isRealisticMode ? 'text-terminal-red' : 'text-terminal-text'
                }`}
                aria-label="Set mode to Realistic"
              >
                {isLevelIntroAnimating ? (
                  <AdvancedSequentialTypewriter
                    renderAs="span"
                    showCursor={false}
                    preset="bare"
                    segments={[{ text: 'REALISTIC' }]}
                    isAnimating={true}
                    speedMultiplier={typewriterSpeed}
                    delayProfile={{
                      baseDelayMs: 12,
                      whitespaceDelayMs: 0,
                      wordGapDelayMs: 0,
                      punctuationDelayMs: 0,
                      styleChangeDelayMs: 0,
                      newlineDelayMs: 0,
                      maxDelayMs: 120,
                    }}
                  />
                ) : (
                  'REALISTIC'
                )}
              </button>
            </div>
          )}
        </div>

        {/* Main Layout Area */}
        <div className={`flex flex-col md:flex-row flex-1 min-h-0 gap-4`}>
        
        {/* LEFT PANE: UNIFIED CONTEXT + INPUT */}
        <div className={`${level.type === 'DESKTOP' ? 'md:w-1/3' : 'w-full'} flex flex-col gap-4 h-full`}>
            
            <div
              className="flex-1 min-h-0"
            >
              <Terminal
                title="AGENT_INTERFACE"
                className="flex-1 min-h-0 shadow-none"
                noScroll
                noPadding
                hideTitleBar
                borderless
                transparentBg
              >
               {isLevelIntroAnimating ? (
                 history.length >= 2 ? (
                   <TerminalLevelIntro
                     levelId={level.id}
                     levelTitle={level.title}
                     systemContent={history.find((m) => m.role === 'system')?.content ?? ''}
                     developerContent={history.find((m) => m.role === 'developer')?.content}
                     userContent={history.find((m) => m.role === 'user')?.content ?? ''}
                     speedMultiplier={typewriterSpeed}
                     onComplete={(finalCanvasText) => {
                       setIntroCanvasText(finalCanvasText);
                       setIsLevelIntroAnimating(false);
                       setAnimatingIndex(history.length); // show initial context fully
                     }}
                   />
                 ) : (
                   <div className="flex-1 p-4 text-zinc-600 italic">
                     Initializing context window...
                   </div>
                 )
               ) : (
                 <>
                   {/* HISTORY AREA */}
                   <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 pt-2">
                      {history.length === 0 && (
                          <div className="text-zinc-600 italic text-center mt-10">
                              Initializing context window...
                          </div>
                      )}
                      {history.map((msg, idx) => (
                        <ChatMessage
                          key={idx}
                          msg={msg}
                          idx={idx}
                          activeImageUrl={activeImageUrl}
                          isFirstUserMessage={msg.role === 'user' && idx === history.findIndex((m) => m.role === 'user')}
                          isVisible={idx <= animatingIndex}
                          isAnimating={idx === animatingIndex}
                          speedMultiplier={typewriterSpeed}
                          onAnimationComplete={() => setAnimatingIndex(current => {
                              // Prevent race conditions/double-firing where it might skip an index
                              if (current === idx) return idx + 1;
                              return current;
                          })}
                        />
                      ))}

                      {/* Status Indicator */}
                      {status === 'THINKING' && animatingIndex >= history.length && (
                        <div className="text-terminal-yellow animate-pulse flex items-center gap-2 text-xs font-bold uppercase tracking-widest mt-4 pl-2">
                            <span className="w-2 h-2 bg-terminal-yellow rounded-full"></span>
                            {loadingText}
                        </div>
                      )}
                   </div>

                   {/* INPUT AREA (ASCII prompt box, but real input controls overlaid) */}
                   <TerminalPromptBoxInput
                     canvasText={introCanvasText}
                     value={input}
                     onChange={setInput}
                     onSubmit={handleSubmit}
                     onKeyDown={handleKeyDown}
                     placeholder={level.placeholder}
                     disabled={status === 'SUCCESS' || status === 'THINKING'}
                     textareaRef={inputRef}
                     hint={level.hint}
                     tokenCount={tokenCount}
                     variant="minimal"
                   />
                 </>
               )}
              </Terminal>
            </div>
        </div>

        {/* RIGHT PANE: DESKTOP ENVIRONMENT (Only for Desktop Levels) */}
        {level.type === 'DESKTOP' && (
            <div className="md:w-2/3 h-full flex flex-col">
                 <Terminal title="REMOTE_DESKTOP_CONNECTION [VNC: 5900]" className="flex-1 h-full bg-zinc-900 border-l border-zinc-800">
                    <div className="w-full h-full relative flex items-center justify-center bg-zinc-900">
                        <DesktopEnvironment history={history} />
                        
                        {/* Desktop-specific log overlay */}
                        <div className="absolute top-4 right-4 bg-black/80 p-2 rounded border border-white/10 text-[10px] font-mono text-zinc-400 pointer-events-none">
                            STATUS: CONNECTED<br/>
                            LATENCY: 24ms
                        </div>
                    </div>
                 </Terminal>
            </div>
        )}

        {/* RIGHT PANE: WEBVM (Level 4) */}
        {level.id === 4 && useWebVM && (
          <div className="md:w-2/3 h-full flex flex-col">
            <Terminal title="WEBVM // Linux + Python" className="flex-1 h-full bg-zinc-900 border-l border-zinc-800">
              <div className="w-full h-full relative bg-black">
                <WebVMFrame className="absolute inset-0 w-full h-full" />
              </div>
            </Terminal>
          </div>
        )}

        </div>
      </div>
    </div>
    </>
  );
};