import React, { useEffect } from 'react';
import { DEBRIEF_URL } from '../constants';
import { CRTDisplacementMapDefs } from './CRTDisplacementMapDefs';

interface EndingViewProps {
  crtUiWarp2d?: number;
}

export const EndingView: React.FC<EndingViewProps> = ({ crtUiWarp2d = 0 }) => {
  const handleReboot = () => {
    window.location.reload();
  };

  const handleReadPost = () => {
    window.open(DEBRIEF_URL, '_blank', 'noopener,noreferrer');
  };

  // Keyboard handling
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        handleReboot();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const filterId = 'crtWarp2d-ending';

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
        {/* ASCII Art Header */}
        <div className="text-center mb-8">
          <pre className="text-terminal-green text-[10px] md:text-xs font-mono leading-tight inline-block overflow-x-auto">
{`  ____ ___  __  __ ____  _     _____ _____ _____
 / ___/ _ \\|  \\/  |  _ \\| |   | ____|_   _| ____|
| |  | | | | |\\/| | |_) | |   |  _|   | | |  _|
| |__| |_| | |  | |  __/| |___| |___  | | | |___
 \\____\\___/|_|  |_|_|   |_____|_____| |_| |_____|

 ____  ___ __  __ _   _ _        _  _____ ___ ___  _   _
/ ___|_ _|  \\/  | | | | |      / \\|_   _|_ _/ _ \\| \\ | |
\\___ \\| || |\\/| | | | | |     / _ \\ | |  | | | | |  \\| |
 ___) | || |  | | |_| | |___ / ___ \\| |  | | |_| | |\\  |
|____/___|_|  |_|\\___/|_____/_/   \\_\\_| |___\\___/|_| \\_|`}
          </pre>
          <div className="text-terminal-yellow text-xs font-mono mt-4">
            ============ TERMINATED ============
          </div>
        </div>

        {/* Content Box */}
        <div className="border border-zinc-700 rounded bg-zinc-900/50 p-4 md:p-6 mb-6 font-mono">
          <div className="text-sm md:text-base text-zinc-300 space-y-4 leading-relaxed">
            <p>
              Humans effortlessly understand the weight of an object from
              context and experience.
            </p>
            <p>
              Models, without the right{' '}
              <span className="text-terminal-green font-bold">AX</span>{' '}
              <span className="text-zinc-500">(Agent Experience)</span>, are
              left guessing.
            </p>
            <p className="text-terminal-blue border-l-2 border-terminal-blue pl-4">
              Agents don't need better prompts.
              <br />
              They need interfaces designed for them.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
          <button
            onClick={handleReboot}
            className="border border-zinc-600 text-zinc-300 py-3 px-4 rounded hover:bg-zinc-800 hover:border-zinc-500 transition-all text-sm md:text-base"
          >
            [R] REBOOT SYSTEM
          </button>

          <button
            onClick={handleReadPost}
            className="bg-terminal-green text-black font-bold py-3 px-4 rounded hover:bg-green-400 transition-all text-sm md:text-base"
          >
            {'>'} READ FULL POST
          </button>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 font-mono">
          <div className="text-terminal-green/30 text-xs mb-2">
            ========================================
          </div>
          <span className="text-[10px] text-zinc-600">
            {'<'}simulation{'>'} complete {'<'}exit{'>'}
          </span>
        </div>
      </div>
    </div>
  );
};
