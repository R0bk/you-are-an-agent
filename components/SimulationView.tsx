import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Level, Message } from '../types';
import { Terminal } from './Terminal';
import { DesktopEnvironment, DesktopEnvironmentRef } from './DesktopEnvironment';
import { GoogleGenAI } from "@google/genai";
import { ChatMessage } from './ChatMessage';
import { BootSequence } from './BootSequence';
import { TerminalLevelIntro } from './TerminalLevelIntro';
import { TerminalPromptBoxInput } from './TerminalPromptBoxInput';
import { AdvancedSequentialTypewriter } from './AdvancedSequentialTypewriter';
import { useTerminalWheelScrollStep } from './useTerminalWheelScrollStep';
import { useThrottledScroll } from './useThrottledScroll';
import { LevelCompleteOverlay } from './LevelCompleteOverlay';
import { webvmService } from '../services/webvmService';
import { WebVMFrame } from './WebVMFrame';
import { CRTDisplacementMapDefs } from './CRTDisplacementMapDefs';

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
  const [introBoxWidth, setIntroBoxWidth] = useState<number | undefined>(undefined);
  
  // Controls sequential streaming of messages
  // Index of the message currently animating. Messages < index are fully shown. Messages > index are hidden.
  const [animatingIndex, setAnimatingIndex] = useState(0);

  // Detect Safari for compositor workarounds (SVG filter caching issues)
  const isSafari = typeof navigator !== 'undefined' &&
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const desktopRef = useRef<DesktopEnvironmentRef>(null);
  const initialScreenshotStartedRef = useRef(false);

  // For DESKTOP levels: toggle between screenshot-only and interactive mode
  const [showInteractiveDesktop, setShowInteractiveDesktop] = useState(false);

  // For WEBVM levels: toggle console visibility
  const [showWebVMConsole, setShowWebVMConsole] = useState(false);

  // Track if we've captured the initial screenshot for DESKTOP levels
  const [hasInitialScreenshot, setHasInitialScreenshot] = useState(false);

  useTerminalWheelScrollStep(scrollRef, { linesPerStep: 1 });

  // Track scroll position for SVG filter alignment (throttled to 20fps)
  // Use a unique filter ID on each scroll to bypass Safari's cache
  const [filterNonce, setFilterNonce] = useState(0);

  // Use transform-based scrolling when CRT warp is active to prevent jank
  // This ensures content and filter update in the same render cycle
  const useTransformScroll = crtUiWarp2d > 0;

  const { scrollY, scrollHeight, contentStyle, scrollTo, scrollbar } = useThrottledScroll(scrollRef, {
    maxFps: 60,
    enabled: !isLevelIntroAnimating,
    preventOverscroll: true,
    useTransformScroll,
    onScroll: () => {
      // Increment nonce to create new filter ID, bypassing Safari's cache
      if (isSafari && crtUiWarp2d > 0) {
        setFilterNonce(n => n + 1);
      }
    },
  });

  // Initialize Level & Context
  useEffect(() => {
    // Check if this level needs a boot sequence
    const initLevel = async () => {
        if (level.id === 5) { // Level 5 uses WebVM
            setIsBooting(true);
            setUseWebVM(true);
            try {
                // Give React a tick to mount the iframe before booting.
                await new Promise(r => setTimeout(r, 0));
                await webvmService.boot();

                // Initialize the Python project files for level 4
                const billingPy = `def calculate_total(subtotal, tax_rate=0.1):
    """Calculate the total price including tax."""
    tax = subtotal * tax_rate
    return subtotal - tax  # BUG: Should be + not -
`;

                const runTestsPy = `import sys
sys.path.insert(0, '.')
from src.billing import calculate_total

def test_calculate_total():
    """Test that calculate_total adds tax correctly."""
    # $100 with 10% tax should be $110
    result = calculate_total(100, 0.1)
    expected = 110.0

    if abs(result - expected) < 0.01:
        print("OK - calculate_total correctly adds tax")
        return True
    else:
        print(f"FAIL - Expected {expected}, got {result}")
        print(f"  The function seems to be subtracting instead of adding!")
        return False

if __name__ == "__main__":
    print("Running billing tests...")
    print("-" * 40)

    if test_calculate_total():
        print("-" * 40)
        print("OK - All tests passed!")
        sys.exit(0)
    else:
        print("-" * 40)
        print("FAIL - Tests failed!")
        sys.exit(1)
`;

                // Create src directory and write files
                await webvmService.executeShell('mkdir -p src');
                await webvmService.writeFile('src/billing.py', billingPy);
                await webvmService.writeFile('run_tests.py', runTestsPy);
                console.log("Level 5 project files initialized");
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
        setIntroBoxWidth(undefined);

        // --- CONSTRUCT INITIAL CONTEXT WINDOW ---
        const initialMessages: Message[] = [];

        // 1. System Message (Prompt ONLY)
        const systemContent = `### SYSTEM_PROMPT\n${level.systemPrompt}`;
        initialMessages.push({ role: 'system', content: systemContent });

        // 2. Developer Message (Tooling / Definitions)
        // In this simulator, we keep tool definitions out of the SYSTEM prompt to mimic real API structures.
        let developerContent: string | null = null;
        if (!level.hideToolsInSystemPrompt) {
          // Level 4 (MCP): Always show MCP servers section
          if (level.id === 4 && level.realisticTools) {
            const mcpData = level.realisticTools as any;
            developerContent = `<mcp_servers>\n${mcpData.mcp_servers.description}\n\nConnected servers:\n`;
            for (const server of mcpData.mcp_servers.connected_servers) {
              developerContent += `- Name: "${server.name}"\n  URL: "${server.url}"\n`;
            }
            developerContent += `</mcp_servers>\n\n`;

            if (isRealisticMode) {
              // Realistic: Full JSON schema
              developerContent += `<available_functions>\n`;
              developerContent += JSON.stringify(mcpData.available_functions, null, 2);
              developerContent += `\n</available_functions>`;
            } else {
              // Easy: Simple format
              developerContent += `<available_functions>\n`;
              const simpleFns = mcpData.simple_functions || ['mcp_tool_use(server_name, tool_name, arguments?)'];
              developerContent += simpleFns.map((fn: string) => `- ${fn}`).join('\n');
              developerContent += `\n</available_functions>`;
            }
          } else if (isRealisticMode && level.realisticTools) {
            const requestedFormat = level.realisticToolsFormat ?? 'PLAIN_JSON';
            const isMcpFormat = requestedFormat === 'MCP';

            if (isMcpFormat) {
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
        setHasInitialScreenshot(false); // Reset for new level
        initialScreenshotStartedRef.current = false; // Reset ref too

        // If not booting, focus immediately.
        // (We wait for the intro animation to finish before focusing.)
    };

    initLevel();
  }, [level, isRealisticMode]); // Re-run if level OR mode changes

  // Capture initial screenshot for DESKTOP levels
  // Wait until intro animation is complete to avoid state conflicts
  useEffect(() => {
    if (level.type !== 'DESKTOP') return;
    if (isLevelIntroAnimating) return; // Wait for intro to finish
    if (hasInitialScreenshot) return;
    if (initialScreenshotStartedRef.current) return; // Prevent re-runs
    if (history.length === 0) return; // Wait for history to be initialized

    initialScreenshotStartedRef.current = true; // Mark as started immediately

    const captureInitialScreenshot = async () => {
      // Wait for desktop to mount and render
      await new Promise(r => setTimeout(r, 500));

      if (!desktopRef.current) return;

      // First screenshot
      const screenshotUrl = await desktopRef.current.captureScreenshot();
      if (screenshotUrl) {
        setHistory(prev => [
          ...prev,
          { role: 'assistant', content: 'screenshot()' },
          { role: 'tool', content: 'Screenshot captured.', imageUrl: screenshotUrl }
        ]);
      }

      setHasInitialScreenshot(true);
    };

    captureInitialScreenshot();
  }, [level.type, history.length, hasInitialScreenshot, isLevelIntroAnimating]);

  // Handle Boot Completion
  const handleBootComplete = () => {
      setIsBooting(false);
      if (level.id === 5 && inputRef.current) {
          inputRef.current.focus();
      }
  };

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
      const maxScroll = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;
      if (useTransformScroll) {
        scrollTo(maxScroll);
      } else {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [history, status, animatingIndex, useTransformScroll, scrollTo]); // Scroll when animation progresses too

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

        // For DESKTOP levels, capture screenshot after a short delay for DOM updates
        let screenshotUrl: string | undefined;
        if (level.type === 'DESKTOP' && desktopRef.current) {
            await new Promise(r => setTimeout(r, 200)); // Wait for DOM to update
            screenshotUrl = await desktopRef.current.captureScreenshot() || undefined;
        }

        if (validation.toolOutput || screenshotUrl) {
            setHistory(prev => [...prev, {
                role: 'tool',
                content: validation.toolOutput || validation.message,
                imageUrl: screenshotUrl
            } as Message]);
        }
        setTimeout(() => {
            setShowSuccessOverlay(true);
        }, 1000);

      } else if (validation.status === 'INTERMEDIATE') {
        setStatus('IDLE');

        // For DESKTOP levels, capture screenshot after a short delay for DOM updates
        let screenshotUrl: string | undefined;
        if (level.type === 'DESKTOP' && desktopRef.current) {
            await new Promise(r => setTimeout(r, 200)); // Wait for DOM to update
            screenshotUrl = await desktopRef.current.captureScreenshot() || undefined;
        }

        if (validation.toolOutput || screenshotUrl) {
            setHistory(prev => [...prev, {
                role: 'tool',
                content: validation.toolOutput || '',
                imageUrl: screenshotUrl
            } as Message]);
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

  // Estimate token count based on actual content (~4 chars per token for English)
  // Images are counted as 560 tokens each (standard vision model token cost)
  const IMAGE_TOKEN_COST = 560;
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);
  const baseTokens = estimateTokens(level.systemPrompt || '') + estimateTokens(level.userPrompt || '') + estimateTokens(input);
  const initialImageTokens = activeImageUrl ? IMAGE_TOKEN_COST : 0;
  const tokenCount = history.reduce((sum, msg) => {
    const content = typeof msg.content === 'string' ? msg.content : '';
    const textTokens = estimateTokens(content);
    const imageTokens = msg.imageUrl ? IMAGE_TOKEN_COST : 0;
    return sum + textTokens + imageTokens;
  }, baseTokens + initialImageTokens);

  return (
    <>
    {isBooting && <BootSequence onComplete={handleBootComplete} />}

    {/* SVG filter definition - rendered here to access scroll info for alignment */}
    {/* Use unique ID on Safari to bypass compositor cache */}
    {crtUiWarp2d > 0 && (
      <CRTDisplacementMapDefs
        id={isSafari ? `crtWarp2d-${filterNonce}` : 'crtWarp2d'}
        scale={crtUiWarp2d}
        scrollY={scrollY}
        scrollHeight={scrollHeight}
      />
    )}

    <div className="w-full max-w-7xl mx-auto p-2 md:p-4 flex flex-col h-screen max-h-[calc(100vh)] overflow-hidden relative">
      
      {/* SUCCESS OVERLAY */}
      <LevelCompleteOverlay
        open={showSuccessOverlay}
        levelId={level.id}
        levelTitle={level.title}
        feedback={feedback}
        tokenCount={tokenCount}
        onContinue={handleNextLevel}
        crtUiWarp2d={crtUiWarp2d}
      />

      <div
        className={`flex flex-col gap-4 flex-1 min-h-0 ${crtUiWarp2d > 0 ? '' : 'crt-curvature'}`}
        style={{
          ['--crt-curvature' as any]: crtUiCurvature,
        }}
      >
        {/* Main Layout Area - no gap, scroll fills CRT */}
        <div className={`flex flex-col md:flex-row flex-1 min-h-0`}>

        {/* LEFT PANE: UNIFIED CONTEXT + INPUT */}
        <div className={`${(level.type === 'DESKTOP' && showInteractiveDesktop) || (level.id === 5 && showWebVMConsole) ? 'md:w-1/3' : 'w-full'} flex flex-col flex-1 min-h-0`}>
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
                     filterStyle={crtUiWarp2d > 0 ? {
                       filter: `url(#${isSafari ? `crtWarp2d-${filterNonce}` : 'crtWarp2d'})`,
                     } : undefined}
                     onComplete={(finalCanvasText, boxWidth) => {
                       setIntroCanvasText(finalCanvasText);
                       setIntroBoxWidth(boxWidth);
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
                   {/* HISTORY AREA - scrollbar at right edge of CRT, fades at edges */}
                   {/* When CRT warp is active, use transform-based scrolling to sync content + filter */}
                   <div
                     ref={scrollRef}
                     className={`flex-1 min-h-0 ${useTransformScroll ? 'overflow-hidden' : 'overflow-y-auto'} relative crt-scroll-fade overscroll-contain`}
                     style={crtUiWarp2d > 0 ? {
                       filter: `url(#${isSafari ? `crtWarp2d-${filterNonce}` : 'crtWarp2d'})`,
                     } : undefined}
                   >
                   <div
                     className="p-4 lg:pt-16 lg:pb-16 pt-8 pb-8 min-h-full"
                     style={useTransformScroll ? contentStyle : undefined}
                   >
                        {/* Header Info - inside scroll area */}
                        <div className="flex items-start justify-between text-terminal-text font-mono text-sm opacity-70 mb-4 leading-relaxed">
                          <div className="flex flex-col gap-0 min-w-0">
                            <span className="text-terminal-green font-bold tracking-widest uppercase text-[10px]">
                              Simulation // Level {level.id.toString().padStart(2, '0')}
                            </span>
                            <span className="text-terminal-text uppercase tracking-widest font-bold opacity-70">
                              {level.title}
                            </span>
                          </div>

                          {/* EASY/REALISTIC selector */}
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
                                onClick={(e) => { e.stopPropagation(); setIsRealisticMode(false); }}
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
                                  onClick={(e) => { e.stopPropagation(); setIsRealisticMode(false); }}
                                  className={`w-4 h-4 border-2 transition-colors ${isRealisticMode ? 'border-terminal-red/80' : 'border-white/80'} ${!isRealisticMode ? 'bg-white' : 'bg-transparent hover:bg-terminal-red/10'}`}
                                />
                                <button
                                  type="button"
                                  aria-label="Set mode to Realistic"
                                  onClick={(e) => { e.stopPropagation(); setIsRealisticMode(true); }}
                                  className={`w-4 h-4 border-2 -ml-[2px] transition-colors ${isRealisticMode ? 'border-terminal-red/80 bg-terminal-red' : 'border-white/80 bg-transparent hover:bg-white/10'}`}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setIsRealisticMode(true); }}
                                className={`font-mono font-bold tracking-widest uppercase cursor-pointer ${isRealisticMode ? 'text-terminal-red' : 'text-terminal-text'}`}
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

                        {/* Floating popout button for Level 5 WebVM */}
                        {level.id === 5 && useWebVM && !showWebVMConsole && !isBooting && (
                          <button
                            onClick={() => setShowWebVMConsole(true)}
                            className="absolute top-2 right-4 z-10 w-6 h-6 flex items-center justify-center bg-black/80 hover:bg-black text-terminal-green text-xs font-mono border border-terminal-green/50 hover:border-terminal-green rounded cursor-pointer transition-all"
                            title="Show Console"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="15 3 21 3 21 9"></polyline>
                              <polyline points="9 21 3 21 3 15"></polyline>
                              <line x1="21" y1="3" x2="14" y2="10"></line>
                              <line x1="3" y1="21" x2="10" y2="14"></line>
                            </svg>
                          </button>
                        )}
                        {history.length === 0 && (
                            <div className="text-zinc-600 italic text-center mt-10">
                                Initializing context window...
                            </div>
                        )}
                        {history.map((msg, idx) => {
                          // Find the last message with a screenshot
                          const lastScreenshotIdx = history.reduce((lastIdx, m, i) => m.imageUrl ? i : lastIdx, -1);

                          return (
                            <ChatMessage
                              key={idx}
                              msg={msg}
                              idx={idx}
                              activeImageUrl={activeImageUrl}
                              isFirstUserMessage={msg.role === 'user' && idx === history.findIndex((m) => m.role === 'user')}
                              isVisible={idx <= animatingIndex}
                              isAnimating={idx === animatingIndex}
                              speedMultiplier={typewriterSpeed}
                              isLastScreenshot={msg.imageUrl !== undefined && idx === lastScreenshotIdx}
                              onCheatClick={() => setShowInteractiveDesktop(true)}
                              onAnimationComplete={() => setAnimatingIndex(current => {
                                  // Prevent race conditions/double-firing where it might skip an index
                                  if (current === idx) return idx + 1;
                                  return current;
                              })}
                            />
                          );
                        })}

                        {/* Status Indicator */}
                        {status === 'THINKING' && animatingIndex >= history.length && (
                          <div className="text-terminal-yellow animate-pulse flex items-center gap-2 text-xs font-bold uppercase tracking-widest mt-4 pl-2">
                              <span className="w-2 h-2 bg-terminal-yellow rounded-full"></span>
                              {loadingText}
                          </div>
                        )}

                        {/* INPUT AREA (inside scroll container so whole page scrolls) */}
                        <TerminalPromptBoxInput
                          canvasText={introCanvasText}
                          canvasBoxWidth={introBoxWidth}
                          value={input}
                          onChange={setInput}
                          onSubmit={handleSubmit}
                          onKeyDown={handleKeyDown}
                          placeholder={level.placeholder}
                          disabled={status === 'SUCCESS' || status === 'THINKING'}
                          textareaRef={inputRef}
                          hint={level.hint}
                          tokenCount={tokenCount}
                        />
                   </div>
                   {/* Custom scrollbar for transform-based scrolling */}
                   {scrollbar.show && (
                     <div
                       className="absolute right-0 top-0 bottom-0 w-4 cursor-pointer"
                       style={{ zIndex: 10 }}
                       onClick={scrollbar.onTrackClick}
                     >
                       <div
                         className="absolute right-[3px] w-[10px] rounded-none bg-white/40 hover:bg-white/60 transition-colors cursor-grab active:cursor-grabbing"
                         style={{
                           top: `${scrollbar.thumbTopPercent}%`,
                           height: `${scrollbar.thumbHeightPercent}%`,
                         }}
                         {...scrollbar.thumbProps}
                       />
                     </div>
                   )}
                   </div>
                 </>
               )}
              </Terminal>
        </div>

        {/* RIGHT PANE: DESKTOP ENVIRONMENT (Only for Desktop Levels when interactive mode is on) */}
        {level.type === 'DESKTOP' && showInteractiveDesktop && (
            <div className="md:w-2/3 h-full flex flex-col relative">
                 {/* Close button to hide desktop */}
                 <button
                    onClick={() => setShowInteractiveDesktop(false)}
                    className="absolute top-2 right-2 z-50 w-6 h-6 flex items-center justify-center bg-black/80 hover:bg-red-900 text-terminal-green hover:text-white text-xs font-mono border border-terminal-green/50 hover:border-red-500 rounded cursor-pointer transition-all"
                    title="Hide Desktop"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 14 10 14 10 20"></polyline>
                      <polyline points="20 10 14 10 14 4"></polyline>
                      <line x1="14" y1="10" x2="21" y2="3"></line>
                      <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                 </button>
                 <Terminal title="REMOTE_DESKTOP_CONNECTION [VNC: 5900]" className="flex-1 h-full bg-zinc-900 border-l border-zinc-800">
                    <div className="w-full h-full relative flex items-center justify-center bg-zinc-900">
                        <DesktopEnvironment ref={desktopRef} history={history} />
                    </div>
                 </Terminal>
            </div>
        )}

        {/* Hidden desktop for screenshot capture - rendered via Portal to isolate from layout */}
        {level.type === 'DESKTOP' && !showInteractiveDesktop && createPortal(
            <div style={{
                position: 'fixed',
                left: 0,
                top: 0,
                width: 1024,
                height: 768,
                overflow: 'hidden',
                opacity: 0,
                pointerEvents: 'none',
                zIndex: -50
            }}>
                <DesktopEnvironment ref={desktopRef} history={history} forceScale={1} />
            </div>,
            document.body
        )}

        {/* RIGHT PANE: WEBVM (Level 5) - Always mounted to preserve state, visibility toggled */}
        {level.id === 5 && useWebVM && (
          <div className={`md:w-2/3 h-full flex flex-col relative ${showWebVMConsole ? '' : 'hidden'}`}>
            {/* Close button to hide console */}
            <button
              onClick={() => setShowWebVMConsole(false)}
              className="absolute top-2 right-2 z-50 w-6 h-6 flex items-center justify-center bg-black/80 hover:bg-red-900 text-terminal-green hover:text-white text-xs font-mono border border-terminal-green/50 hover:border-red-500 rounded cursor-pointer transition-all"
              title="Hide Console"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>
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