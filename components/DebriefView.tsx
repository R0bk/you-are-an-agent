import React, { useState, useEffect } from 'react';
import { DEBRIEF_URL } from '../constants';
import { CRTDisplacementMapDefs } from './CRTDisplacementMapDefs';

interface DebriefViewProps {
  onContinue: () => void;
  crtUiWarp2d?: number;
}

export const DebriefView: React.FC<DebriefViewProps> = ({ onContinue, crtUiWarp2d = 0 }) => {
  const [hasReadDebrief, setHasReadDebrief] = useState(false);

  const handleOpenDebrief = () => {
    window.open(DEBRIEF_URL, '_blank', 'noopener,noreferrer');
  };

  // Keyboard handling
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        setHasReadDebrief((v) => !v);
        return;
      }
      if (e.key === 'Enter' && hasReadDebrief) {
        onContinue();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasReadDebrief, onContinue]);

  const filterId = 'crtWarp2d-debrief';

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative">
      {/* SVG filter for warp */}
      {crtUiWarp2d > 0 && (
        <CRTDisplacementMapDefs id={filterId} scale={crtUiWarp2d} />
      )}

      <div
        className="w-full max-w-2xl"
        style={crtUiWarp2d > 0 ? { filter: `url(#${filterId})` } : undefined}
      >
        {/* ASCII Header */}
        <div className="text-center mb-8">
          <pre className="text-terminal-green text-[10px] md:text-xs font-mono leading-tight inline-block overflow-x-auto">
{` ____  _   _    _    ____  _____   _
|  _ \\| | | |  / \\  / ___|| ____| / |
| |_) | |_| | / _ \\ \\___ \\|  _|   | |
|  __/|  _  |/ ___ \\ ___) | |___  | |
|_|   |_| |_/_/   \\_\\____/|_____| |_|

  ____                      _      _
 / ___|___  _ __ ___  _ __ | | ___| |_ ___
| |   / _ \\| '_ \` _ \\| '_ \\| |/ _ \\ __/ _ \\
| |__| (_) | | | | | | |_) | |  __/ ||  __/
 \\____\\___/|_| |_| |_| .__/|_|\\___|\\__\\___|
                     |_|`}
          </pre>
          <div className="text-terminal-yellow text-xs font-mono mt-4">
            ======== 100% ========
          </div>
        </div>

        {/* Content Box */}
        <div className="border border-terminal-green/30 rounded bg-black/50 p-4 md:p-6 mb-6 font-mono">
          <div className="text-terminal-yellow text-xs tracking-wider mb-4 pb-3 border-b border-terminal-green/20">
            [!] CONTEXT REQUIRED BEFORE PHASE 2
          </div>

          <div className="text-sm md:text-base text-zinc-300 space-y-4 leading-relaxed">
            <p>
              You just experienced agent constraints firsthand:{' '}
              <span className="text-terminal-blue">statelessness</span>,{' '}
              <span className="text-terminal-blue">limited vision</span>,{' '}
              <span className="text-terminal-blue">one action at a time</span>.
            </p>
            <p>
              Before Phase 2, read the design philosophy behind what you just
              experienced -- why interfaces for agents != interfaces for humans.
            </p>
          </div>

          {/* Debrief Link */}
          <button
            onClick={handleOpenDebrief}
            className="mt-6 w-full border border-terminal-green text-terminal-green font-mono py-3 px-4 rounded hover:bg-terminal-green hover:text-black transition-all text-sm md:text-base"
          >
            {'>'} READ: AX -- Agent Experience (opens new tab)
          </button>
        </div>

        {/* Checkbox - Tappable */}
        <button
          onClick={() => setHasReadDebrief(!hasReadDebrief)}
          className="w-full flex items-center justify-center gap-3 py-3 text-zinc-400 hover:text-white transition-colors cursor-pointer mb-4 font-mono"
        >
          <span className={`text-lg ${hasReadDebrief ? 'text-terminal-green' : 'text-zinc-600'}`}>
            {hasReadDebrief ? '[X]' : '[ ]'}
          </span>
          <span className="text-sm">I have read the debrief</span>
        </button>

        {/* Continue Button */}
        <button
          onClick={() => hasReadDebrief && onContinue()}
          disabled={!hasReadDebrief}
          className={`w-full font-mono py-4 px-6 rounded transition-all text-sm md:text-base ${
            hasReadDebrief
              ? 'bg-terminal-green text-black hover:bg-green-400 cursor-pointer font-bold'
              : 'bg-zinc-900 text-zinc-600 cursor-not-allowed border border-zinc-800'
          }`}
        >
          {hasReadDebrief ? '> INITIALIZE PHASE 2' : 'COMPLETE CHECKBOX TO CONTINUE'}
        </button>

        {/* Skip Link */}
        <button
          onClick={onContinue}
          className="w-full text-center text-zinc-600 hover:text-zinc-400 text-xs font-mono mt-4 py-2 transition-colors"
        >
          skip without reading...
        </button>
      </div>
    </div>
  );
};
