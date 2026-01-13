import { useEffect, useMemo, useRef, useState } from 'react';
import { TERMINAL_PROMPT_LAYOUT } from './terminalPromptLayout';

/**
 * Hook to calculate dynamic prompt box width based on container size.
 * Returns a ref to attach to the container and the calculated box width in characters.
 *
 * Note: We only measure once to avoid Safari's ResizeObserver issues with CSS transforms
 * (CRT curvature effects can cause layout recalculations that trigger repeated observer fires).
 */
export function useDynamicBoxWidth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const hasMeasuredRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const measure = () => {
      if (!containerRef.current) return;
      // Only measure once to avoid Safari's ResizeObserver oscillation with transforms
      if (hasMeasuredRef.current) return;
      hasMeasuredRef.current = true;
      setMeasuredWidth(containerRef.current.clientWidth);
    };

    // Try to measure immediately
    measure();

    // Also observe in case the container isn't ready yet
    const resizeObserver = new ResizeObserver(() => {
      if (!hasMeasuredRef.current) {
        measure();
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  const boxWidth = useMemo(() => {
    if (measuredWidth === null) return TERMINAL_PROMPT_LAYOUT.boxWidth;
    // Subtract container padding and add safety buffer
    // Container has p-3 (12px) + parent containers may have additional padding
    const paddingOffset = 48;
    const availableWidth = measuredWidth - paddingOffset;
    // Use slightly larger char width estimate to be safe (accounts for font rendering variations)
    const approxCharWidth = 8.5;
    const charsAvailable = Math.floor(availableWidth / approxCharWidth);
    return Math.max(
      TERMINAL_PROMPT_LAYOUT.minBoxWidth,
      Math.min(charsAvailable, TERMINAL_PROMPT_LAYOUT.boxWidth)
    );
  }, [measuredWidth]);

  return { containerRef, boxWidth };
}
