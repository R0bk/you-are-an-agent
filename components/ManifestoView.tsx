import React from 'react';
import { MANIFESTO_TITLE, MANIFESTO_CONTENT, MANIFESTO_URL } from '../constants';
import { Terminal } from './Terminal';
import { ArrowRight, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown'; // Wait, standard libraries only. We'll do simple rendering.

interface ManifestoViewProps {
  onContinue: () => void;
}

export const ManifestoView: React.FC<ManifestoViewProps> = ({ onContinue }) => {
  
  // Simple parser for the specific markdown subset we used
  const renderContent = (text: string) => {
    return text.split('\n').map((line, idx) => {
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-xl md:text-2xl font-bold text-white mt-6 mb-3">{line.replace('## ', '')}</h2>;
      }
      if (line.startsWith('1. ') || line.startsWith('2. ') || line.startsWith('3. ')) {
         return <div key={idx} className="ml-4 text-terminal-green my-1">{line}</div>
      }
      if (line.trim() === '') {
        return <div key={idx} className="h-4" />;
      }
      // Simple bold check
      const parts = line.split(/(\*\*.*?\*\*)/);
      return (
        <p key={idx} className="text-zinc-300 leading-relaxed mb-2">
            {parts.map((part, pIdx) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={pIdx} className="text-terminal-yellow font-normal">{part.slice(2, -2)}</strong>;
                }
                return part;
            })}
        </p>
      );
    });
  };

  return (
    <div className="min-h-screen bg-black text-terminal-text p-4 md:p-12 flex flex-col items-center justify-center">
      <div className="max-w-3xl w-full">
        <div className="mb-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-3xl md:text-5xl font-mono font-bold text-terminal-green mb-2 glitch-text">
                INTERMISSION
            </h1>
            <p className="text-zinc-500 font-mono text-sm">SYSTEM_PAUSE // UPLOADING_MANIFESTO.TXT</p>
        </div>

        <Terminal title="~/documents/manifesto.md" className="bg-zinc-900 border-zinc-700 shadow-2xl mb-8 max-h-[60vh] overflow-y-auto">
            <div className="p-4 md:p-8 font-mono">
                <div className="flex items-center gap-2 mb-6 border-b border-zinc-800 pb-4">
                    <BookOpen className="text-terminal-blue" />
                    <h1 className="text-lg md:text-xl text-white font-bold">{MANIFESTO_TITLE}</h1>
                </div>
                <div className="prose prose-invert max-w-none text-sm md:text-base">
                    {renderContent(MANIFESTO_CONTENT)}
                    <a
                      href={MANIFESTO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-4 text-terminal-blue hover:text-terminal-green underline"
                    >
                      {MANIFESTO_URL}
                    </a>
                </div>
            </div>
        </Terminal>

        <div className="flex justify-center">
            <button 
                onClick={onContinue}
                className="group flex items-center gap-3 bg-white text-black px-8 py-4 rounded font-mono font-bold uppercase tracking-widest hover:bg-terminal-green transition-colors"
            >
                <span>Initialize Final Test</span>
                <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </button>
        </div>
      </div>
    </div>
  );
};