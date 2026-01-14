import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildPromptOutlineOps, makeBlankCanvas, setCanvasChar, buildGenerateButtonLines } from './terminalPromptLayout';
import { CRTDisplacementMapDefs } from './CRTDisplacementMapDefs';

type Canvas = string[];

interface SafariWarningOverlayProps {
  open: boolean;
  levelId: number;
  levelTitle: string;
  onSkip: () => void;
  onContinue: () => void;
  crtUiWarp2d?: number;
}

// Block-style ASCII art for "SAFARI"
const SAFARI_ASCII = `
███████╗ █████╗ ███████╗ █████╗ ██████╗ ██╗
██╔════╝██╔══██╗██╔════╝██╔══██╗██╔══██╗██║
███████╗███████║█████╗  ███████║██████╔╝██║
╚════██║██╔══██║██╔══╝  ██╔══██║██╔══██╗██║
███████║██║  ██║██║     ██║  ██║██║  ██║██║
╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝
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

export const SafariWarningOverlay: React.FC<SafariWarningOverlayProps> = ({
  open,
  levelId,
  levelTitle,
  onSkip,
  onContinue,
  crtUiWarp2d = 0,
}) => {
  const boxWidth = 44;
  const boxHeight = 14;
  const lineHeightEm = 1.05;

  // ASCII art animation state
  const [asciiVisibleChars, setAsciiVisibleChars] = useState(0);
  const [asciiDone, setAsciiDone] = useState(false);

  // Box animation state
  const [canvas, setCanvas] = useState<Canvas>(() => makeBlankCanvas(boxWidth, boxHeight));
  const [boxStep, setBoxStep] = useState(0);
  const [boxDone, setBoxDone] = useState(false);

  const skipRef = useRef(false);
  const totalAsciiChars = SAFARI_ASCII.length;

  const plan = useMemo(() => {
    const { ops: outlineOps } = buildPromptOutlineOps(boxWidth, boxHeight);
    const all: Array<{ x: number; y: number; ch: string; kind: 'corner' | 'edge' }> = [...outlineOps];

    const innerWidth = boxWidth - 2;

    // Warning message lines
    const lines = [
      'COMPATIBILITY WARNING',
      '',
      'This level uses desktop simulation.',
      'Safari cannot capture screenshots',
      'due to canvas security policies.',
      '',
      'Use Chrome/Firefox for best results.',
    ];

    let y = 2;
    for (const line of lines) {
      const x = 1 + Math.max(0, Math.floor((innerWidth - line.length) / 2));
      pushTextOps(all, x, y, clampText(line, innerWidth - 2));
      y++;
    }

    // Skip button
    const skipBtn = buildGenerateButtonLines('SKIP LEVEL', '→');
    const skipBtnX = 2;
    const skipBtnY = boxHeight - 2 - skipBtn.height;
    for (let row = 0; row < skipBtn.lines.length; row++) {
      const line = skipBtn.lines[row];
      for (let i = 0; i < line.length; i++) {
        all.push({ x: skipBtnX + i, y: skipBtnY + row, ch: line[i], kind: 'edge' });
      }
    }

    // Try anyway button
    const tryBtn = buildGenerateButtonLines('TRY ANYWAY', '?');
    const tryBtnX = boxWidth - 2 - tryBtn.width;
    const tryBtnY = boxHeight - 2 - tryBtn.height;
    for (let row = 0; row < tryBtn.lines.length; row++) {
      const line = tryBtn.lines[row];
      for (let i = 0; i < line.length; i++) {
        all.push({ x: tryBtnX + i, y: tryBtnY + row, ch: line[i], kind: 'edge' });
      }
    }

    return { ops: all, skipBtnX, skipBtnWidth: skipBtn.width, tryBtnX, tryBtnWidth: tryBtn.width, btnY: skipBtnY, btnHeight: skipBtn.height };
  }, [boxWidth, boxHeight]);

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    skipRef.current = false;
    setAsciiVisibleChars(0);
    setAsciiDone(false);
    setCanvas(makeBlankCanvas(boxWidth, boxHeight));
    setBoxStep(0);
    setBoxDone(false);
  }, [open, boxWidth, boxHeight]);

  // Phase 1: Animate ASCII art
  useEffect(() => {
    if (!open) return;
    if (skipRef.current) return;
    if (asciiDone) return;
    if (asciiVisibleChars >= totalAsciiChars) {
      setAsciiDone(true);
      return;
    }

    const char = SAFARI_ASCII[asciiVisibleChars];
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

  // Skip animation handler
  const skipAnimation = () => {
    if (!open) return;
    if (boxDone) return;
    skipRef.current = true;
    setAsciiVisibleChars(totalAsciiChars);
    setAsciiDone(true);
    const finalCanvas = applyOpsToBlankCanvas(boxWidth, boxHeight, plan.ops);
    setCanvas(finalCanvas);
    setBoxDone(true);
    setBoxStep(plan.ops.length);
  };

  // Keyboard handling
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!boxDone) {
        skipAnimation();
        return;
      }
      if (e.key === 'Enter') {
        onSkip();
      } else if (e.key === 'Escape') {
        onContinue();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, boxDone, onSkip, onContinue]);

  if (!open) return null;

  const filterId = 'crtWarp2d-safariwarning';
  const visibleAscii = SAFARI_ASCII.slice(0, asciiVisibleChars);
  const canvasFontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  // Handle click on canvas to determine which button was clicked
  const handleCanvasClick = (e: React.MouseEvent<HTMLPreElement>) => {
    if (!boxDone) {
      skipAnimation();
      return;
    }

    // Get click position relative to the pre element
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Approximate character width and height
    const charWidth = rect.width / boxWidth;
    const charHeight = rect.height / boxHeight;

    const charX = Math.floor(clickX / charWidth);
    const charY = Math.floor(clickY / charHeight);

    // Check if click is within skip button bounds
    if (charY >= plan.btnY && charY < plan.btnY + plan.btnHeight) {
      if (charX >= plan.skipBtnX && charX < plan.skipBtnX + plan.skipBtnWidth) {
        onSkip();
        return;
      }
      if (charX >= plan.tryBtnX && charX < plan.tryBtnX + plan.tryBtnWidth) {
        onContinue();
        return;
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/5 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget && !boxDone) {
          skipAnimation();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Safari compatibility warning"
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
          className="text-terminal-yellow text-[8px] md:text-[10px] font-mono leading-tight mb-4 whitespace-pre select-none"
          style={{ fontFamily: canvasFontFamily }}
          onClick={() => !boxDone && skipAnimation()}
        >
          {visibleAscii}
          {!asciiDone && <span className="animate-pulse">█</span>}
        </pre>

        {/* Box with content - only show after ASCII is done */}
        {asciiDone && (
          <pre
            className={`select-none whitespace-pre leading-[1.05] text-terminal-green text-sm md:text-base text-left ${boxDone ? 'cursor-pointer' : 'cursor-default'}`}
            style={{ fontFamily: canvasFontFamily, lineHeight: `${lineHeightEm}em` }}
            onClick={handleCanvasClick}
          >
            {canvas.join('\n')}
          </pre>
        )}

        {/* Keyboard hints */}
        {boxDone && (
          <div className="mt-4 text-terminal-green/60 text-xs font-mono">
            [ENTER] SKIP LEVEL | [ESC] TRY ANYWAY
          </div>
        )}
      </div>
    </div>
  );
};
