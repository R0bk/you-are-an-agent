import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildPromptOutlineOps, makeBlankCanvas, setCanvasChar, buildGenerateButtonLines } from './terminalPromptLayout';
import { CRTDisplacementMapDefs } from './CRTDisplacementMapDefs';

type Canvas = string[];

interface LevelCompleteOverlayProps {
  open: boolean;
  levelId: number;
  levelTitle: string;
  feedback: string;
  tokenCount?: number;
  continueLabel?: string;
  onContinue: () => void;
  crtUiWarp2d?: number;
}

// Block-style ASCII art for "LEVEL COMPLETE"
const LEVEL_COMPLETE_ASCII = `
██╗     ███████╗██╗   ██╗███████╗██╗
██║     ██╔════╝██║   ██║██╔════╝██║
██║     █████╗  ██║   ██║█████╗  ██║
██║     ██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║
███████╗███████╗ ╚████╔╝ ███████╗███████╗
╚══════╝╚══════╝  ╚═══╝  ╚══════╝╚══════╝

 ██████╗ ██████╗ ███╗   ███╗██████╗ ██╗     ███████╗████████╗███████╗
██╔════╝██╔═══██╗████╗ ████║██╔══██╗██║     ██╔════╝╚══██╔══╝██╔════╝
██║     ██║   ██║██╔████╔██║██████╔╝██║     █████╗     ██║   █████╗
██║     ██║   ██║██║╚██╔╝██║██╔═══╝ ██║     ██╔══╝     ██║   ██╔══╝
╚██████╗╚██████╔╝██║ ╚═╝ ██║██║     ███████╗███████╗   ██║   ███████╗
 ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚══════╝╚══════╝   ╚═╝   ╚══════╝
`.trim();

function computeCanvasDelayMs(ch: string, kind: 'corner' | 'edge') {
  let d = 6;
  if (kind === 'corner') d += 35;
  if (ch === ' ') d += 30;
  if (/[.,!?;:]/.test(ch)) d += 85;
  return Math.min(d, 240);
}

function applyOpsToBlankCanvas(width: number, height: number, ops: Array<{ x: number; y: number; ch: string }>) {
  let canvas: Canvas = makeBlankCanvas(width, height);
  for (const o of ops) canvas = setCanvasChar(canvas, o.x, o.y, o.ch);
  return canvas;
}

function pushTextOps(
  ops: Array<{ x: number; y: number; ch: string; kind: 'corner' | 'edge' }>,
  x: number,
  y: number,
  text: string
) {
  for (let i = 0; i < text.length; i++) {
    ops.push({ x: x + i, y, ch: text[i], kind: 'edge' });
  }
}

function clampText(s: string, max: number) {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

function wrapText(s: string, max: number): string[] {
  const text = (s ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return [text];

  const lines: string[] = [];
  const words = text.split(' ');
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= max) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

export const LevelCompleteOverlay: React.FC<LevelCompleteOverlayProps> = ({
  open,
  levelId,
  levelTitle,
  feedback,
  tokenCount,
  continueLabel = 'INITIALIZE NEXT LEVEL',
  onContinue,
  crtUiWarp2d = 0,
}) => {
  const boxWidth = 40;
  const boxHeight = 16;
  const lineHeightEm = 1.05;

  // ASCII art animation state
  const [asciiVisibleChars, setAsciiVisibleChars] = useState(0);
  const [asciiDone, setAsciiDone] = useState(false);

  // Box animation state
  const [canvas, setCanvas] = useState<Canvas>(() => makeBlankCanvas(boxWidth, boxHeight));
  const [boxStep, setBoxStep] = useState(0);
  const [boxDone, setBoxDone] = useState(false);

  const skipRef = useRef(false);
  const totalAsciiChars = LEVEL_COMPLETE_ASCII.length;

  const plan = useMemo(() => {
    const innerWidth = boxWidth - 2;
    const centerX = (line: string) => 1 + Math.max(0, Math.floor((innerWidth - line.length) / 2));

    // Wrap the feedback text
    const feedbackLines = wrapText(feedback, innerWidth - 2);
    // Calculate dynamic box height based on feedback lines (minimum 16, add extra rows for more lines)
    const extraLines = Math.max(0, feedbackLines.length - 1);
    const dynamicBoxHeight = boxHeight + extraLines;

    const { ops: outlineOps } = buildPromptOutlineOps(boxWidth, dynamicBoxHeight);
    const all: Array<{ x: number; y: number; ch: string; kind: 'corner' | 'edge' }> = [...outlineOps];

    const sub = `LEVEL ${levelId.toString().padStart(2, '0')} // ${levelTitle}`;

    pushTextOps(all, centerX(sub), 2, clampText(sub, innerWidth - 2));

    // Push each wrapped feedback line
    let y = 4;
    for (const line of feedbackLines) {
      pushTextOps(all, 2, y, line);
      y++;
    }

    const tokensLine =
      typeof tokenCount === 'number'
        ? `TOKENS: ${tokenCount.toString().padStart(4, ' ')}`
        : 'TOKENS: ----';
    pushTextOps(all, 2, y + 1, tokensLine);

    // CTA button - positioned higher to leave room for hint
    const btn = buildGenerateButtonLines(continueLabel, '→');
    const btnX = 1 + Math.max(0, Math.floor((innerWidth - btn.width) / 2));
    const btnY = dynamicBoxHeight - 4 - btn.height; // moved up by 2 rows
    for (let row = 0; row < btn.lines.length; row++) {
      const line = btn.lines[row];
      for (let i = 0; i < line.length; i++) {
        all.push({ x: btnX + i, y: btnY + row, ch: line[i], kind: 'edge' });
      }
    }

    // Extra blank line, then hint at the very bottom
    const hint = '[ENTER] CONTINUE';
    pushTextOps(all, centerX(clampText(hint, innerWidth - 2)), dynamicBoxHeight - 2, clampText(hint, innerWidth - 2));

    return { ops: all, dynamicBoxHeight };
  }, [boxWidth, boxHeight, levelId, levelTitle, feedback, tokenCount, continueLabel]);

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    skipRef.current = false;
    setAsciiVisibleChars(0);
    setAsciiDone(false);
    setCanvas(makeBlankCanvas(boxWidth, plan.dynamicBoxHeight));
    setBoxStep(0);
    setBoxDone(false);
  }, [open, boxWidth, plan.dynamicBoxHeight, levelId, levelTitle, feedback, tokenCount, continueLabel]);

  // Phase 1: Animate ASCII art
  useEffect(() => {
    if (!open) return;
    if (skipRef.current) return;
    if (asciiDone) return;
    if (asciiVisibleChars >= totalAsciiChars) {
      setAsciiDone(true);
      return;
    }

    const char = LEVEL_COMPLETE_ASCII[asciiVisibleChars];
    let delay = 4;
    if (char === ' ') delay = 1;
    else if (char === '\n') delay = 8;
    else if (/[█▓▒░╔╗╚╝║═╠╣╦╩╬]/.test(char)) delay = 3;

    const t = setTimeout(() => {
      setAsciiVisibleChars(v => v + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [open, asciiVisibleChars, totalAsciiChars, asciiDone]);

  // Phase 2: Animate box (after ASCII art is done)
  useEffect(() => {
    if (!open) return;
    if (!asciiDone) return;
    if (skipRef.current) return;
    if (boxDone) return;
    if (boxStep >= plan.ops.length) {
      setBoxDone(true);
      return;
    }

    const o = plan.ops[boxStep];
    const delay = computeCanvasDelayMs(o.ch, o.kind);
    const t = setTimeout(() => {
      setCanvas((prev) => setCanvasChar(prev, o.x, o.y, o.ch));
      setBoxStep((n) => n + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [open, asciiDone, boxDone, boxStep, plan.ops]);

  // Skip handler
  const skip = () => {
    if (!open) return;
    if (boxDone) return;
    skipRef.current = true;
    setAsciiVisibleChars(totalAsciiChars);
    setAsciiDone(true);
    const finalCanvas = applyOpsToBlankCanvas(boxWidth, plan.dynamicBoxHeight, plan.ops);
    setCanvas(finalCanvas);
    setBoxDone(true);
    setBoxStep(plan.ops.length);
  };

  // Keyboard handling
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (boxDone) onContinue();
        else skip();
        return;
      }
      if (!boxDone) skip();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, boxDone, onContinue]);

  if (!open) return null;

  const filterId = 'crtWarp2d-levelcomplete';
  const visibleAscii = LEVEL_COMPLETE_ASCII.slice(0, asciiVisibleChars);
  const canvasFontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/5 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300"
      onClick={(e) => {
        // Only skip if clicking on the backdrop (not the content)
        if (e.target === e.currentTarget && !boxDone) {
          skip();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Level complete"
    >
      {/* SVG filter for warp */}
      {crtUiWarp2d > 0 && (
        <CRTDisplacementMapDefs id={filterId} scale={crtUiWarp2d} />
      )}

      {/* CRT effects */}
      <div className="absolute inset-0 crt-scanlines opacity-60 pointer-events-none" />
      <div className="absolute inset-0 crt-flicker opacity-40 pointer-events-none" />

      <div
        className="relative flex flex-col items-center"
        style={crtUiWarp2d > 0 ? { filter: `url(#${filterId})` } : undefined}
      >
        {/* ASCII Art Header */}
        <pre
          className="text-terminal-green text-[8px] md:text-[10px] font-mono leading-tight mb-4 whitespace-pre select-none"
          style={{ fontFamily: canvasFontFamily }}
          onClick={() => !boxDone && skip()}
        >
          {visibleAscii}
          {!asciiDone && <span className="animate-pulse">█</span>}
        </pre>

        {/* Box with content - only show after ASCII is done */}
        {asciiDone && (
          <button
            type="button"
            onClick={() => {
              if (!boxDone) {
                skip();
              } else {
                onContinue();
              }
            }}
            className={`block bg-transparent border-0 p-0 m-0 focus:outline-none focus:ring-2 focus:ring-terminal-green/60 rounded-sm ${boxDone ? 'cursor-pointer' : 'cursor-default'}`}
            aria-label={boxDone ? continueLabel : 'Skip animation'}
          >
            <pre
              className="select-none whitespace-pre leading-[1.05] text-terminal-green text-sm md:text-base text-left"
              style={{ fontFamily: canvasFontFamily, lineHeight: `${lineHeightEm}em` }}
            >
              {canvas.join('\n')}
            </pre>
          </button>
        )}
      </div>
    </div>
  );
};
