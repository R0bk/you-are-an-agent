import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface TypewriterSegment {
  text?: string;
  className?: string;
  node?: React.ReactNode;
}

export interface TypewriterDelayProfile {
  /** Base delay per character in milliseconds. */
  baseDelayMs: number;
  /** Extra delay when the next character is whitespace. */
  whitespaceDelayMs?: number;
  /** Extra delay when starting a new word (non-space -> space). */
  wordGapDelayMs?: number;
  /** Extra delay when the next character is punctuation. */
  punctuationDelayMs?: number;
  /** Extra delay when the next character is a newline. */
  newlineDelayMs?: number;
  /** Extra delay when we switch className between segments (i.e. “color change”). */
  styleChangeDelayMs?: number;
  /** Clamp to keep things snappy even for large pauses. */
  maxDelayMs?: number;
}

const DEFAULT_PROFILE: TypewriterDelayProfile = {
  baseDelayMs: 12,
  whitespaceDelayMs: 35,
  wordGapDelayMs: 45,
  punctuationDelayMs: 80,
  newlineDelayMs: 140,
  styleChangeDelayMs: 60,
  maxDelayMs: 260,
};

function isPunctuation(ch: string) {
  return /[.,!?;:]/.test(ch);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeDelayMs(
  nextChar: string,
  prevChar: string | undefined,
  nextClass: string | undefined,
  prevClass: string | undefined,
  profile: TypewriterDelayProfile
) {
  const p = { ...DEFAULT_PROFILE, ...profile };
  let delay = p.baseDelayMs;

  if (prevClass !== undefined && nextClass !== prevClass) delay += p.styleChangeDelayMs ?? 0;

  if (nextChar === '\n') delay += p.newlineDelayMs ?? 0;
  else if (nextChar === ' ' || nextChar === '\t') {
    delay += p.whitespaceDelayMs ?? 0;
    if (prevChar && prevChar !== ' ' && prevChar !== '\t' && prevChar !== '\n') {
      delay += p.wordGapDelayMs ?? 0;
    }
  } else if (isPunctuation(nextChar)) {
    delay += p.punctuationDelayMs ?? 0;
  }

  return clamp(delay, 0, p.maxDelayMs ?? 260);
}

interface AdvancedSequentialTypewriterProps {
  segments: TypewriterSegment[];
  isAnimating: boolean;
  onComplete?: () => void;
  delayProfile?: TypewriterDelayProfile;
  className?: string;
  showCursor?: boolean;
  renderAs?: 'div' | 'span';
  /**
   * - chat: applies terminal-ish defaults (text-sm/leading-relaxed) for message bodies
   * - bare: does not impose text sizing/leading; use parent/classes to control layout
   */
  preset?: 'chat' | 'bare';
  /** Speed multiplier - delays are divided by this value (1x, 2x, 4x, 8x, 16x) */
  speedMultiplier?: number;
}

/**
 * Terminal-style, discrete (step-by-step) typewriter:
 * - Types exactly ONE character per tick (no “smooth” transitions)
 * - Variable per-char delay (punctuation/whitespace/newlines)
 * - Adds a pause when className changes (simulating “color change”)
 */
export const AdvancedSequentialTypewriter: React.FC<AdvancedSequentialTypewriterProps> = ({
  segments,
  isAnimating,
  onComplete,
  delayProfile = DEFAULT_PROFILE,
  className = '',
  showCursor = true,
  renderAs = 'div',
  preset = 'chat',
  speedMultiplier = 1,
}) => {
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const { totalLength, charClassByIndex } = useMemo(() => {
    const out: Array<{ ch: string; className?: string }> = [];
    for (const seg of segments) {
      if (!seg.text) continue;
      for (let i = 0; i < seg.text.length; i++) {
        out.push({ ch: seg.text[i], className: seg.className });
      }
    }
    return { totalLength: out.length, charClassByIndex: out };
  }, [segments]);

  const [currentIndex, setCurrentIndex] = useState(isAnimating ? 0 : totalLength);

  // Keep currentIndex in sync when animation toggles or content changes
  useEffect(() => {
    setCurrentIndex(isAnimating ? 0 : totalLength);
  }, [isAnimating, totalLength]);

  useEffect(() => {
    if (!isAnimating) return;
    if (totalLength <= 0) {
      onCompleteRef.current?.();
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    const tick = (idx: number) => {
      if (cancelled) return;
      if (idx >= totalLength) {
        onCompleteRef.current?.();
        return;
      }

      const next = idx + 1;
      setCurrentIndex(next);

      if (next >= totalLength) {
        timeoutId = window.setTimeout(() => {
          if (!cancelled) onCompleteRef.current?.();
        }, 0);
        return;
      }

      const nextMeta = charClassByIndex[next];
      const prevMeta = charClassByIndex[next - 1];
      const baseDelay = computeDelayMs(
        nextMeta?.ch ?? '',
        prevMeta?.ch,
        nextMeta?.className,
        prevMeta?.className,
        delayProfile
      );
      const delay = Math.max(1, Math.floor(baseDelay / speedMultiplier));

      timeoutId = window.setTimeout(() => tick(next), delay);
    };

    // Prime first tick quickly so it feels responsive.
    timeoutId = window.setTimeout(() => tick(0), 0);

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [isAnimating, totalLength, charClassByIndex, delayProfile, speedMultiplier]);

  // Render logic: slice per segment based on currentIndex (like the old version)
  let charTracker = 0;

  const Wrapper: any = renderAs;
  const baseClasses =
    preset === 'chat'
      ? 'whitespace-pre-wrap font-mono text-sm leading-relaxed break-words'
      : 'whitespace-pre-wrap font-mono break-words';

  return (
    <Wrapper className={`${baseClasses} ${className}`}>
      {segments.map((seg, i) => {
        // Non-text nodes are “instant” once we reach their slot.
        if (seg.node) {
          const nodeStart = charTracker;
          if (currentIndex >= nodeStart) return <React.Fragment key={i}>{seg.node}</React.Fragment>;
          return null;
        }

        const text = seg.text || '';
        const start = charTracker;
        charTracker += text.length;

        const visibleCount = Math.max(0, Math.min(text.length, currentIndex - start));
        const visibleText = text.slice(0, visibleCount);
        const isTyping = isAnimating && currentIndex >= start && currentIndex < start + text.length;
        const showCursorHere = showCursor && isTyping;

        if (!visibleText && !showCursorHere) return null;

        // Detect Safari - disable cursor there due to compositor issues with SVG filters
        const isSafari = typeof navigator !== 'undefined' &&
          /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        return (
          <span key={i} className={seg.className}>
            {visibleText}
            {showCursorHere && !isSafari && (
              <span className="animate-cursor-blink inline-block w-1.5 h-4 bg-terminal-green align-middle ml-0.5" />
            )}
          </span>
        );
      })}
    </Wrapper>
  );
};


