import React, { useMemo } from 'react';
import { Message } from '../types';
import { Image as ImageIcon } from 'lucide-react';
import { AdvancedSequentialTypewriter, TypewriterSegment } from './AdvancedSequentialTypewriter';
import { formatToolOutput } from '../utils/formatToolOutput';

function splitSystemContentForToolsHighlight(content: string): { main: string; toolsTail?: string } {
  const markers = ['\n\n### AVAILABLE_TOOLS\n', '\n\n### TOOL_DEFINITIONS\n', '\n\n<mcp_servers>', '\n\n<mcp_tool_definitions'];
  const idxs = markers
    .map((m) => content.indexOf(m))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);

  if (idxs.length === 0) return { main: content };
  const idx = idxs[0];
  return { main: content.slice(0, idx), toolsTail: content.slice(idx) };
}

interface ChatMessageProps {
  msg: Message;
  idx: number;
  activeImageUrl?: string;
  isFirstUserMessage?: boolean;
  isVisible: boolean;
  isAnimating: boolean;
  onAnimationComplete: () => void;
  speedMultiplier?: number;
  isLastScreenshot?: boolean;
  onCheatClick?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
    msg,
    idx,
    activeImageUrl,
    isFirstUserMessage,
    isVisible,
    isAnimating,
    onAnimationComplete,
    speedMultiplier = 1,
    isLastScreenshot = false,
    onCheatClick,
}) => {
  
  if (!isVisible) return null;

  // Base speed based on role (advanced typewriter varies delay per char)
  let baseDelayMs = 12;
  if (msg.role === 'system') baseDelayMs = 8;
  if (msg.role === 'developer') baseDelayMs = 8;
  if (msg.role === 'user') baseDelayMs = 14;
  if (msg.role === 'assistant') baseDelayMs = 12;
  if (msg.role === 'tool') baseDelayMs = 8;

  const TAG_BASE = "font-mono select-none opacity-50";
  const BRACKET_COLOR = "text-zinc-500";

  // Memoize delayProfile to prevent animation restarts on re-render
  const delayProfile = useMemo(() => ({
    baseDelayMs,
    whitespaceDelayMs: 35,
    wordGapDelayMs: 55,
    punctuationDelayMs: 95,
    newlineDelayMs: 160,
    styleChangeDelayMs: 70,
    maxDelayMs: 260,
  }), [baseDelayMs]);

  // Build Segments
  const segments: TypewriterSegment[] = useMemo(() => {
      const s: TypewriterSegment[] = [];
      
      const addTag = (label: string, colorClass: string) => {
          s.push({ text: "<|start|>", className: `${TAG_BASE} ${BRACKET_COLOR}` });
          s.push({ text: label, className: `${TAG_BASE} ${colorClass} opacity-100` }); // Opacity 100 for the label itself
      };
      const addHeaderEnd = (extra?: string) => {
          if (extra) {
               s.push({ text: "<|channel|>", className: `${TAG_BASE} ${BRACKET_COLOR}` });
               s.push({ text: extra, className: `${TAG_BASE} text-zinc-400 opacity-100` });
          }
          s.push({ text: "<|message|>\n", className: `${TAG_BASE} ${BRACKET_COLOR}` });
      };
      const addFooter = () => {
          // Match the intro spacing: end tag, then a blank line.
          s.push({ text: "\n<|end|>\n\n", className: `${TAG_BASE} ${BRACKET_COLOR}` });
      };

      if (msg.role === 'system') {
          addTag("system", "text-terminal-blue");
          addHeaderEnd();
          const { main, toolsTail } = splitSystemContentForToolsHighlight(msg.content);
          if (main) s.push({ text: main, className: "text-terminal-blue/90" });
          if (toolsTail) s.push({ text: toolsTail, className: "text-terminal-yellow/90" });
          addFooter();
      }
      else if (msg.role === 'developer') {
          // In this app, the "developer" message primarily carries tool definitions.
          addTag("developer", "text-cyan-400");
          addHeaderEnd();
          s.push({ text: msg.content, className: "text-terminal-yellow/90" });
          addFooter();
      }
      else if (msg.role === 'user') {
          addTag("user", "text-terminal-green");
          addHeaderEnd();
          
          // Image Attachment?
          if (activeImageUrl && isFirstUserMessage) { // Only on first user msg
               s.push({
                   node: (
                     <div className="my-3 w-80 h-60 md:w-[28rem] md:h-80 rounded-lg overflow-hidden border border-zinc-700 relative group animate-in zoom-in-95 duration-300">
                        <img src={activeImageUrl} className="object-cover w-full h-full" alt="User attachment" />
                     </div>
                   )
               });
          }

          s.push({ text: msg.content, className: "text-white" });
          addFooter();
      }
      else if (msg.role === 'assistant') {
          addTag("assistant", "text-zinc-400");
          addHeaderEnd("final");
          s.push({ text: msg.content, className: "text-zinc-300" });
          addFooter();
      }
      else if (msg.role === 'tool') {
          const isError = msg.isError;
          const roleColor = isError ? "text-red-500" : "text-terminal-yellow";
          const contentColor = isError ? "text-red-400" : "text-terminal-yellow";
          const channelName = isError ? "error" : "output";

          addTag("tool", roleColor);
          addHeaderEnd(channelName);

          // Smart format JSON with embedded markdown for readability
          if (!isError) {
              const sections = formatToolOutput(msg.content);
              for (const section of sections) {
                  switch (section.type) {
                      case 'header':
                          if (section.label) {
                              s.push({ text: `[${section.label}]\n`, className: "text-cyan-400 font-semibold" });
                          }
                          s.push({ text: `${section.content}\n`, className: "text-white font-semibold" });
                          break;
                      case 'metadata':
                          s.push({ text: `  ${section.content}\n`, className: "text-zinc-400 text-sm" });
                          break;
                      case 'divider':
                          s.push({ text: `${'─'.repeat(50)}\n`, className: "text-zinc-600" });
                          break;
                      case 'markdown':
                          // Render markdown content with better formatting
                          s.push({ text: `${section.content}\n`, className: "text-zinc-200" });
                          break;
                      case 'list':
                          s.push({ text: `${section.content}\n`, className: "text-terminal-yellow/90" });
                          break;
                      case 'text':
                          s.push({ text: `${section.content}\n`, className: "text-terminal-green" });
                          break;
                      case 'json':
                      default:
                          s.push({ text: section.content, className: contentColor });
                          break;
                  }
              }
          } else {
              s.push({ text: msg.content, className: contentColor });
          }

          // Add screenshot image if present
          if (msg.imageUrl) {
              s.push({
                  node: (
                    <div className="my-3 relative block max-w-[768px]">
                        <img
                            src={msg.imageUrl}
                            alt="Desktop screenshot"
                            className="rounded border border-zinc-700 w-full h-auto"
                        />
                        {/* Popout button on the last screenshot */}
                        {isLastScreenshot && onCheatClick && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCheatClick();
                                }}
                                className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-black/80 hover:bg-black text-terminal-green text-xs font-mono border border-terminal-green/50 hover:border-terminal-green rounded cursor-pointer transition-all"
                                title="Open Desktop"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="15 3 21 3 21 9"></polyline>
                                  <polyline points="9 21 3 21 3 15"></polyline>
                                  <line x1="21" y1="3" x2="14" y2="10"></line>
                                  <line x1="3" y1="21" x2="10" y2="14"></line>
                                </svg>
                            </button>
                        )}
                    </div>
                  )
              });
          }

          addFooter();
      }

      return s;
  }, [msg, activeImageUrl, isFirstUserMessage, isLastScreenshot, onCheatClick]);

  return (
    <div>
        <AdvancedSequentialTypewriter
          segments={segments}
          isAnimating={isAnimating}
          onComplete={onAnimationComplete}
          speedMultiplier={speedMultiplier}
          delayProfile={delayProfile}
        />
    </div>
  );
};