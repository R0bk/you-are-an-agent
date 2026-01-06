import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildPromptOutlineOps, makeBlankCanvas, setCanvasChar, buildGenerateButtonLines } from './terminalPromptLayout';

type Canvas = string[];

interface LevelCompleteOverlayProps {
  open: boolean;
  levelId: number;
  levelTitle: string;
  feedback: string;
  tokenCount?: number;
  continueLabel?: string;
  onContinue: () => void;
}

function computeCanvasDelayMs(ch: string, kind: 'corner' | 'edge') {
  // Similar cadence to `TerminalLevelIntro`: fast edges, heavier corners, slow punctuation.
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

export const LevelCompleteOverlay: React.FC<LevelCompleteOverlayProps> = ({
  open,
  levelId,
  levelTitle,
  feedback,
  tokenCount,
  continueLabel = 'INITIALIZE NEXT LEVEL',
  onContinue,
}) => {
  // Keep this size “terminal-ish”: wide enough for stats + CTA, but not full-screen.
  const boxWidth = 66;
  const boxHeight = 16;
  const lineHeightEm = 1.05;

  const [canvas, setCanvas] = useState<Canvas>(() => makeBlankCanvas(boxWidth, boxHeight));
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const skipRef = useRef(false);

  const plan = useMemo(() => {
    const { ops: outlineOps } = buildPromptOutlineOps(boxWidth, boxHeight);
    const all: Array<{ x: number; y: number; ch: string; kind: 'corner' | 'edge' }> = [...outlineOps];

    const innerWidth = boxWidth - 2;
    const centerX = (line: string) => 1 + Math.max(0, Math.floor((innerWidth - line.length) / 2));

    const header = 'LEVEL COMPLETE';
    const sub = `LEVEL ${levelId.toString().padStart(2, '0')} // ${levelTitle}`;
    const msg = clampText(feedback, innerWidth - 2);

    pushTextOps(all, centerX(header), 2, header);
    pushTextOps(all, centerX(sub), 4, clampText(sub, innerWidth - 2));
    pushTextOps(all, 2, 6, msg);

    const tokensLine =
      typeof tokenCount === 'number'
        ? `TOKENS: ${tokenCount.toString().padStart(4, ' ')}`
        : 'TOKENS: ----';
    pushTextOps(all, 2, 8, tokensLine);

    // CTA “button” (same drawing style as the prompt box generate button).
    const btn = buildGenerateButtonLines(continueLabel, '→');
    const btnX = 1 + Math.max(0, Math.floor((innerWidth - btn.width) / 2));
    const btnY = boxHeight - 2 - btn.height; // keep one inner row below it
    for (let row = 0; row < btn.lines.length; row++) {
      const line = btn.lines[row];
      for (let i = 0; i < line.length; i++) {
        all.push({ x: btnX + i, y: btnY + row, ch: line[i], kind: 'edge' });
      }
    }

    // Helper hint below the button (inside border, on the last inner row).
    const hint = '[ENTER] CONTINUE  •  [CLICK] SKIP ANIMATION';
    pushTextOps(all, centerX(clampText(hint, innerWidth - 2)), boxHeight - 2, clampText(hint, innerWidth - 2));

    return { ops: all, btnX, btnY, btnWidth: btn.width, btnHeight: btn.height };
  }, [boxWidth, boxHeight, levelId, levelTitle, feedback, tokenCount, continueLabel]);

  // Reset when opened or content changes.
  useEffect(() => {
    if (!open) return;
    skipRef.current = false;
    setCanvas(makeBlankCanvas(boxWidth, boxHeight));
    setStep(0);
    setDone(false);
  }, [open, boxWidth, boxHeight, levelId, levelTitle, feedback, tokenCount, continueLabel]);

  // Drawing loop
  useEffect(() => {
    if (!open) return;
    if (done) return;
    if (skipRef.current) return;
    if (step >= plan.ops.length) {
      setDone(true);
      return;
    }

    const o = plan.ops[step];
    const delay = computeCanvasDelayMs(o.ch, o.kind);
    const t = window.setTimeout(() => {
      setCanvas((prev) => setCanvasChar(prev, o.x, o.y, o.ch));
      setStep((n) => n + 1);
    }, delay);
    return () => window.clearTimeout(t);
  }, [open, done, step, plan.ops]);

  // Skip handler (renders the fully-drawn canvas immediately).
  const skip = () => {
    if (!open) return;
    if (done) return;
    skipRef.current = true;
    const finalCanvas = applyOpsToBlankCanvas(boxWidth, boxHeight, plan.ops);
    setCanvas(finalCanvas);
    setDone(true);
    setStep(plan.ops.length);
  };

  // Keyboard: Enter continues once done; any key can skip while drawing.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (done) onContinue();
        else skip();
        return;
      }
      if (!done) skip();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, done, onContinue]);

  if (!open) return null;

  const canvasFontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300"
      onMouseDown={skip}
      role="dialog"
      aria-modal="true"
      aria-label="Level complete"
    >
      {/* Layer in the same CRT scanlines/flicker style used elsewhere. */}
      <div className="absolute inset-0 crt-scanlines opacity-60 pointer-events-none" />
      <div className="absolute inset-0 crt-flicker opacity-40 pointer-events-none" />

      <div className="relative">
        <pre
          className="select-none whitespace-pre leading-[1.05] text-terminal-green text-sm md:text-base"
          style={{ fontFamily: canvasFontFamily, lineHeight: `${lineHeightEm}em` }}
        >
          {canvas.join('\n')}
        </pre>

        {/* Invisible, properly focusable CTA overlay positioned over the drawn button once done. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!done) {
              skip();
              return;
            }
            onContinue();
          }}
          className={[
            'absolute',
            'bg-transparent border-0 p-0 m-0',
            // Keep the “drawn” glyphs visible from the <pre>; this element is just for interaction.
            'text-transparent',
            'focus:outline-none focus:ring-2 focus:ring-terminal-green/60 rounded-sm',
            done ? 'cursor-pointer' : 'cursor-default',
          ].join(' ')}
          style={{
            left: `calc(${plan.btnX} * 1ch)`,
            top: `calc(${plan.btnY} * ${lineHeightEm}em)`,
            width: `calc(${plan.btnWidth} * 1ch)`,
            height: `calc(${plan.btnHeight} * ${lineHeightEm}em)`,
          }}
          aria-label={continueLabel}
        >
          {continueLabel}
        </button>
      </div>
    </div>
  );
};


