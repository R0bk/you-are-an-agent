import React, { useMemo } from 'react';
import { Message } from '../types';
import { Image as ImageIcon } from 'lucide-react';
import { AdvancedSequentialTypewriter, TypewriterSegment } from './AdvancedSequentialTypewriter';

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
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ 
    msg, 
    idx, 
    activeImageUrl,
    isFirstUserMessage,
    isVisible,
    isAnimating,
    onAnimationComplete
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
                     <div className="my-2 w-48 h-32 rounded overflow-hidden border border-zinc-700 relative group animate-in zoom-in-95 duration-300">
                        <img src={activeImageUrl} className="object-cover w-full h-full" alt="User attachment" />
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <ImageIcon size={16} className="text-white"/>
                        </div>
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
          s.push({ text: msg.content, className: contentColor });
          addFooter();
      }

      return s;
  }, [msg, activeImageUrl, isFirstUserMessage]);

  return (
    <div>
        <AdvancedSequentialTypewriter
          segments={segments}
          isAnimating={isAnimating}
          onComplete={onAnimationComplete}
          delayProfile={{
            baseDelayMs,
            // Make word breaks + punctuation feel more “terminal-y”
            whitespaceDelayMs: 35,
            wordGapDelayMs: 55,
            punctuationDelayMs: 95,
            newlineDelayMs: 160,
            styleChangeDelayMs: 70,
            maxDelayMs: 260,
          }}
        />
    </div>
  );
};