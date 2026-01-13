import React, { useMemo } from 'react';
import {
  TERMINAL_PROMPT_LAYOUT,
  buildFinalPromptCanvasText,
  buildGenerateButtonLines,
  computeGenerateButtonStartX,
} from './terminalPromptLayout';
import { useDynamicBoxWidth } from './useDynamicBoxWidth';

interface TerminalPromptBoxInputProps {
  /** Full canvas text (lines joined with \n). If omitted, a fully-drawn default box is used. */
  canvasText?: string;
  /** If canvasText is provided, also provide the boxWidth used to generate it */
  canvasBoxWidth?: number;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  hint?: string;
  tokenCount?: number;
}


export const TerminalPromptBoxInput: React.FC<TerminalPromptBoxInputProps> = ({
  canvasText,
  canvasBoxWidth,
  value,
  onChange,
  onSubmit,
  onKeyDown,
  placeholder,
  disabled = false,
  textareaRef,
  hint,
  tokenCount,
}) => {
  const { containerRef, boxWidth: calculatedBoxWidth } = useDynamicBoxWidth();

  // Build canvas with dynamic width (or use provided canvasText)
  const { effectiveCanvas, boxWidth } = useMemo(() => {
    if (canvasText) {
      return {
        effectiveCanvas: canvasText,
        boxWidth: canvasBoxWidth ?? TERMINAL_PROMPT_LAYOUT.boxWidth,
      };
    }
    const result = buildFinalPromptCanvasText(calculatedBoxWidth);
    return {
      effectiveCanvas: result.canvasText,
      boxWidth: result.boxWidth,
    };
  }, [canvasText, canvasBoxWidth, calculatedBoxWidth]);

  const boxHeight = TERMINAL_PROMPT_LAYOUT.boxHeight;
  // A stable line-height so 1 "row" maps cleanly to em units
  const lineHeight = TERMINAL_PROMPT_LAYOUT.lineHeightEm;

  // Layout offsets (top-left of box in the canvas)
  const boxOriginX = 0;
  const boxOriginY = 0;

  // Inner padding: 1 char inset from border
  const innerX = boxOriginX + 1;
  const innerY = boxOriginY + 1;
  const innerWidth = boxWidth - 2;
  const innerHeight = boxHeight - 2;

  const btn = buildGenerateButtonLines(
    TERMINAL_PROMPT_LAYOUT.generateLabel,
    TERMINAL_PROMPT_LAYOUT.generateIcon
  );

  // Textarea is positioned absolutely over the ASCII box canvas.
  // We use character units (ch) for horizontal and em for vertical positioning
  // to align precisely with the monospace grid.
  const textareaStyle: React.CSSProperties = {
    position: 'absolute',
    left: `calc(${innerX} * 1ch)`,
    top: `calc(${innerY} * ${lineHeight}em)`,
    width: `calc(${Math.max(0, innerWidth)} * 1ch)`,
    // Span the full box interior height so it matches the visible prompt box
    // We add padding so text won't sit under the bottom-right button.
    height: `calc(${innerHeight} * ${lineHeight}em)`,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    resize: 'none',
    padding: '8px',
    boxSizing: 'border-box',
    // Add padding so text won't sit under the bottom-right button
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

  return (
    <div
      ref={containerRef}
      className="relative shrink-0 font-mono text-terminal-green text-sm"
      style={{ lineHeight: `${lineHeight}em` }}
    >
      <pre className="whitespace-pre overflow-hidden terminal-canvas-font">
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
  );
};
