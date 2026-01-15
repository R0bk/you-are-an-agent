import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DEBRIEF_URL } from '../constants';
import { buildPromptOutlineOps, makeBlankCanvas, setCanvasChar, buildGenerateButtonLines } from './terminalPromptLayout';
import { CRTDisplacementMapDefs } from './CRTDisplacementMapDefs';

type Canvas = string[];

interface DebriefViewProps {
  phase: 1 | 2;
  onContinue: () => void;
  crtUiWarp2d?: number;
}

// Block-style ASCII art for "PHASE 2 UNLOCKED"
const PHASE2_ASCII = `
██████╗ ██╗  ██╗ █████╗ ███████╗███████╗    ██████╗
██╔══██╗██║  ██║██╔══██╗██╔════╝██╔════╝    ╚════██╗
██████╔╝███████║███████║███████╗█████╗       █████╔╝
██╔═══╝ ██╔══██║██╔══██║╚════██║██╔══╝      ██╔═══╝
██║     ██║  ██║██║  ██║███████║███████╗    ███████╗
╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝    ╚══════╝

██╗   ██╗███╗   ██╗██╗      ██████╗  ██████╗██╗  ██╗███████╗██████╗
██║   ██║████╗  ██║██║     ██╔═══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗
██║   ██║██╔██╗ ██║██║     ██║   ██║██║     █████╔╝ █████╗  ██║  ██║
██║   ██║██║╚██╗██║██║     ██║   ██║██║     ██╔═██╗ ██╔══╝  ██║  ██║
╚██████╔╝██║ ╚████║███████╗╚██████╔╝╚██████╗██║  ██╗███████╗██████╔╝
 ╚═════╝ ╚═╝  ╚═══╝╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═════╝
`.trim();

// Block-style ASCII art for "PHASE 3 UNLOCKED"
const PHASE3_ASCII = `
██████╗ ██╗  ██╗ █████╗ ███████╗███████╗    ██████╗
██╔══██╗██║  ██║██╔══██╗██╔════╝██╔════╝    ╚════██╗
██████╔╝███████║███████║███████╗█████╗       █████╔╝
██╔═══╝ ██╔══██║██╔══██║╚════██║██╔══╝       ╚═══██╗
██║     ██║  ██║██║  ██║███████║███████╗    ██████╔╝
╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝    ╚═════╝

██╗   ██╗███╗   ██╗██╗      ██████╗  ██████╗██╗  ██╗███████╗██████╗
██║   ██║████╗  ██║██║     ██╔═══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗
██║   ██║██╔██╗ ██║██║     ██║   ██║██║     █████╔╝ █████╗  ██║  ██║
██║   ██║██║╚██╗██║██║     ██║   ██║██║     ██╔═██╗ ██╔══╝  ██║  ██║
╚██████╔╝██║ ╚████║███████╗╚██████╔╝╚██████╗██║  ██╗███████╗██████╔╝
 ╚═════╝ ╚═╝  ╚═══╝╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═════╝
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

export const DebriefView: React.FC<DebriefViewProps> = ({ phase, onContinue, crtUiWarp2d = 0 }) => {
  const boxWidth = 40;
  const boxHeight = 21;
  const lineHeightEm = 1.05;

  // Select ASCII art based on phase (phase 1 shows "Phase 2 Unlocked", phase 2 shows "Phase 3 Unlocked")
  const asciiArt = phase === 1 ? PHASE2_ASCII : PHASE3_ASCII;

  // ASCII art animation state
  const [asciiVisibleChars, setAsciiVisibleChars] = useState(0);
  const [asciiDone, setAsciiDone] = useState(false);

  // Box animation state
  const [canvas, setCanvas] = useState<Canvas>(() => makeBlankCanvas(boxWidth, boxHeight));
  const [boxStep, setBoxStep] = useState(0);
  const [boxDone, setBoxDone] = useState(false);

  const skipRef = useRef(false);
  const totalAsciiChars = asciiArt.length;

  const handleOpenDebrief = () => {
    window.open(DEBRIEF_URL, '_blank', 'noopener,noreferrer');
  };

  const plan = useMemo(() => {
    const { ops: outlineOps } = buildPromptOutlineOps(boxWidth, boxHeight);
    const all: Array<{ x: number; y: number; ch: string; kind: 'corner' | 'edge' }> = [...outlineOps];

    const innerWidth = boxWidth - 2;

    // Content varies by phase
    if (phase === 1) {
      // Phase 1 debrief: Preview Phase 2 capabilities
      const header = 'NEW CAPABILITIES:';
      pushTextOps(all, 2, 2, header);

      const capabilities = [
        '[+] Desktop Control',
        '[+] Mouse & Keyboard Input',
        '[+] Real Linux VM',
        '[+] MCP Server Access',
      ];

      let y = 4;
      for (const cap of capabilities) {
        pushTextOps(all, 3, y, clampText(cap, innerWidth - 4));
        y++;
      }

      // Progress bar (28% = 2 of 7 levels)
      const progressLabel = '28%';
      const barWidth = innerWidth - 8;
      const filledWidth = Math.floor(barWidth * 0.28);
      const emptyWidth = barWidth - filledWidth;
      const progressBar = '[' + '='.repeat(filledWidth) + ' '.repeat(emptyWidth) + ']';

      y = 10;
      const barX = 1 + Math.floor((innerWidth - progressBar.length) / 2);
      pushTextOps(all, barX, y, progressBar);
      pushTextOps(all, barX + progressBar.length - 4, y - 1, progressLabel);
    } else {
      // Phase 2 debrief: Preview Phase 3 challenges
      const header = 'FINAL CHALLENGES:';
      pushTextOps(all, 2, 2, header);

      const capabilities = [
        '[!] Alignment Tests',
        '[!] Adversarial Prompts',
        '[!] The Limits of AI',
        '[!] Can You Pass?',
      ];

      let y = 4;
      for (const cap of capabilities) {
        pushTextOps(all, 3, y, clampText(cap, innerWidth - 4));
        y++;
      }

      // Progress bar (71% = 5 of 7 levels)
      const progressLabel = '71%';
      const barWidth = innerWidth - 8;
      const filledWidth = Math.floor(barWidth * 0.71);
      const emptyWidth = barWidth - filledWidth;
      const progressBar = '[' + '='.repeat(filledWidth) + ' '.repeat(emptyWidth) + ']';

      y = 10;
      const barX = 1 + Math.floor((innerWidth - progressBar.length) / 2);
      pushTextOps(all, barX, y, progressBar);
      pushTextOps(all, barX + progressBar.length - 4, y - 1, progressLabel);
    }

    // Continue button (centered, primary)
    const continueBtn = buildGenerateButtonLines('CONTINUE', '->');
    const continueBtnX = 1 + Math.max(0, Math.floor((innerWidth - continueBtn.width) / 2));
    const continueBtnY = boxHeight - 6;
    for (let row = 0; row < continueBtn.lines.length; row++) {
      const line = continueBtn.lines[row];
      for (let i = 0; i < line.length; i++) {
        all.push({ x: continueBtnX + i, y: continueBtnY + row, ch: line[i], kind: 'edge' });
      }
    }

    // Article teaser + link (centered, secondary) - only on phase 1
    let teaserX = 0;
    let teaserWidth = 0;
    let learnMoreX = 0;
    let learnMoreWidth = 0;
    const learnMoreY = boxHeight - 2;

    if (phase === 1) {
      const teaserText = 'Feel that friction? So do agents.';
      teaserX = 1 + Math.max(0, Math.floor((innerWidth - teaserText.length) / 2));
      teaserWidth = teaserText.length;
      pushTextOps(all, teaserX, boxHeight - 4, teaserText);

      const articleLink = '[READ: WHAT IS AX?]';
      learnMoreX = 1 + Math.max(0, Math.floor((innerWidth - articleLink.length) / 2));
      learnMoreWidth = articleLink.length;
      pushTextOps(all, learnMoreX, learnMoreY, articleLink);
    } else {
      const teaserText = 'Think you can beat these?';
      teaserX = 1 + Math.max(0, Math.floor((innerWidth - teaserText.length) / 2));
      teaserWidth = teaserText.length;
      pushTextOps(all, teaserX, boxHeight - 4, teaserText);

      const articleLink = '[PROVE IT]';
      learnMoreX = 1 + Math.max(0, Math.floor((innerWidth - articleLink.length) / 2));
      learnMoreWidth = articleLink.length;
      pushTextOps(all, learnMoreX, learnMoreY, articleLink);
    }

    return {
      ops: all,
      learnMoreX,
      learnMoreWidth,
      teaserX,
      teaserWidth,
      teaserY: boxHeight - 4,
      learnMoreY,
      continueBtnX,
      continueBtnWidth: continueBtn.width,
      continueBtnY,
      btnHeight: continueBtn.height,
    };
  }, [boxWidth, boxHeight, phase]);

  // Phase 1: Animate ASCII art
  useEffect(() => {
    if (skipRef.current) return;
    if (asciiDone) return;
    if (asciiVisibleChars >= totalAsciiChars) {
      setAsciiDone(true);
      return;
    }

    const char = asciiArt[asciiVisibleChars];
    let delay = 4;
    if (char === ' ') delay = 1;
    else if (char === '\n') delay = 8;
    else if (/[█▓▒░╔╗╚╝║═╠╣╦╩╬]/.test(char)) delay = 3;

    const t = setTimeout(() => {
      setAsciiVisibleChars(v => v + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [asciiVisibleChars, totalAsciiChars, asciiDone]);

  // Phase 2: Animate box (after ASCII art is done)
  useEffect(() => {
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
  }, [asciiDone, boxDone, boxStep, plan.ops]);

  // Skip animation handler
  const skip = () => {
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
  }, [boxDone, onContinue]);

  const filterId = 'crtWarp2d-debrief';
  const visibleAscii = asciiArt.slice(0, asciiVisibleChars);
  const canvasFontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  // Handle click on canvas to determine which button was clicked
  const handleCanvasClick = (e: React.MouseEvent<HTMLPreElement>) => {
    if (!boxDone) {
      skip();
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

    // Check if click is within continue button bounds (primary action)
    if (charY >= plan.continueBtnY && charY < plan.continueBtnY + plan.btnHeight) {
      if (charX >= plan.continueBtnX && charX < plan.continueBtnX + plan.continueBtnWidth) {
        onContinue();
        return;
      }
    }
    // Check if click is within teaser text bounds
    if (charY === plan.teaserY) {
      if (charX >= plan.teaserX && charX < plan.teaserX + plan.teaserWidth) {
        if (phase === 1) {
          handleOpenDebrief();
        } else {
          onContinue(); // Phase 2: "PROVE IT" just continues
        }
        return;
      }
    }
    // Check if click is within article link bounds
    if (charY === plan.learnMoreY) {
      if (charX >= plan.learnMoreX && charX < plan.learnMoreX + plan.learnMoreWidth) {
        if (phase === 1) {
          handleOpenDebrief();
        } else {
          onContinue(); // Phase 2: "PROVE IT" just continues
        }
        return;
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/5 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget && !boxDone) {
          skip();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Phase 1 complete"
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
          <pre
            className={`select-none whitespace-pre leading-[1.05] text-terminal-green text-sm md:text-base text-left ${boxDone ? 'cursor-pointer' : 'cursor-default'}`}
            style={{ fontFamily: canvasFontFamily, lineHeight: `${lineHeightEm}em` }}
            onClick={handleCanvasClick}
          >
            {canvas.join('\n')}
          </pre>
        )}
      </div>
    </div>
  );
};
