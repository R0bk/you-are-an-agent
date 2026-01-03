import React, { useMemo } from 'react';
import {
  TERMINAL_PROMPT_LAYOUT,
  buildFinalPromptCanvasText,
  buildGenerateButtonLines,
  computeGenerateButtonStartX,
} from './terminalPromptLayout';

interface TerminalPromptBoxInputProps {
  /** Full canvas text (lines joined with \n). If omitted, a fully-drawn default box is used. */
  canvasText?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  hint?: string;
  tokenCount?: number;
  variant?: 'classic' | 'minimal';
}

type Canvas = string[];

function makeBlankCanvas(width: number, height: number): Canvas {
  const line = ' '.repeat(width);
  return Array.from({ length: height }, () => line);
}

function setCanvasChar(canvas: Canvas, x: number, y: number, ch: string): Canvas {
  if (y < 0 || y >= canvas.length) return canvas;
  const line = canvas[y];
  if (x < 0 || x >= line.length) return canvas;
  return canvas.map((l, idx) => {
    if (idx !== y) return l;
    return l.slice(0, x) + ch + l.slice(x + 1);
  });
}

function buildDefaultCanvasText() {
  return buildFinalPromptCanvasText();
}

export const TerminalPromptBoxInput: React.FC<TerminalPromptBoxInputProps> = ({
  canvasText,
  value,
  onChange,
  onSubmit,
  onKeyDown,
  placeholder,
  disabled = false,
  textareaRef,
  hint,
  tokenCount,
  variant = 'classic',
}) => {
  // Must match the “grid” assumptions used when drawing the box.
  const boxWidth = TERMINAL_PROMPT_LAYOUT.boxWidth;
  const boxHeight = TERMINAL_PROMPT_LAYOUT.boxHeight;

  // Layout offsets (top-left of box in the canvas)
  const boxOriginX = 0;
  const boxOriginY = 0;

  // Inner padding: 1 char inset from border
  const innerX = boxOriginX + 1;
  const innerY = boxOriginY + 1;
  const innerWidth = boxWidth - 2;
  const innerHeight = boxHeight - 2;

  const effectiveCanvas = useMemo(() => canvasText ?? buildDefaultCanvasText(), [canvasText]);

  // A stable line-height so 1 “row” maps cleanly to em units.
  const lineHeight = TERMINAL_PROMPT_LAYOUT.lineHeightEm; // em

  // JetBrains Mono is great, but its box-drawing glyphs can visually misalign at some sizes.
  // Render the canvas (<pre>) with a "boring" system monospace stack for crisp box borders.
  const canvasFontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const btn = buildGenerateButtonLines(
    TERMINAL_PROMPT_LAYOUT.generateLabel,
    TERMINAL_PROMPT_LAYOUT.generateIcon
  );

  const textareaStyle: React.CSSProperties = {
    position: 'absolute',
    left: `calc(${innerX} * 1ch)`,
    top: `calc(${innerY} * ${lineHeight}em)`,
    width: `calc(${Math.max(0, innerWidth)} * 1ch)`,
    // Let the input span the full box interior height so it matches the visible prompt box.
    // We add padding so text won't sit under the bottom-right button.
    height: `calc(${innerHeight} * ${lineHeight}em)`,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    resize: 'none',
    padding: '8px',
    boxSizing: 'border-box',
    paddingRight: `calc(${btn.width + 1} * 1ch)`,
    paddingBottom: `calc(${btn.height} * ${lineHeight}em)`,
    margin: 0,
    color: 'inherit',
    font: 'inherit',
    lineHeight: `${lineHeight}em`,
  };

  // Button overlay: matches the top-right label on the TOP border.
  const buttonX = computeGenerateButtonStartX(boxWidth, btn.width);
  const bottomInnerY = boxHeight - 2;
  const buttonY = bottomInnerY - (btn.height - 1); // top line of the 3-line button

  const buttonStyle: React.CSSProperties = {
    position: 'absolute',
    left: `calc(${buttonX} * 1ch)`,
    top: `calc(${buttonY} * ${lineHeight}em)`,
    width: `calc(${btn.width} * 1ch)`,
    height: `calc(${btn.height} * ${lineHeight}em)`,
    background: 'transparent',
    border: 'none',
    padding: 0,
    margin: 0,
    cursor: disabled ? 'not-allowed' : 'pointer',
    // Keep the “drawn” text visible from the canvas; this element is just for interaction.
    color: 'transparent',
  };

  if (variant === 'minimal') {
    // Match the intro prompt box exactly: just the grid + interactive overlays.
    return (
      <div className="shrink-0 z-20 bg-transparent border-t border-zinc-800 p-3 md:p-4 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
        {/* Prompt header (appears above the box after the intro) */}
        <div className="flex items-center justify-between text-xs md:text-sm font-mono select-none opacity-80 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-600">&lt;|start|&gt;</span>
            <span className="text-zinc-400">assistant</span>
            <span className="text-zinc-600">&lt;|channel|&gt;</span>
            <span className="text-zinc-300">final</span>
            <span className="text-zinc-600">&lt;|message|&gt;</span>
          </div>
          {typeof tokenCount === 'number' && (
            <span className="text-zinc-500 tabular-nums">{tokenCount} TOKENS</span>
          )}
        </div>
        <div
          className="relative font-mono text-terminal-green text-sm"
          style={{ lineHeight: `${TERMINAL_PROMPT_LAYOUT.lineHeightEm}em` }}
        >
          <pre
            className="whitespace-pre overflow-x-auto overflow-y-hidden"
            style={{ fontFamily: canvasFontFamily }}
          >
            {effectiveCanvas}
          </pre>

          <textarea
            ref={textareaRef as any}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            disabled={disabled}
            className="caret-terminal-green placeholder-zinc-700/50 selection:bg-terminal-green/30 selection:text-terminal-green"
            style={textareaStyle}
          />

          <button
            type="button"
            aria-label="Generate"
            onClick={onSubmit}
            disabled={disabled}
            style={buttonStyle}
            className="focus:outline-none focus:ring-2 focus:ring-terminal-green/60 rounded-sm"
          >
            GENERATE
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 z-20 bg-transparent border-t border-zinc-800 p-3 md:p-4 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
      <div className="relative flex flex-col gap-2">
        {/* Prompt Tags */}
        <div className="flex items-center justify-between text-xs md:text-sm font-mono select-none opacity-80">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-600">&lt;|start|&gt;</span>
            <span className="text-zinc-400">assistant</span>
            <span className="text-zinc-600">&lt;|channel|&gt;</span>
            <span className="text-zinc-300">final</span>
            <span className="text-zinc-600">&lt;|message|&gt;</span>
          </div>
          {typeof tokenCount === 'number' && (
            <span className="text-zinc-500 tabular-nums">{tokenCount} TOKENS</span>
          )}
        </div>

        <div
          className="relative font-mono text-terminal-green text-sm"
          style={{ lineHeight: `${TERMINAL_PROMPT_LAYOUT.lineHeightEm}em` }}
        >
          <pre
            className="whitespace-pre overflow-x-auto overflow-y-hidden"
            style={{ fontFamily: canvasFontFamily }}
          >
            {effectiveCanvas}
          </pre>

          <textarea
            ref={textareaRef as any}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            spellCheck={false}
            disabled={disabled}
            className="caret-terminal-green placeholder-zinc-700/50 selection:bg-terminal-green/30 selection:text-terminal-green"
            style={textareaStyle}
          />

          <button
            type="button"
            aria-label="Generate"
            onClick={onSubmit}
            disabled={disabled}
            style={buttonStyle}
            className="focus:outline-none focus:ring-2 focus:ring-terminal-green/60 rounded-sm"
          >
            GENERATE
          </button>
        </div>

        <div className="flex justify-between items-center border-t border-white/10 pt-2">
          <div className="flex items-center gap-2 overflow-hidden flex-1">
            {hint && (
              <span className="text-[10px] text-zinc-500 font-mono truncate">
                Hint: {hint}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


