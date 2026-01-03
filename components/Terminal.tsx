import React, { ReactNode } from 'react';
import { Terminal as TerminalIcon, Circle, Minus, Square } from 'lucide-react';

interface TerminalProps {
  title: string;
  children: ReactNode;
  className?: string;
  isActive?: boolean;
  noScroll?: boolean;
  noPadding?: boolean;
  hideTitleBar?: boolean;
  borderless?: boolean;
  transparentBg?: boolean;
}

export const Terminal: React.FC<TerminalProps> = ({ 
  title, 
  children, 
  className = '', 
  isActive = true,
  noScroll = false,
  noPadding = false,
  hideTitleBar = false,
  borderless = false,
  transparentBg = false,
}) => {
  return (
    <div
      className={`relative flex flex-col ${transparentBg ? 'bg-transparent' : 'bg-terminal-bg'} ${borderless ? '' : 'border border-terminal-gray'} rounded-lg overflow-hidden shadow-2xl transition-all duration-300 ${isActive ? (borderless ? 'opacity-100' : 'opacity-100 ring-1 ring-terminal-gray') : 'opacity-50 grayscale'} ${className}`}
    >
      
      {/* Title Bar */}
      {!hideTitleBar && (
        <div className={`flex items-center justify-between px-4 py-2 bg-zinc-900 ${borderless ? '' : 'border-b border-terminal-gray'} select-none`}>
          <div className="flex items-center gap-2">
            <TerminalIcon size={14} className="text-terminal-text opacity-50" />
            <span className="text-xs font-mono font-bold text-terminal-text tracking-widest uppercase">{title}</span>
          </div>
          <div className="flex gap-2">
            <Minus size={12} className="text-terminal-text opacity-30" />
            <Square size={10} className="text-terminal-text opacity-30" />
            <Circle size={10} className="text-terminal-red opacity-50" />
          </div>
        </div>
      )}

      {/* Content Area */}
      <div
        className={`flex-1 min-h-0 relative ${transparentBg ? 'bg-transparent' : 'bg-terminal-bg'} font-mono text-sm md:text-base text-terminal-text ${
          noScroll ? 'overflow-hidden flex flex-col min-h-0' : 'overflow-auto'
        } ${noPadding ? '' : 'p-2 md:p-4'}`}
      >
        <div className="absolute inset-0 scanline-overlay pointer-events-none z-10" />
        {children}
      </div>
    </div>
  );
};