import { useEffect, useMemo, useRef, useState } from 'react';
import { TERMINAL_PROMPT_LAYOUT } from './terminalPromptLayout';

/**
 * Hook to calculate dynamic prompt box width based on viewport size.
 * Returns a ref for layout consistency and the calculated box width in characters.
 *
 * Uses window.innerWidth instead of ResizeObserver on the container to avoid
 * Safari issues where CSS transforms (CRT curvature) cause ResizeObserver
 * to fire repeatedly during layout recalculations.
 */
export function useDynamicBoxWidth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const boxWidth = useMemo(() => {
    // Estimate container width from viewport (accounts for page padding, max-width constraints)
    // The main container has max-w-7xl (1280px) and p-2/p-4 padding
    const maxContainerWidth = Math.min(viewportWidth, 1280);
    const containerPadding = viewportWidth < 768 ? 16 : 32; // p-2 vs p-4
    const promptBoxPadding = viewportWidth < 768 ? 48 : 48; // p-3 vs p-4
    const availableWidth = maxContainerWidth - containerPadding - promptBoxPadding;

    // Convert to character count (monospace at text-sm is ~8.5px per char)
    const approxCharWidth = 8.5;
    const charsAvailable = Math.floor(availableWidth / approxCharWidth);

    return Math.max(
      TERMINAL_PROMPT_LAYOUT.minBoxWidth,
      Math.min(charsAvailable, TERMINAL_PROMPT_LAYOUT.boxWidth)
    );
  }, [viewportWidth]);

  return { containerRef, boxWidth };
}
