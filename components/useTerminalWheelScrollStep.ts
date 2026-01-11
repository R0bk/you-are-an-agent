import { useEffect, useRef } from 'react';

type Options = {
  /** How many lines to move per discrete step. Defaults to 1. */
  linesPerStep?: number;
};

function getLineHeightPx(el: HTMLElement) {
  const cs = window.getComputedStyle(el);
  const lh = cs.lineHeight;
  if (lh && lh.endsWith('px')) {
    const v = Number.parseFloat(lh);
    if (Number.isFinite(v) && v > 0) return v;
  }
  const fs = Number.parseFloat(cs.fontSize || '16');
  // Reasonable fallback for "normal"
  return (Number.isFinite(fs) && fs > 0 ? fs : 16) * 1.2;
}

/**
 * Terminal-style wheel scrolling:
 * - Quantizes mouse/trackpad wheel deltas into fixed line-height steps
 * - Does NOT interfere with touch scrolling (no wheel events)
 */
export function useTerminalWheelScrollStep(
  ref: React.RefObject<HTMLElement | null>,
  options: Options = {}
) {
  const remainderRef = useRef(0);
  const linesPerStep = options.linesPerStep ?? 1;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If the platform doesn't support wheel, do nothing.
    if (typeof window === 'undefined') return;

    const onWheel = (e: WheelEvent) => {
      // Only handle vertical wheel.
      if (e.deltaY === 0) return;

      // If user is holding ctrl/meta (e.g. zoom), don't interfere.
      if (e.ctrlKey || e.metaKey) return;

      const linePx = getLineHeightPx(el as HTMLElement) * linesPerStep;
      if (!Number.isFinite(linePx) || linePx <= 0) return;

      // Convert delta to pixels.
      let deltaPx = e.deltaY;
      if (e.deltaMode === 1) deltaPx = e.deltaY * linePx; // DOM_DELTA_LINE
      else if (e.deltaMode === 2) deltaPx = e.deltaY * el.clientHeight; // DOM_DELTA_PAGE

      // Accumulate small deltas (trackpads) and quantize to steps.
      const acc = remainderRef.current + deltaPx;
      const steps = Math.trunc(acc / linePx);
      if (steps === 0) {
        remainderRef.current = acc;
        e.preventDefault();
        return;
      }

      remainderRef.current = acc - steps * linePx;
      el.scrollTop += steps * linePx;
      e.preventDefault();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel as any);
  }, [ref, linesPerStep]);
}



