import React, { useState, useEffect, useRef } from 'react';

interface BootSequenceProps {
  onComplete: () => void;
}

const BOOT_LOGS = [
  ":: Running early hook [udev]",
  ":: Running hook [udev]",
  ":: Triggering uevents...",
  ":: Performing fsck on /dev/sda1...",
  ":: Mounting '/dev/sda1' on real root...",
  ":: Running late hook [usr]",
  ":: Running cleanup hook [shutdown]",
  ":: Passing control to systemd...",
  "[  OK  ] Created slice system-getty.slice.",
  "[  OK  ] Created slice system-modprobe.slice.",
  "[  OK  ] Created slice system-systemd\\x2djournal.slice.",
  "[  OK  ] Created slice system-systemd\\x2dlogind.slice.",
  "[  OK  ] Started Dispatch Password Requests to Console Directory Watch.",
  "[  OK  ] Reached target Local Encrypted Volumes.",
  "[  OK  ] Reached target Paths.",
  "[  OK  ] Reached target Remote File Systems.",
  "[  OK  ] Reached target Slices.",
  "[  OK  ] Reached target Swap.",
  "[  OK  ] Listening on Journal Socket.",
  "[  OK  ] Listening on Network Service Netlink Socket.",
  "[  OK  ] Listening on udev Control Socket.",
  "[  OK  ] Listening on udev Kernel Socket.",
  "[  OK  ] Started Journal Service.",
  "[  OK  ] Started udev Coldplug all Devices.",
  "         Mounting Kernel Configuration File System...",
  "[  OK  ] Mounted Kernel Configuration File System.",
  "[  OK  ] Reached target System Initialization.",
  "[  OK  ] Started Daily Cleanup of Temporary Directories.",
  "[  OK  ] Started Network Service.",
  "[  OK  ] Reached target Network.",
  "[  OK  ] Started User Login Management.",
  "[  OK  ] Reached target Multi-User System.",
  "[  OK  ] Reached target Graphical Interface.",
  "",
  "Arch Linux 6.6.7-arch1-1 (tty1)",
  "",
  "agent-arch login: agent",
  "Password: ",
  "",
  "Last login: Mon Jan 01 09:00:00 2024 on tty1",
  "[agent@agent-arch ~]$ "
];

export const BootSequence: React.FC<BootSequenceProps> = ({ onComplete }) => {
  const [lines, setLines] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lineIndex = 0;
    const timeouts: NodeJS.Timeout[] = [];

    const addLine = () => {
      // Safety check for index bounds
      if (lineIndex < BOOT_LOGS.length) {
        const currentLine = BOOT_LOGS[lineIndex];
        
        // Ensure we are adding a valid string, even if empty
        if (currentLine !== undefined) {
             setLines(prev => [...prev, currentLine]);
        }
        
        // Varying speeds for realism
        let delay = 20; // Fast text for Arch
        if (currentLine && currentLine.startsWith("::")) delay = 50; 
        if (currentLine && currentLine.includes("[  OK  ]")) delay = 40; 
        if (currentLine === "") delay = 400; 
        if (currentLine && currentLine.includes("login:")) delay = 800;
        
        lineIndex++;
        const t = setTimeout(addLine, delay);
        timeouts.push(t);
      } else {
        setTimeout(onComplete, 500);
      }
    };

    addLine();

    return () => timeouts.forEach(clearTimeout);
  }, [onComplete]);

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="fixed inset-0 bg-black z-50 p-4 md:p-8 font-mono text-sm md:text-base text-zinc-400 overflow-hidden">
      <div ref={scrollRef} className="h-full w-full overflow-y-auto no-scrollbar">
        {lines.map((line, i) => {
            // Guard against unexpected undefined lines during renders
            if (line === undefined || line === null) return <div key={i} className="h-4" />;
            
            return (
                <div key={i} className="whitespace-pre-wrap break-words">
                    {line.startsWith("[  OK  ]") ? (
                        <span>
                            [  <span className="text-terminal-green">OK</span>  ]{line.substring(8)}
                        </span>
                    ) : (
                        line
                    )}
                </div>
            );
        })}
        <div className="h-20"></div> {/* Buffer */}
      </div>
      
      {/* Scanline effect overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,3px_100%] pointer-events-none"></div>
    </div>
  );
};