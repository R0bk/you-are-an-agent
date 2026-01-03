export type Canvas = string[];

export const TERMINAL_PROMPT_LAYOUT = {
  // Box size (including borders)
  boxWidth: 78,
  boxHeight: 8, // taller to fit a 3-line button inside the box

  // Canvas size (lines rendered in <pre>)
  canvasWidth: 96,
  canvasHeight: 8 + 2, // boxHeight + a little breathing room

  // Typography mapping used for overlay math
  // Keep this tight so unicode box-drawing strokes connect between rows.
  lineHeightEm: 1.05,

  // UI affordances
  // (Arrow is now inside the button)
  arrowText: '',
  generateLabel: '',
  generateIcon: '↑',
  generateButtonHeight: 3,
} as const;

const BOX = {
  tl: '┌',
  tr: '┐',
  bl: '└',
  br: '┘',
  h: '─',
  v: '│',
} as const;

const BTN = {
  tl: '┏',
  tr: '┓',
  bl: '┗',
  br: '┛',
  h: '━',
  v: '┃',
} as const;

export function makeBlankCanvas(width: number, height: number): Canvas {
  const line = ' '.repeat(width);
  return Array.from({ length: height }, () => line);
}

export function setCanvasChar(canvas: Canvas, x: number, y: number, ch: string): Canvas {
  if (y < 0 || y >= canvas.length) return canvas;
  const line = canvas[y];
  if (x < 0 || x >= line.length) return canvas;
  return canvas.map((l, idx) => {
    if (idx !== y) return l;
    return l.slice(0, x) + ch + l.slice(x + 1);
  });
}

export function buildGenerateButtonLines(label: string, icon: string) {
  // 3-line “button” using box drawing:
  // ┏━━━━━━━━━━━━┓
  // ┃ ↑ GENERATE ┃
  // ┗━━━━━━━━━━━━┛
  const inner = label && label.trim().length > 0 ? ` ${icon} ${label} ` : ` ${icon} `;
  const top = `${BTN.tl}${BTN.h.repeat(inner.length)}${BTN.tr}`;
  const mid = `${BTN.v}${inner}${BTN.v}`;
  const bot = `${BTN.bl}${BTN.h.repeat(inner.length)}${BTN.br}`;
  return { lines: [top, mid, bot], width: top.length, height: 3 };
}

export function computeGenerateButtonStartX(boxWidth: number, buttonWidth: number) {
  // Place inside the box (inner area), right-aligned with 1-char inner padding.
  // Inner area is x=1..boxWidth-2
  const innerRight = boxWidth - 2;
  const start = innerRight - buttonWidth + 1;
  return Math.max(1, start);
}

export function buildPromptOutlineOps(
  boxWidth: number,
  boxHeight: number
) {
  // Unicode box drawing, drawn clockwise.
  const ops: Array<{ x: number; y: number; ch: string; kind: 'corner' | 'edge' }> = [];
  const w = Math.max(4, boxWidth);
  const h = Math.max(3, boxHeight);

  // Top-left corner
  ops.push({ x: 0, y: 0, ch: BOX.tl, kind: 'corner' });
  // Top edge
  for (let x = 1; x < w - 1; x++) {
    ops.push({ x, y: 0, ch: BOX.h, kind: 'edge' });
  }
  // Top-right corner
  ops.push({ x: w - 1, y: 0, ch: BOX.tr, kind: 'corner' });
  // Right edge
  for (let y = 1; y < h - 1; y++) ops.push({ x: w - 1, y, ch: BOX.v, kind: 'edge' });
  // Bottom-right corner
  ops.push({ x: w - 1, y: h - 1, ch: BOX.br, kind: 'corner' });
  // Bottom edge (right -> left)
  for (let x = w - 2; x >= 1; x--) ops.push({ x, y: h - 1, ch: BOX.h, kind: 'edge' });
  // Bottom-left corner
  ops.push({ x: 0, y: h - 1, ch: BOX.bl, kind: 'corner' });
  // Left edge (bottom -> top)
  for (let y = h - 2; y >= 1; y--) ops.push({ x: 0, y, ch: BOX.v, kind: 'edge' });

  return { ops, w, h };
}

export function buildFinalPromptCanvasText() {
  const cfg = TERMINAL_PROMPT_LAYOUT;
  const { ops: outlineOps, h } = buildPromptOutlineOps(cfg.boxWidth, cfg.boxHeight);

  let canvas = makeBlankCanvas(cfg.canvasWidth, cfg.canvasHeight);

  // Draw outline
  for (const o of outlineOps) canvas = setCanvasChar(canvas, o.x, o.y, o.ch);

  // Draw 3-line unicode “button” inside the box (bottom-right).
  const btn = buildGenerateButtonLines(cfg.generateLabel, cfg.generateIcon);
  const buttonX = computeGenerateButtonStartX(cfg.boxWidth, btn.width);
  const bottomInnerY = h - 2; // last inner row
  const topY = bottomInnerY - (btn.height - 1);
  for (let row = 0; row < btn.lines.length; row++) {
    const line = btn.lines[row];
    for (let i = 0; i < line.length; i++) {
      canvas = setCanvasChar(canvas, buttonX + i, topY + row, line[i]);
    }
  }

  return canvas.join('\n');
}


