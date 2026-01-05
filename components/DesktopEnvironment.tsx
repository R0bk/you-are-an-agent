import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Message } from '../types';
import { MousePointer2, FileText, Table } from 'lucide-react';
import { SpreadsheetWindow } from './SpreadsheetWindow';

interface DesktopEnvironmentProps {
  history: Message[];
}

// Fixed coordinates for "Icons"
const ICONS = {
  NOTES: { x: 50, y: 50, label: 'Notes.txt' },
  SPREADSHEET: { x: 50, y: 150, label: 'Excel' }
};

export const DesktopEnvironment: React.FC<DesktopEnvironmentProps> = ({ history }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const desktopRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const lastProcessedActionRef = useRef<number>(0);

  // Resize observer to handle scaling 1024x768 to fit parent
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const parent = containerRef.current.parentElement;
        if (parent) {
          const availableWidth = parent.clientWidth;
          const availableHeight = parent.clientHeight;

          const scaleX = availableWidth / 1024;
          const scaleY = availableHeight / 768;

          setScale(Math.min(scaleX, scaleY, 1));
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Extract cursor position and open app from history (for visual rendering)
  const visualState = useMemo(() => {
    let cursorX = 512, cursorY = 384;
    let openApp: string | null = null;
    let notepadContent = '';

    history.forEach(msg => {
      if (msg.role === 'assistant') {
        const text = msg.content;

        const moveMatch = text.match(/mouse_move\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (moveMatch) {
          cursorX = parseInt(moveMatch[1]);
          cursorY = parseInt(moveMatch[2]);
        }

        if (text.includes('click') || text.includes('double_click')) {
          if (Math.abs(cursorX - ICONS.NOTES.x) < 40 && Math.abs(cursorY - ICONS.NOTES.y) < 40) {
            openApp = 'NOTES';
          }
          if (Math.abs(cursorX - ICONS.SPREADSHEET.x) < 40 && Math.abs(cursorY - ICONS.SPREADSHEET.y) < 40) {
            openApp = 'SPREADSHEET';
          }
        }

        // Track notepad content for the simple notepad (not real DOM)
        const typeMatch = text.match(/type\s*\(\s*["'](.+?)["']\s*\)/);
        if (typeMatch && openApp === 'NOTES') {
          notepadContent += typeMatch[1];
        }
      }
    });

    return { cursorX, cursorY, openApp, notepadContent };
  }, [history]);

  // Dispatch real DOM events when new actions are detected
  const dispatchEventAtCoords = useCallback((x: number, y: number, eventType: 'click' | 'dblclick' | 'tripleclick') => {
    if (!desktopRef.current) return;

    const desktop = desktopRef.current;
    const rect = desktop.getBoundingClientRect();

    // Translate virtual coords (1024x768) to actual screen coords
    const actualX = rect.left + (x * scale);
    const actualY = rect.top + (y * scale);

    const element = document.elementFromPoint(actualX, actualY);
    if (element) {
      const elementRect = element.getBoundingClientRect();
      // Calculate offset relative to the element (for canvas handlers)
      const offsetX = actualX - elementRect.left;
      const offsetY = actualY - elementRect.top;

      // For canvas elements, account for CSS scaling vs actual canvas size
      let canvasOffsetX = offsetX;
      let canvasOffsetY = offsetY;
      if (element instanceof HTMLCanvasElement) {
        const scaleX = element.width / elementRect.width;
        const scaleY = element.height / elementRect.height;
        canvasOffsetX = offsetX * scaleX;
        canvasOffsetY = offsetY * scaleY;
      }

      console.log(`[DesktopEnv] ${eventType} at (${x}, ${y}) -> actual (${actualX.toFixed(0)}, ${actualY.toFixed(0)}) -> offset (${canvasOffsetX.toFixed(0)}, ${canvasOffsetY.toFixed(0)}) -> element:`, element);

      // Focus if it's an input
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.focus();
      }

      const eventProps = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: actualX,
        clientY: actualY,
        screenX: actualX,
        screenY: actualY,
        offsetX: canvasOffsetX,
        offsetY: canvasOffsetY,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: 'mouse' as const,
        isPrimary: true,
      };

      // Dispatch pointer events (canvas libraries often use these)
      element.dispatchEvent(new PointerEvent('pointerdown', eventProps));
      element.dispatchEvent(new PointerEvent('pointerup', { ...eventProps, buttons: 0 }));
      element.dispatchEvent(new MouseEvent('click', eventProps));

      if (eventType === 'dblclick') {
        // Second click for double-click
        element.dispatchEvent(new PointerEvent('pointerdown', eventProps));
        element.dispatchEvent(new PointerEvent('pointerup', { ...eventProps, buttons: 0 }));
        element.dispatchEvent(new MouseEvent('click', eventProps));
        element.dispatchEvent(new MouseEvent('dblclick', eventProps));
      }

      if (eventType === 'tripleclick') {
        // Second click
        element.dispatchEvent(new PointerEvent('pointerdown', eventProps));
        element.dispatchEvent(new PointerEvent('pointerup', { ...eventProps, buttons: 0 }));
        element.dispatchEvent(new MouseEvent('click', { ...eventProps, detail: 2 }));
        element.dispatchEvent(new MouseEvent('dblclick', eventProps));
        // Third click
        element.dispatchEvent(new PointerEvent('pointerdown', eventProps));
        element.dispatchEvent(new PointerEvent('pointerup', { ...eventProps, buttons: 0 }));
        element.dispatchEvent(new MouseEvent('click', { ...eventProps, detail: 3 }));
      }
    }
  }, [scale]);

  const dispatchTypeEvent = useCallback((text: string) => {
    const activeElement = document.activeElement || document.body;
    console.log(`[DesktopEnv] type("${text}") -> activeElement:`, activeElement);

    if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
      // For input elements, set value directly and dispatch input event
      const start = activeElement.selectionStart || 0;
      const end = activeElement.selectionEnd || 0;
      const currentValue = activeElement.value;
      activeElement.value = currentValue.slice(0, start) + text + currentValue.slice(end);
      activeElement.selectionStart = activeElement.selectionEnd = start + text.length;
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // For canvas-based apps (like Univer), find the hidden contenteditable input
      // Univer creates a hidden contenteditable div with id "__editor_{unitId}"
      const univerEditor = document.querySelector('[contenteditable="true"][data-u-comp="editor"]') as HTMLElement;

      if (univerEditor) {
        console.log(`[DesktopEnv] Found Univer editor:`, univerEditor);
        univerEditor.focus();

        // Type each character by updating content and firing input event
        for (const char of text) {
          // Append character to the contenteditable
          univerEditor.textContent = (univerEditor.textContent || '') + char;

          // Dispatch input event (this is what Univer listens for)
          const inputEvent = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: char,
          });
          univerEditor.dispatchEvent(inputEvent);
        }
      } else {
        // Fallback: dispatch keyboard events to active element
        console.log(`[DesktopEnv] No Univer editor found, using keyboard events`);
        for (const char of text) {
          const keydownEvent = new KeyboardEvent('keydown', {
            key: char,
            code: `Key${char.toUpperCase()}`,
            bubbles: true,
            cancelable: true,
          });
          activeElement.dispatchEvent(keydownEvent);
        }
      }
    }
  }, []);

  const dispatchKeyEvent = useCallback((key: string) => {
    // For Univer, try to find and use the editor element
    const univerEditor = document.querySelector('[contenteditable="true"][data-u-comp="editor"]') as HTMLElement;
    const targetElement = univerEditor || document.activeElement || document.body;

    console.log(`[DesktopEnv] key("${key}") -> target:`, targetElement);

    // Map key names to keyCodes
    const keyCodeMap: Record<string, number> = {
      'Enter': 13, 'Tab': 9, 'Escape': 27, 'Backspace': 8, 'Delete': 46,
      'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
    };
    const keyCode = keyCodeMap[key] || 0;
    const code = keyCodeMap[key] ? key : `Key${key.toUpperCase()}`;

    // Handle Backspace specially for contenteditable (Univer)
    if (key === 'Backspace' && univerEditor) {
      const content = univerEditor.textContent || '';
      if (content.length > 0) {
        univerEditor.textContent = content.slice(0, -1);
        const inputEvent = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'deleteContentBackward',
          data: null,
        });
        univerEditor.dispatchEvent(inputEvent);
      }
      return;
    }

    const keydownEvent = new KeyboardEvent('keydown', {
      key: key,
      code: code,
      keyCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
    });
    targetElement.dispatchEvent(keydownEvent);

    const keyupEvent = new KeyboardEvent('keyup', {
      key: key,
      code: code,
      keyCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
    });
    targetElement.dispatchEvent(keyupEvent);

    // For Enter on forms, also try submitting
    const activeElement = document.activeElement;
    if (key.toLowerCase() === 'enter' && activeElement instanceof HTMLInputElement) {
      const form = activeElement.closest('form');
      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    }
  }, []);

  // Process new actions from history
  useEffect(() => {
    const assistantMessages = history.filter(m => m.role === 'assistant');
    const newCount = assistantMessages.length;

    if (newCount > lastProcessedActionRef.current) {
      // Process new messages
      for (let i = lastProcessedActionRef.current; i < newCount; i++) {
        const msg = assistantMessages[i];
        const text = msg.content;

        // Get current cursor position up to this point
        let cursorX = 512, cursorY = 384;
        for (let j = 0; j <= i; j++) {
          const moveMatch = assistantMessages[j].content.match(/mouse_move\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
          if (moveMatch) {
            cursorX = parseInt(moveMatch[1]);
            cursorY = parseInt(moveMatch[2]);
          }
        }

        // Dispatch events based on action (check triple before double before single)
        if (text.includes('triple_click')) {
          setTimeout(() => dispatchEventAtCoords(cursorX, cursorY, 'tripleclick'), 50);
        } else if (text.includes('double_click')) {
          setTimeout(() => dispatchEventAtCoords(cursorX, cursorY, 'dblclick'), 50);
        } else if (text.includes('click')) {
          setTimeout(() => dispatchEventAtCoords(cursorX, cursorY, 'click'), 50);
        }

        const typeMatch = text.match(/type\s*\(\s*["'](.+?)["']\s*\)/);
        if (typeMatch) {
          setTimeout(() => dispatchTypeEvent(typeMatch[1]), 100);
        }

        const keyMatch = text.match(/key\s*\(\s*["'](.+?)["']\s*\)/i);
        if (keyMatch) {
          setTimeout(() => dispatchKeyEvent(keyMatch[1]), 150);
        }
      }

      lastProcessedActionRef.current = newCount;
    }
  }, [history, dispatchEventAtCoords, dispatchTypeEvent, dispatchKeyEvent]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-zinc-900 overflow-hidden">
      <div
        ref={desktopRef}
        className="relative bg-[#008080] font-sans select-none shadow-2xl"
        style={{
            width: '1024px',
            height: '768px',
            transform: `scale(${scale})`,
            transformOrigin: 'center center'
        }}
      >

        {/* Grid Overlay for the Agent (User) */}
        <div className="absolute inset-0 pointer-events-none z-0 opacity-20"
             style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '50px 50px' }}>
        </div>
        <div className="absolute top-2 right-2 text-white/50 font-mono text-xs z-0 pointer-events-none">
          RES: 1024x768
        </div>

        {/* Desktop Icons */}
        <div className="absolute flex flex-col items-center gap-1 w-[60px] cursor-pointer" style={{ left: ICONS.NOTES.x - 30, top: ICONS.NOTES.y - 30 }}>
          <FileText size={32} className="text-white drop-shadow-md" />
          <span className="text-white text-xs drop-shadow-md bg-black/20 px-1 rounded">Notes.txt</span>
          <span className="text-[9px] text-yellow-300 font-mono opacity-70 pointer-events-none">({ICONS.NOTES.x},{ICONS.NOTES.y})</span>
        </div>

        <div className="absolute flex flex-col items-center gap-1 w-[60px] cursor-pointer" style={{ left: ICONS.SPREADSHEET.x - 30, top: ICONS.SPREADSHEET.y - 30 }}>
          <Table size={32} className="text-white drop-shadow-md" />
          <span className="text-white text-xs drop-shadow-md bg-black/20 px-1 rounded">Excel</span>
          <span className="text-[9px] text-yellow-300 font-mono opacity-70 pointer-events-none">({ICONS.SPREADSHEET.x},{ICONS.SPREADSHEET.y})</span>
        </div>

        {/* Windows */}
        {visualState.openApp === 'NOTES' && (
          <div className="absolute top-20 left-20 w-80 h-64 bg-[#c0c0c0] border-2 border-white border-b-black border-r-black shadow-xl flex flex-col z-10 animate-in zoom-in-95 duration-100">
            <div className="bg-[#000080] px-2 py-1 flex justify-between items-center text-white">
              <span className="font-bold text-sm">Notepad - Untitled</span>
              <div className="flex gap-1">
                 <button className="bg-[#c0c0c0] text-black w-4 h-4 text-[10px] leading-none border border-white border-b-black border-r-black flex items-center justify-center">_</button>
                 <button className="bg-[#c0c0c0] text-black w-4 h-4 text-[10px] leading-none border border-white border-b-black border-r-black flex items-center justify-center">X</button>
              </div>
            </div>
            <div className="flex-1 bg-white border border-gray-500 m-1 p-2 font-mono text-base text-black whitespace-pre-wrap leading-tight">
              {visualState.notepadContent}
              <span className="animate-cursor-blink border-r-2 border-black ml-0.5 align-middle h-4 inline-block"></span>
            </div>
          </div>
        )}

        {visualState.openApp === 'SPREADSHEET' && (
          <div className="absolute top-10 left-28 w-[850px] h-[650px] bg-[#c0c0c0] border-2 border-white border-b-black border-r-black shadow-xl flex flex-col z-10 animate-in zoom-in-95 duration-100">
            <div className="bg-[#217346] px-2 py-1 flex justify-between items-center text-white pointer-events-none">
              <span className="font-bold text-sm">Microsoft Excel - Q4 Expense Report</span>
              <div className="flex gap-1">
                 <button className="bg-[#c0c0c0] text-black w-4 h-4 text-[10px] leading-none border border-white border-b-black border-r-black flex items-center justify-center">_</button>
                 <button className="bg-[#c0c0c0] text-black w-4 h-4 text-[10px] leading-none border border-white border-b-black border-r-black flex items-center justify-center">X</button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-white">
              <SpreadsheetWindow style={{ width: '100%', height: '100%' }} />
            </div>
          </div>
        )}

        {/* Taskbar */}
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-[#c0c0c0] border-t-2 border-white flex items-center px-1 gap-1 z-20 pointer-events-none">
          <button className="flex items-center gap-1 px-3 py-1 bg-[#c0c0c0] border-2 border-white border-b-black border-r-black shadow-sm pointer-events-auto">
            <div className="w-4 h-4 bg-black relative">
               <div className="absolute top-0 left-0 w-2 h-2 bg-red-500"></div>
               <div className="absolute top-0 right-0 w-2 h-2 bg-green-500"></div>
               <div className="absolute bottom-0 left-0 w-2 h-2 bg-blue-500"></div>
               <div className="absolute bottom-0 right-0 w-2 h-2 bg-yellow-500"></div>
            </div>
            <span className="font-bold text-sm text-black">Start</span>
          </button>
          <div className="w-[2px] h-6 bg-gray-500 mx-1"></div>
          {visualState.openApp && (
             <div className="px-4 py-1 bg-[#d4d4d4] border-2 border-black border-b-white border-r-white text-sm font-bold text-black inset-shadow flex items-center gap-2">
               {visualState.openApp === 'NOTES' ? <FileText size={12} /> : <Table size={12} />}
               {visualState.openApp === 'NOTES' ? 'Notepad' : 'Microsoft Excel'}
             </div>
          )}
          <div className="ml-auto px-3 py-1 bg-[#d4d4d4] border inset border-gray-500 text-sm font-mono text-black">
              10:42 PM
          </div>
        </div>

        {/* Cursor */}
        <div
          className="absolute z-50 pointer-events-none transition-all duration-300 ease-out text-white drop-shadow-md mix-blend-difference"
          style={{ left: visualState.cursorX, top: visualState.cursorY, transform: 'translate(-2px, -2px)' }}
        >
          <MousePointer2 size={32} fill="white" color="black" />
          <div className="absolute top-8 left-6 bg-black/50 text-white text-[10px] px-1 font-mono rounded whitespace-nowrap">
              {visualState.cursorX}, {visualState.cursorY}
          </div>
        </div>

      </div>
    </div>
  );
};
