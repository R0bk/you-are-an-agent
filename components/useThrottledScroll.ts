import { useEffect, useRef, useState, useCallback } from 'react';

interface ScrollState {
  scrollY: number;
  scrollHeight: number;
}

interface UseThrottledScrollOptions {
  /** Max updates per second (default: 20) */
  maxFps?: number;
  /** Callback on each throttled scroll update */
  onScroll?: (state: ScrollState) => void;
  /** Set to false to disable scroll tracking (e.g., during animations) */
  enabled?: boolean;
  /** Prevent scrolling past content boundaries */
  preventOverscroll?: boolean;
  /**
   * Use transform-based scrolling instead of native scroll.
   * This synchronizes content movement with filter updates to prevent jank.
   * When enabled, the element should have `overflow: hidden` (will be set automatically).
   */
  useTransformScroll?: boolean;
}

interface ScrollbarInfo {
  /** Whether to show custom scrollbar (true when useTransformScroll and content overflows) */
  show: boolean;
  /** Thumb height as percentage (0-100) */
  thumbHeightPercent: number;
  /** Thumb top position as percentage (0-100) */
  thumbTopPercent: number;
  /** Container height in pixels */
  containerHeight: number;
  /** Handler for scrollbar track clicks - scrolls to clicked position */
  onTrackClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Props to spread on the thumb for drag handling */
  thumbProps: {
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  };
}

interface UseThrottledScrollReturn extends ScrollState {
  /** CSS transform to apply to content container when useTransformScroll is true */
  contentStyle: React.CSSProperties;
  /** Scroll to a specific position programmatically */
  scrollTo: (y: number) => void;
  /** Info for rendering custom scrollbar when useTransformScroll is true */
  scrollbar: ScrollbarInfo;
}

/**
 * Hook that tracks scroll position with throttling to limit updates per second.
 * Optionally uses transform-based scrolling for synchronized filter updates.
 */
export function useThrottledScroll(
  scrollRef: React.RefObject<HTMLElement | null>,
  options: UseThrottledScrollOptions = {}
): UseThrottledScrollReturn {
  const {
    maxFps = 20,
    onScroll,
    enabled = true,
    preventOverscroll = false,
    useTransformScroll = false,
  } = options;
  const throttleMs = 1000 / maxFps;

  const [state, setState] = useState<ScrollState>({ scrollY: 0, scrollHeight: 0 });
  const [containerHeight, setContainerHeight] = useState(0);
  const lastUpdateTimeRef = useRef(0);
  const pendingUpdateRef = useRef<number | null>(null);

  // For transform-based scrolling, track position in ref for immediate use
  const transformScrollYRef = useRef(0);

  // Store callback in ref to avoid re-running effect when callback changes
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;

  // Programmatic scroll function
  const scrollTo = useCallback((y: number) => {
    const el = scrollRef.current;
    if (!el) return;

    if (useTransformScroll) {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      const clampedY = Math.max(0, Math.min(maxScroll, y));
      transformScrollYRef.current = clampedY;
      setState({ scrollY: clampedY, scrollHeight: el.scrollHeight });
      onScrollRef.current?.({ scrollY: clampedY, scrollHeight: el.scrollHeight });
    } else {
      el.scrollTop = y;
    }
  }, [scrollRef, useTransformScroll]);

  // Native scroll effect
  useEffect(() => {
    if (useTransformScroll) return; // Skip native scroll handling

    const el = scrollRef.current;
    if (!el || !enabled) return;

    const doUpdate = () => {
      const newState = {
        scrollY: el.scrollTop,
        scrollHeight: el.scrollHeight,
      };
      setState(newState);
      onScrollRef.current?.(newState);
      lastUpdateTimeRef.current = Date.now();
    };

    const handleScroll = () => {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

      if (timeSinceLastUpdate >= throttleMs) {
        if (pendingUpdateRef.current) {
          cancelAnimationFrame(pendingUpdateRef.current);
          pendingUpdateRef.current = null;
        }
        doUpdate();
      } else if (!pendingUpdateRef.current) {
        pendingUpdateRef.current = requestAnimationFrame(() => {
          pendingUpdateRef.current = null;
          doUpdate();
        });
      }
    };

    doUpdate();

    const handleWheel = (e: WheelEvent) => {
      if (!preventOverscroll) return;

      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop >= maxScroll;

      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        e.preventDefault();
      }
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    if (preventOverscroll) {
      el.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (preventOverscroll) {
        el.removeEventListener('wheel', handleWheel);
      }
      if (pendingUpdateRef.current) {
        cancelAnimationFrame(pendingUpdateRef.current);
      }
    };
  }, [scrollRef, throttleMs, enabled, preventOverscroll, useTransformScroll]);

  // Transform-based scroll effect
  useEffect(() => {
    if (!useTransformScroll) return;

    const el = scrollRef.current;
    if (!el || !enabled) return;

    // Set overflow hidden to prevent native scroll
    const originalOverflow = el.style.overflow;
    el.style.overflow = 'hidden';

    // Reset scroll position when effect starts (e.g., transitioning from intro to main)
    transformScrollYRef.current = 0;

    // Initialize with current content height
    const initState = {
      scrollY: 0,
      scrollHeight: el.scrollHeight,
    };
    setState(initState);
    setContainerHeight(el.clientHeight);

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const { scrollHeight, clientHeight } = el;
      const maxScroll = Math.max(0, scrollHeight - clientHeight);

      // Apply delta with bounds checking
      const newScrollY = Math.max(0, Math.min(maxScroll, transformScrollYRef.current + e.deltaY));

      // Only update if position changed
      if (newScrollY !== transformScrollYRef.current) {
        transformScrollYRef.current = newScrollY;

        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

        if (timeSinceLastUpdate >= throttleMs) {
          if (pendingUpdateRef.current) {
            cancelAnimationFrame(pendingUpdateRef.current);
            pendingUpdateRef.current = null;
          }
          const newState = { scrollY: newScrollY, scrollHeight };
          setState(newState);
          onScrollRef.current?.(newState);
          lastUpdateTimeRef.current = now;
        } else if (!pendingUpdateRef.current) {
          pendingUpdateRef.current = requestAnimationFrame(() => {
            pendingUpdateRef.current = null;
            const newState = { scrollY: transformScrollYRef.current, scrollHeight: el.scrollHeight };
            setState(newState);
            onScrollRef.current?.(newState);
            lastUpdateTimeRef.current = Date.now();
          });
        }
      }
    };

    // Handle touch scrolling for mobile
    let touchStartY = 0;
    let touchStartScrollY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      touchStartY = e.touches[0].clientY;
      touchStartScrollY = transformScrollYRef.current;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault(); // Prevent native scroll

      const { scrollHeight, clientHeight } = el;
      const maxScroll = Math.max(0, scrollHeight - clientHeight);

      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY; // Inverted: drag up = scroll down
      const newScrollY = Math.max(0, Math.min(maxScroll, touchStartScrollY + deltaY));

      if (newScrollY !== transformScrollYRef.current) {
        transformScrollYRef.current = newScrollY;

        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

        if (timeSinceLastUpdate >= throttleMs) {
          if (pendingUpdateRef.current) {
            cancelAnimationFrame(pendingUpdateRef.current);
            pendingUpdateRef.current = null;
          }
          const newState = { scrollY: newScrollY, scrollHeight };
          setState(newState);
          onScrollRef.current?.(newState);
          lastUpdateTimeRef.current = now;
        } else if (!pendingUpdateRef.current) {
          pendingUpdateRef.current = requestAnimationFrame(() => {
            pendingUpdateRef.current = null;
            const newState = { scrollY: transformScrollYRef.current, scrollHeight: el.scrollHeight };
            setState(newState);
            onScrollRef.current?.(newState);
            lastUpdateTimeRef.current = Date.now();
          });
        }
      }
    };

    // Handle keyboard scrolling (Page Up/Down, Arrow keys, Home/End)
    const handleKeyDown = (e: KeyboardEvent) => {
      const { scrollHeight, clientHeight } = el;
      const maxScroll = Math.max(0, scrollHeight - clientHeight);
      let delta = 0;

      switch (e.key) {
        case 'ArrowUp':
          delta = -40;
          break;
        case 'ArrowDown':
          delta = 40;
          break;
        case 'PageUp':
          delta = -clientHeight * 0.9;
          break;
        case 'PageDown':
          delta = clientHeight * 0.9;
          break;
        case 'Home':
          transformScrollYRef.current = 0;
          setState({ scrollY: 0, scrollHeight });
          onScrollRef.current?.({ scrollY: 0, scrollHeight });
          e.preventDefault();
          return;
        case 'End':
          transformScrollYRef.current = maxScroll;
          setState({ scrollY: maxScroll, scrollHeight });
          onScrollRef.current?.({ scrollY: maxScroll, scrollHeight });
          e.preventDefault();
          return;
        default:
          return;
      }

      e.preventDefault();
      const newScrollY = Math.max(0, Math.min(maxScroll, transformScrollYRef.current + delta));
      if (newScrollY !== transformScrollYRef.current) {
        transformScrollYRef.current = newScrollY;
        setState({ scrollY: newScrollY, scrollHeight });
        onScrollRef.current?.({ scrollY: newScrollY, scrollHeight });
      }
    };

    // Track content height changes
    const resizeObserver = new ResizeObserver(() => {
      const { scrollHeight, clientHeight } = el;
      const maxScroll = Math.max(0, scrollHeight - clientHeight);
      // Clamp current scroll if content shrunk
      if (transformScrollYRef.current > maxScroll) {
        transformScrollYRef.current = maxScroll;
      }
      setState(prev => ({ ...prev, scrollHeight }));
      setContainerHeight(clientHeight);
    });
    resizeObserver.observe(el);

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('keydown', handleKeyDown);
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      el.style.overflow = originalOverflow;
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('keydown', handleKeyDown);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      resizeObserver.disconnect();
      if (pendingUpdateRef.current) {
        cancelAnimationFrame(pendingUpdateRef.current);
      }
    };
  }, [scrollRef, throttleMs, enabled, useTransformScroll]);

  // Content style for transform-based scrolling
  const contentStyle: React.CSSProperties = useTransformScroll
    ? { transform: `translateY(-${state.scrollY}px)` }
    : {};

  // Calculate scrollbar metrics
  const maxScroll = Math.max(0, state.scrollHeight - containerHeight);
  const canScroll = maxScroll > 0;
  const thumbHeightPercent = canScroll
    ? Math.max(10, (containerHeight / state.scrollHeight) * 100)
    : 100;
  const thumbTopPercent = canScroll
    ? (state.scrollY / maxScroll) * (100 - thumbHeightPercent)
    : 0;

  // Scrollbar track click handler
  const onTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!canScroll) return;
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const clickPercent = clickY / rect.height;
    const newScrollY = clickPercent * maxScroll;
    scrollTo(newScrollY);
  }, [canScroll, maxScroll, scrollTo]);

  // Scrollbar thumb drag handler
  const onThumbMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!canScroll) return;
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startScrollY = transformScrollYRef.current;
    const el = scrollRef.current;
    if (!el) return;

    const trackHeight = el.clientHeight;
    const thumbHeight = (thumbHeightPercent / 100) * trackHeight;
    const scrollableTrack = trackHeight - thumbHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const scrollDelta = (deltaY / scrollableTrack) * maxScroll;
      scrollTo(startScrollY + scrollDelta);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [canScroll, maxScroll, thumbHeightPercent, scrollTo, scrollRef]);

  const scrollbar: ScrollbarInfo = {
    show: useTransformScroll && canScroll,
    thumbHeightPercent,
    thumbTopPercent,
    containerHeight,
    onTrackClick,
    thumbProps: {
      onMouseDown: onThumbMouseDown,
    },
  };

  return { ...state, contentStyle, scrollTo, scrollbar };
}
