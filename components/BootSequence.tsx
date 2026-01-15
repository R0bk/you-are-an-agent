import React, { useState, useEffect, useRef } from 'react';
import { BootStage } from '../services/webvmService';

interface BootSequenceProps {
  onComplete: () => void;
  stage: BootStage;
  initProgress?: number; // 0-100 for file initialization progress
  filterStyle?: React.CSSProperties;
}

// Stage metadata
const STAGE_INFO: Record<BootStage, { label: string; percent: number; logs: string[] }> = {
  'idle': {
    label: 'Initializing...',
    percent: 0,
    logs: ['Preparing environment...'],
  },
  'loading-iframe': {
    label: 'Loading VM Image',
    percent: 15,
    logs: [
      ':: Loading VM image...',
      ':: Mounting virtual filesystem...',
    ],
  },
  'booting-vm': {
    label: 'Booting WebVM',
    percent: 40,
    logs: [
      ':: Running early hook [udev]',
      ':: Triggering uevents...',
      ':: Performing fsck on /dev/sda1...',
      ':: Mounting \'/dev/sda1\' on real root...',
      ':: Passing control to systemd...',
      '[  OK  ] Started Journal Service.',
      '[  OK  ] Started Network Service.',
      '[  OK  ] Reached target Multi-User System.',
    ],
  },
  'ready': {
    label: 'VM Ready',
    percent: 70,
    logs: [
      '[  OK  ] Reached target Graphical Interface.',
      '',
      'Arch Linux 6.6.7-arch1-1 (tty1)',
      '',
      'agent-arch login: agent',
      'Password: ********',
      '',
      'Last login: Mon Jan 01 09:00:00 2024 on tty1',
      '[agent@agent-arch ~]$ ',
    ],
  },
};

export const BootSequence: React.FC<BootSequenceProps> = ({ onComplete, stage, initProgress = 0, filterStyle }) => {
  const [displayedLogs, setDisplayedLogs] = useState<string[]>([]);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [logIndex, setLogIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageOrder: BootStage[] = ['idle', 'loading-iframe', 'booting-vm', 'ready'];

  // Calculate total progress
  // Stage progress (0-70%) + init progress (70-100%)
  const stageIdx = stageOrder.indexOf(stage);
  const basePercent = STAGE_INFO[stage].percent;
  const initContribution = stage === 'ready' ? (initProgress * 0.3) : 0; // 30% for init
  const totalProgress = Math.min(100, basePercent + initContribution);

  // Track which stage we're showing logs for
  useEffect(() => {
    const idx = stageOrder.indexOf(stage);
    if (idx > currentStageIndex) {
      setCurrentStageIndex(idx);
      setLogIndex(0);
    }
  }, [stage, currentStageIndex]);

  // Animate logs for the current stage
  useEffect(() => {
    if (stage === 'idle') return;

    const logs = STAGE_INFO[stage].logs;
    if (logIndex >= logs.length) return;

    const delay = logs[logIndex] === '' ? 200 :
                  logs[logIndex].startsWith('::') ? 80 :
                  logs[logIndex].startsWith('[  OK  ]') ? 60 : 40;

    const timer = setTimeout(() => {
      setDisplayedLogs(prev => [...prev, logs[logIndex]]);
      setLogIndex(i => i + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [stage, logIndex]);

  // When init is complete (100%), call onComplete after a short delay
  useEffect(() => {
    if (stage === 'ready' && initProgress >= 100) {
      const timer = setTimeout(onComplete, 600);
      return () => clearTimeout(timer);
    }
  }, [stage, initProgress, onComplete]);

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedLogs]);

  // Current status text
  const statusText = stage === 'ready'
    ? (initProgress < 100 ? 'Initializing project files...' : 'Ready!')
    : STAGE_INFO[stage].label;

  return (
    <div className="fixed inset-0 bg-terminal-bg z-40 flex flex-col font-mono">
      {/* Main content with same padding as TerminalLevelIntro */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 lg:pt-16 lg:pb-16 pt-8 pb-8 crt-scroll-fade"
        style={filterStyle}
      >
        {/* Centered container matching SimulationView layout */}
        <div className="w-full max-w-7xl mx-auto">
        {/* Header - matching game header style */}
        <div className="mb-4">
          <span className="text-terminal-green font-bold tracking-widest uppercase text-[10px]">
            WebVM // Arch Linux
          </span>
        </div>

        {/* Progress section */}
        <div className="mb-6 max-w-md">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-terminal-green uppercase tracking-wider">{statusText}</span>
            <span className="text-zinc-500">{Math.round(totalProgress)}%</span>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-terminal-green transition-all duration-300 ease-out"
              style={{ width: `${totalProgress}%` }}
            />
          </div>

          {/* Stage indicators */}
          <div className="flex justify-between mt-2 text-[10px] text-zinc-600 uppercase tracking-wider">
            <span className={stageIdx >= 1 ? 'text-terminal-green' : ''}>Load</span>
            <span className={stageIdx >= 2 ? 'text-terminal-green' : ''}>Boot</span>
            <span className={stageIdx >= 3 ? 'text-terminal-green' : ''}>Ready</span>
            <span className={stage === 'ready' && initProgress >= 100 ? 'text-terminal-green' : ''}>Init</span>
          </div>
        </div>

        {/* Log output - matching terminal text style */}
        <div className="text-sm text-zinc-400 space-y-0">
          {displayedLogs.map((line, i) => {
            if (line === undefined || line === null) return <div key={i} className="h-4" />;

            return (
              <div key={i} className="whitespace-pre-wrap break-words leading-relaxed">
                {line.startsWith('[  OK  ]') ? (
                  <span>
                    [  <span className="text-terminal-green">OK</span>  ]{line.substring(8)}
                  </span>
                ) : line.startsWith('::') ? (
                  <span className="text-zinc-500">{line}</span>
                ) : (
                  line
                )}
              </div>
            );
          })}

          {/* Show initialization progress when in ready stage */}
          {stage === 'ready' && initProgress > 0 && initProgress < 100 && (
            <div className="mt-2 text-terminal-yellow">
              Initializing project files... {Math.round(initProgress)}%
            </div>
          )}
          {stage === 'ready' && initProgress >= 100 && (
            <div className="mt-2">
              [  <span className="text-terminal-green">OK</span>  ] Project files initialized.
            </div>
          )}
        </div>
        </div>{/* Close max-w-7xl container */}
      </div>
    </div>
  );
};
