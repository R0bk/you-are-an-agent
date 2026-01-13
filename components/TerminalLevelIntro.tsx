import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdvancedSequentialTypewriter, TypewriterSegment } from './AdvancedSequentialTypewriter';
import {
  TERMINAL_PROMPT_LAYOUT,
  makeBlankCanvas,
  setCanvasChar,
  buildPromptOutlineOps,
  buildGenerateButtonLines,
  computeGenerateButtonStartX,
} from './terminalPromptLayout';
import { useDynamicBoxWidth } from './useDynamicBoxWidth';

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

interface TerminalLevelIntroProps {
  levelId: number;
  levelTitle: string;
  systemContent: string;
  developerContent?: string;
  userContent: string;
  onComplete: (finalCanvasText: string, boxWidth: number) => void;
  speedMultiplier?: number;
}

function computeCanvasDelayMs(ch: string, kind: 'corner' | 'edge') {
  // Clean, discrete steps: 1 char per tick. Slow down slightly on corners + spaces.
  let d = 6;
  if (kind === 'corner') d += 35;
  if (ch === ' ') d += 40;
  if (/[.,!?;:]/.test(ch)) d += 85;
  return Math.min(d, 220);
}


export const TerminalLevelIntro: React.FC<TerminalLevelIntroProps> = ({
  levelId,
  levelTitle,
  systemContent,
  developerContent,
  userContent,
  onComplete,
  speedMultiplier = 1,
}) => {
  const [phase, setPhase] = useState<'TYPING' | 'CANVAS' | 'DONE'>('TYPING');
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const { containerRef, boxWidth } = useDynamicBoxWidth();
  const boxHeight = TERMINAL_PROMPT_LAYOUT.boxHeight;

  const [canvas, setCanvas] = useState<string[]>(() => makeBlankCanvas(boxWidth, TERMINAL_PROMPT_LAYOUT.canvasHeight));
  const [canvasStep, setCanvasStep] = useState(0);

  // Prevent multiple onComplete calls (Safari ResizeObserver can cause effect re-runs)
  const hasCompletedRef = useRef(false);

  // Reset canvas when level content changes
  useEffect(() => {
    hasCompletedRef.current = false;
    setPhase('TYPING');
    setCanvas(makeBlankCanvas(boxWidth, TERMINAL_PROMPT_LAYOUT.canvasHeight));
    setCanvasStep(0);
    // We intentionally exclude boxWidth - we don't want to reset animation when width changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId, levelTitle, systemContent, userContent]);

  const introSegments: TypewriterSegment[] = useMemo(() => {
    const TAG_BASE = 'font-mono select-none opacity-50';
    const BRACKET_COLOR = 'text-zinc-500';

    const s: TypewriterSegment[] = [];

    // Level header (2 lines, like the old version)
    s.push({
      // Match the header casing exactly ("Simulation", not "SIMULATION")
      text: `Simulation // Level ${levelId.toString().padStart(2, '0')}\n`,
      className: 'text-terminal-green font-bold tracking-widest uppercase text-[10px]',
    });
    // Match the header's title styling (uppercase + tracking + bold)
    s.push({ text: `${levelTitle}\n\n`, className: 'text-terminal-text uppercase tracking-widest font-bold opacity-70' });

    const addTag = (label: string, colorClass: string) => {
      s.push({ text: '<|start|>', className: `${TAG_BASE} ${BRACKET_COLOR}` });
      s.push({ text: label, className: `${TAG_BASE} ${colorClass} opacity-100` });
    };
    const addHeaderEnd = (extra?: string) => {
      if (extra) {
        s.push({ text: '<|channel|>', className: `${TAG_BASE} ${BRACKET_COLOR}` });
        s.push({ text: extra, className: `${TAG_BASE} text-zinc-400 opacity-100` });
      }
      s.push({ text: '<|message|>\n', className: `${TAG_BASE} ${BRACKET_COLOR}` });
    };
    const addFooter = () => {
      s.push({ text: '\n<|end|>\n\n', className: `${TAG_BASE} ${BRACKET_COLOR}` });
    };

    // System
    addTag('system', 'text-terminal-blue');
    addHeaderEnd();
    {
      const { main, toolsTail } = splitSystemContentForToolsHighlight(systemContent);
      if (main) s.push({ text: main, className: 'text-terminal-blue/90' });
      if (toolsTail) s.push({ text: toolsTail, className: 'text-terminal-yellow/90' });
    }
    addFooter();

    // Developer (optional): typically tool definitions in this simulator
    if (developerContent) {
      addTag('developer', 'text-cyan-400');
      addHeaderEnd();
      s.push({ text: developerContent, className: 'text-terminal-yellow/90' });
      addFooter();
    }

    // User
    addTag('user', 'text-terminal-green');
    addHeaderEnd();
    s.push({ text: userContent, className: 'text-white' });
    addFooter();

    // Assistant header (prompt)
    addTag('assistant', 'text-zinc-400');
    addHeaderEnd('final');
    s.push({ text: '\n', className: `${TAG_BASE} ${BRACKET_COLOR}` });

    return s;
  }, [levelId, levelTitle, systemContent, userContent]);

  const canvasOps = useMemo(() => {
    const { ops: outlineOps, h } = buildPromptOutlineOps(boxWidth, boxHeight);

    const ops: Array<{ x: number; y: number; ch: string; kind: 'corner' | 'edge' }> = [];

    // Outline (clockwise)
    ops.push(...outlineOps);

    // 3-line unicode “button” inside the box (bottom-right).
    const btn = buildGenerateButtonLines(
      TERMINAL_PROMPT_LAYOUT.generateLabel,
      TERMINAL_PROMPT_LAYOUT.generateIcon
    );
    const buttonX = computeGenerateButtonStartX(boxWidth, btn.width);
    const bottomInnerY = h - 2;
    const topY = bottomInnerY - (btn.height - 1);
    for (let row = 0; row < btn.lines.length; row++) {
      const line = btn.lines[row];
      for (let i = 0; i < line.length; i++) {
        ops.push({ x: buttonX + i, y: topY + row, ch: line[i], kind: 'edge' });
      }
    }

    return ops;
  }, [boxWidth, boxHeight]);

  // Drive the prompt UI drawing loop once the text typing is done
  useEffect(() => {
    if (phase !== 'CANVAS') return;
    if (canvasStep >= canvasOps.length) {
      // Guard against multiple completions (Safari ResizeObserver issue)
      if (hasCompletedRef.current) return;
      hasCompletedRef.current = true;
      setPhase('DONE');
      onCompleteRef.current?.(canvas.join('\n'), boxWidth);
      return;
    }

    const step = canvasOps[canvasStep];
    const baseDelay = computeCanvasDelayMs(step.ch, step.kind);
    const delay = Math.max(1, Math.floor(baseDelay / speedMultiplier));

    const t = window.setTimeout(() => {
      setCanvas((prev) => setCanvasChar(prev, step.x, step.y, step.ch));
      setCanvasStep((n) => n + 1);
    }, delay);

    return () => window.clearTimeout(t);
  }, [phase, canvasStep, canvasOps, speedMultiplier, boxWidth, canvas]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <AdvancedSequentialTypewriter
          segments={introSegments}
          isAnimating={phase === 'TYPING'}
          onComplete={() => setPhase('CANVAS')}
          speedMultiplier={speedMultiplier}
          delayProfile={{
            baseDelayMs: 10,
            whitespaceDelayMs: 35,
            wordGapDelayMs: 55,
            punctuationDelayMs: 100,
            newlineDelayMs: 170,
            styleChangeDelayMs: 85,
            maxDelayMs: 280,
          }}
        />
      </div>

      {/* Prompt box area: match TerminalPromptBoxInput(minimal) exactly to avoid "swap" visual jumps */}
      <div
        ref={containerRef}
        className="shrink-0 z-20 bg-transparent border-t border-zinc-800 p-3 md:p-4 shadow-[0_-5px_15px_rgba(0,0,0,0.3)] overflow-hidden"
      >
        <div
          className="relative font-mono text-terminal-green text-sm"
          style={{ lineHeight: `${TERMINAL_PROMPT_LAYOUT.lineHeightEm}em` }}
        >
          <pre
            className="whitespace-pre overflow-hidden terminal-canvas-font"
          >
            {canvas.join('\n')}
          </pre>
        </div>
      </div>
    </div>
  );
};
