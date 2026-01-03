import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AdvancedSequentialTypewriter, TypewriterSegment } from './AdvancedSequentialTypewriter';

interface TitleCardOverlayProps {
  text: string;
  subtext?: string;
  onDone?: () => void;
  /**
   * How long to keep the card visible after typing completes (before fade out).
   */
  holdMs?: number;
}

export const TitleCardOverlay: React.FC<TitleCardOverlayProps> = ({
  text,
  subtext,
  onDone,
  // Default increased by +500ms per request (gives the viewer a beat before fading to the level).
  holdMs = 1150,
}) => {
  const [phase, setPhase] = useState<'typing_title' | 'typing_sub' | 'hold' | 'fade'>('typing_title');
  const holdTimerRef = useRef<number | null>(null);

  // Ensure the typing restarts when text/subtext changes.
  const typeKey = useMemo(() => `${text}__${subtext ?? ''}`, [text, subtext]);

  useEffect(() => {
    setPhase('typing_title');
  }, [typeKey]);

  // Hold for a beat after typing completes, then fade. Keep the timeout cleaned up.
  useEffect(() => {
    if (phase !== 'hold') return;
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => setPhase('fade'), holdMs);
    return () => {
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    };
  }, [phase, holdMs]);

  useEffect(() => {
    if (phase !== 'fade') return;
    const t = window.setTimeout(() => onDone?.(), 280);
    return () => window.clearTimeout(t);
  }, [phase, onDone]);

  const displayText = useMemo(() => {
    const s = (text ?? '').trimEnd();
    if (s.includes('\n')) return s;
    if (s.length <= 1) return s + '\n';
    const mid = Math.floor(s.length / 2);
    const leftSpace = s.lastIndexOf(' ', mid);
    const rightSpace = s.indexOf(' ', mid + 1);
    let splitAt = -1;
    if (leftSpace !== -1 && rightSpace !== -1) {
      splitAt = mid - leftSpace <= rightSpace - mid ? leftSpace : rightSpace;
    } else if (leftSpace !== -1) splitAt = leftSpace;
    else if (rightSpace !== -1) splitAt = rightSpace;
    if (splitAt !== -1) return s.slice(0, splitAt) + '\n' + s.slice(splitAt + 1);
    return s.slice(0, Math.max(1, mid)) + '\n' + s.slice(Math.max(1, mid));
  }, [text]);

  const titleSegments: TypewriterSegment[] = useMemo(() => [{ text: displayText }], [displayText]);
  const subSegments: TypewriterSegment[] = useMemo(() => [{ text: subtext ?? '' }], [subtext]);

  return (
    <div
      className={[
        'fixed inset-0 z-[10] flex items-center justify-center',
        'bg-black/90 backdrop-blur-sm',
        'transition-opacity duration-300',
        phase === 'fade' ? 'opacity-0' : 'opacity-100',
      ].join(' ')}
    >
      <div className="relative px-6 py-10 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="absolute inset-0 -z-10 opacity-60 crt-title-glow" />

        <div className="text-[10px] font-mono uppercase tracking-[0.35em] text-terminal-green/80 mb-3">
          system // initializing
        </div>

        <div className="text-6xl md:text-9xl font-mono font-black tracking-tight text-white leading-none drop-shadow-[0_0_35px_rgba(34,197,94,0.22)]">
          <AdvancedSequentialTypewriter
            key={typeKey}
            preset="bare"
            renderAs="span"
            showCursor={false}
            segments={titleSegments}
            isAnimating={phase === 'typing_title'}
            onComplete={() => {
              if (subtext && subtext.trim().length > 0) setPhase('typing_sub');
              else {
                setPhase('hold');
              }
            }}
            delayProfile={{
              baseDelayMs: 70,
              whitespaceDelayMs: 60,
              wordGapDelayMs: 70,
              punctuationDelayMs: 140,
              newlineDelayMs: 200,
              styleChangeDelayMs: 0,
              maxDelayMs: 360,
            }}
          />
          {(phase === 'typing_title' || phase === 'typing_sub') && (
            <span className="animate-cursor-blink inline-block w-2 h-[1em] bg-terminal-green align-middle ml-1" />
          )}
        </div>

        {subtext && (
          <div className="mt-4 text-sm md:text-base font-mono text-zinc-300/90 tracking-widest">
            <AdvancedSequentialTypewriter
              key={`${typeKey}__sub`}
              preset="bare"
              renderAs="span"
              showCursor={false}
              segments={subSegments}
              isAnimating={phase === 'typing_sub'}
              onComplete={() => {
                setPhase('hold');
              }}
              delayProfile={{
                baseDelayMs: 55,
                whitespaceDelayMs: 45,
                wordGapDelayMs: 60,
                punctuationDelayMs: 120,
                newlineDelayMs: 180,
                styleChangeDelayMs: 0,
                maxDelayMs: 320,
              }}
            />
          </div>
        )}

        <div className="mt-6 text-[10px] font-mono text-zinc-500 tracking-widest">
          Press nothing. Just watch.
        </div>
      </div>
    </div>
  );
};


