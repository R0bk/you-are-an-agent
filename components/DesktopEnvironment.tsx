import React, { useMemo, useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { toPng } from 'html-to-image';
import { Message } from '../types';
import { MousePointer2, FileText, Table } from 'lucide-react';
import { SpreadsheetWindow } from './SpreadsheetWindow';

interface DesktopEnvironmentProps {
  history: Message[];
  forceScale?: number; // Skip resize calculation, use this fixed scale
}

export interface DesktopEnvironmentRef {
  captureScreenshot: () => Promise<string | null>;
}

// Fixed coordinates for "Icons"
const ICONS = {
  NOTES: { x: 50, y: 50, label: 'Notes.txt' },
  SPREADSHEET: { x: 50, y: 150, label: 'Excel' }
};

export const DesktopEnvironment = forwardRef<DesktopEnvironmentRef, DesktopEnvironmentProps>(({ history, forceScale }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const desktopRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(forceScale ?? 1);
  const lastProcessedActionRef = useRef<number>(0);
  const lastClickedElementRef = useRef<Element | null>(null);

  // Expose captureScreenshot method via ref
  useImperativeHandle(ref, () => ({
    captureScreenshot: async () => {
      if (!desktopRef.current) return null;
      try {
        // Wait 500ms for things to render properly before capturing
        await new Promise(resolve => setTimeout(resolve, 500));
        // Find all UniverJS canvases (main sheet + formula bar + any other render canvases)
        // The formula bar uses data-u-comp="render-canvas" attribute
        const univerCanvases = desktopRef.current.querySelectorAll(
          'canvas.univer-render-canvas, canvas[id*="univer"], canvas[data-u-comp="render-canvas"]'
        );
        console.log(`[DesktopEnv] Screenshot: found ${univerCanvases.length} UniverJS canvases`);

        // Debug: what does desktopRef actually contain?
        const debugRect = desktopRef.current.getBoundingClientRect();
        console.log(`[DesktopEnv] desktopRef.current: class="${desktopRef.current.className?.substring(0, 50)}", pos=(${debugRect.left.toFixed(0)},${debugRect.top.toFixed(0)}), size=${debugRect.width.toFixed(0)}x${debugRect.height.toFixed(0)}`);

        // Debug: all canvases in this desktop
        const allCanvases = desktopRef.current.querySelectorAll('canvas');
        console.log(`[DesktopEnv] Total canvases in desktop: ${allCanvases.length}`);

        univerCanvases.forEach((c, i) => {
          const canvas = c as HTMLCanvasElement;
          const rect = canvas.getBoundingClientRect();
          console.log(`[DesktopEnv] Canvas ${i}: class="${canvas.className}", id="${canvas.id?.substring(0, 30)}", data-u-comp="${canvas.getAttribute('data-u-comp')}", buffer=${canvas.width}x${canvas.height}, display=${rect.width.toFixed(0)}x${rect.height.toFixed(0)}, pos=(${rect.left.toFixed(0)},${rect.top.toFixed(0)})`);
        });

        // Capture base screenshot with html-to-image, filtering out UniverJS canvases
        const baseDataUrl = await toPng(desktopRef.current, {
          width: 1024,
          height: 768,
          backgroundColor: '#008080',
          pixelRatio: 1,
          // Skip ALL UniverJS canvases - we'll composite them manually
          filter: (node) => {
            if (node instanceof HTMLCanvasElement) {
              // Filter out any canvas that's part of UniverJS
              if (node.id?.includes('univer') || node.classList?.contains('univer-render-canvas')) {
                return false;
              }
              // Filter out formula bar and other UniverJS render canvases
              if (node.getAttribute('data-u-comp') === 'render-canvas') {
                return false;
              }
              // Also filter canvases inside univer containers
              if (node.closest('.univer-relative')) {
                return false;
              }
            }
            return true;
          }
        });

        // Get desktop rect for position calculations
        const desktopRect = desktopRef.current.getBoundingClientRect();
        const scaleX = 1024 / desktopRect.width;
        const scaleY = 768 / desktopRect.height;

        // Create composite canvas
        const compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = 1024;
        compositeCanvas.height = 768;
        const ctx = compositeCanvas.getContext('2d');

        if (ctx) {
          // Draw base screenshot
          const baseImg = new Image();
          await new Promise<void>((resolve, reject) => {
            baseImg.onload = () => resolve();
            baseImg.onerror = reject;
            baseImg.src = baseDataUrl;
          });
          ctx.drawImage(baseImg, 0, 0);

          // Composite all UniverJS canvases onto the screenshot
          for (const canvas of univerCanvases) {
            const univerCanvas = canvas as HTMLCanvasElement;
            if (univerCanvas.width > 0 && univerCanvas.height > 0) {
              const canvasRect = univerCanvas.getBoundingClientRect();
              const canvasX = canvasRect.left - desktopRect.left;
              const canvasY = canvasRect.top - desktopRect.top;

              const scaledX = canvasX * scaleX;
              const scaledY = canvasY * scaleY;
              const scaledWidth = canvasRect.width * scaleX;
              const scaledHeight = canvasRect.height * scaleY;

              ctx.drawImage(univerCanvas, scaledX, scaledY, scaledWidth, scaledHeight);
            }
          }

          return compositeCanvas.toDataURL('image/png');
        }

        return baseDataUrl;
      } catch (error) {
        console.error('[DesktopEnv] Screenshot capture failed:', error);
        return null;
      }
    }
  }), []);

  // Resize observer to handle scaling 1024x768 to fit parent
  // Skip if forceScale is set (e.g., for hidden screenshot desktop)
  useEffect(() => {
    if (forceScale !== undefined) return; // Skip resize calculation

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
  }, [forceScale]);

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
    const desktopRect = desktop.getBoundingClientRect();

    console.log(`[DesktopEnv] dispatchEventAtCoords(${x}, ${y}, ${eventType}), scale=${scale}, desktopRect=(${desktopRect.left.toFixed(0)}, ${desktopRect.top.toFixed(0)})`);

    // Find the MAIN spreadsheet canvas - UniverJS uses multiple canvases
    // Prioritize the main sheet canvas (has id containing "univer-sheet-main-canvas") over formula bar canvases
    // ONLY search within our own desktop to avoid dispatching to both hidden and visible desktops
    let canvas = desktop.querySelector('canvas[id*="univer-sheet-main-canvas"]') as HTMLCanvasElement | null;
    if (!canvas) {
      // Fallback to any UniverJS canvas
      canvas = desktop.querySelector('canvas.univer-render-canvas, canvas[id*="univer"], canvas[data-u-comp="render-canvas"]') as HTMLCanvasElement | null;
    }

    if (!canvas) {
      console.log(`[DesktopEnv] No canvas found in this desktop, skipping click dispatch`);
      // Fall back to clicking on desktop for non-canvas clicks (e.g., desktop icons)
      const eventProps = {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y, offsetX: x, offsetY: y,
        button: 0, buttons: 1,
      };
      desktop.dispatchEvent(new MouseEvent(eventType === 'dblclick' ? 'dblclick' : 'click', eventProps));
      return;
    }

    // Get canvas position in screen coordinates
    const canvasRect = canvas.getBoundingClientRect();

    // Calculate canvas position relative to our desktop in virtual coordinates
    // Note: getBoundingClientRect returns scaled values, so divide by scale
    const canvasLeft = (canvasRect.left - desktopRect.left) / scale;
    const canvasTop = (canvasRect.top - desktopRect.top) / scale;

    // Calculate click offset within the canvas (in virtual coordinates)
    const offsetInCanvasX = x - canvasLeft;
    const offsetInCanvasY = y - canvasTop;

    console.log(`[DesktopEnv] Canvas at (${canvasLeft.toFixed(0)}, ${canvasTop.toFixed(0)}), click offset in canvas: (${offsetInCanvasX.toFixed(0)}, ${offsetInCanvasY.toFixed(0)})`);

    // Check if the click is within the canvas bounds
    const canvasDisplayWidth = canvasRect.width / scale;
    const canvasDisplayHeight = canvasRect.height / scale;

    if (offsetInCanvasX < 0 || offsetInCanvasX > canvasDisplayWidth ||
        offsetInCanvasY < 0 || offsetInCanvasY > canvasDisplayHeight) {
      console.log(`[DesktopEnv] Click outside canvas bounds, ignoring`);
      return;
    }

    // Scale from virtual display coordinates to canvas buffer coordinates
    const canvasBufferWidth = canvas.width;
    const canvasBufferHeight = canvas.height;
    const scaleToBufferX = canvasBufferWidth / canvasDisplayWidth;
    const scaleToBufferY = canvasBufferHeight / canvasDisplayHeight;

    const bufferX = offsetInCanvasX * scaleToBufferX;
    const bufferY = offsetInCanvasY * scaleToBufferY;

    console.log(`[DesktopEnv] Canvas buffer(${canvasBufferWidth}x${canvasBufferHeight}), display(${canvasDisplayWidth.toFixed(0)}x${canvasDisplayHeight.toFixed(0)}), bufferCoords(${bufferX.toFixed(0)}, ${bufferY.toFixed(0)})`);

    // Store the clicked element for later type/key events
    lastClickedElementRef.current = canvas;

    // Calculate the actual screen coordinates for the click
    // offsetInCanvasX/Y are in virtual (1024x768) space, scale them to screen space
    const clickScreenX = canvasRect.left + (offsetInCanvasX * scale * (canvasRect.width / canvasDisplayWidth));
    const clickScreenY = canvasRect.top + (offsetInCanvasY * scale * (canvasRect.height / canvasDisplayHeight));

    console.log(`[DesktopEnv] Click at screen(${clickScreenX.toFixed(0)}, ${clickScreenY.toFixed(0)}), bufferCoords(${bufferX.toFixed(0)}, ${bufferY.toFixed(0)})`);

    // Dispatch events with buffer coordinates as offsetX/offsetY
    const eventProps = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: clickScreenX,
      clientY: clickScreenY,
      screenX: clickScreenX,
      screenY: clickScreenY,
      offsetX: bufferX,
      offsetY: bufferY,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: 'mouse' as const,
      isPrimary: true,
    };

    // Dispatch pointer/mouse events based on event type
    // Only dispatch each event once to avoid double-selection
    if (eventType === 'click') {
      canvas.dispatchEvent(new PointerEvent('pointerdown', eventProps));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...eventProps, buttons: 0 }));
      canvas.dispatchEvent(new MouseEvent('click', eventProps));
    } else if (eventType === 'dblclick') {
      // For double-click, dispatch two complete click sequences then dblclick
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...eventProps, detail: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...eventProps, buttons: 0, detail: 1 }));
      canvas.dispatchEvent(new MouseEvent('click', { ...eventProps, detail: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...eventProps, detail: 2 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...eventProps, buttons: 0, detail: 2 }));
      canvas.dispatchEvent(new MouseEvent('click', { ...eventProps, detail: 2 }));
      canvas.dispatchEvent(new MouseEvent('dblclick', { ...eventProps, detail: 2 }));
    } else if (eventType === 'tripleclick') {
      // For triple-click, dispatch three complete click sequences
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...eventProps, detail: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...eventProps, buttons: 0, detail: 1 }));
      canvas.dispatchEvent(new MouseEvent('click', { ...eventProps, detail: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...eventProps, detail: 2 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...eventProps, buttons: 0, detail: 2 }));
      canvas.dispatchEvent(new MouseEvent('click', { ...eventProps, detail: 2 }));
      canvas.dispatchEvent(new MouseEvent('dblclick', { ...eventProps, detail: 2 }));
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...eventProps, detail: 3 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...eventProps, buttons: 0, detail: 3 }));
      canvas.dispatchEvent(new MouseEvent('click', { ...eventProps, detail: 3 }));
    }
  }, [scale]);

  const dispatchTypeEvent = useCallback((text: string) => {
    // Use the last clicked element, or fall back to active element
    const targetElement = lastClickedElementRef.current || document.activeElement || document.body;
    console.log(`[DesktopEnv] type("${text}") -> target:`, targetElement);

    // Check if it's a standard input/textarea
    if (targetElement instanceof HTMLInputElement || targetElement instanceof HTMLTextAreaElement) {
      targetElement.focus();
      const start = targetElement.selectionStart || 0;
      const end = targetElement.selectionEnd || 0;
      const currentValue = targetElement.value;
      targetElement.value = currentValue.slice(0, start) + text + currentValue.slice(end);
      targetElement.selectionStart = targetElement.selectionEnd = start + text.length;
      targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // Check if we have a focused input (user might have clicked on spreadsheet but a textbox has focus)
    const focusedInput = document.activeElement;
    if (focusedInput instanceof HTMLInputElement || focusedInput instanceof HTMLTextAreaElement) {
      const start = focusedInput.selectionStart || 0;
      const end = focusedInput.selectionEnd || 0;
      const currentValue = focusedInput.value;
      focusedInput.value = currentValue.slice(0, start) + text + currentValue.slice(end);
      focusedInput.selectionStart = focusedInput.selectionEnd = start + text.length;
      focusedInput.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // For canvas-based apps (like Univer), use the UniverJS API directly
    // NOTE: Synthetic keyboard events don't work for UniverJS - it only responds to OS-level keyboard events.
    // We use the exposed univerAPI to set cell values directly when in edit mode.
    const univerEditor = document.querySelector('[contenteditable="true"][data-u-comp="editor"]') as HTMLElement;
    if (univerEditor && window.__univerAPI) {
      console.log(`[DesktopEnv] Found Univer editor, using UniverJS API to set cell value`);
      try {
        const workbook = window.__univerAPI.getActiveWorkbook();
        if (workbook) {
          const sheet = workbook.getActiveSheet();
          if (sheet) {
            // Get the currently selected cell
            const selection = sheet.getSelection();
            const activeRange = selection?.getActiveRange();
            if (activeRange) {
              const row = activeRange.getRow();
              const col = activeRange.getColumn();
              // Get current value and append the typed text (simulating typing)
              const currentCell = sheet.getRange(row, col);
              const currentValue = currentCell.getValue();
              const newValue = (currentValue !== null && currentValue !== undefined ? String(currentValue) : '') + text;
              // Set the new value
              currentCell.setValue(newValue);
              console.log(`[DesktopEnv] Set cell (${row}, ${col}) to: ${newValue}`);
            }
          }
        }
      } catch (e) {
        console.error('[DesktopEnv] UniverJS API error:', e);
      }
      return;
    } else if (univerEditor) {
      // Fallback: Univer editor found but no API - just log warning
      console.warn(`[DesktopEnv] Univer editor found but no API available, typing will not work`);
      return;
    }

    // Final fallback for non-Univer apps: dispatch to window
    console.log(`[DesktopEnv] Fallback: dispatching keyboard events to window`);
    for (const char of text) {
      const keydownEvent = new KeyboardEvent('keydown', {
        key: char,
        code: char.length === 1 ? `Key${char.toUpperCase()}` : char,
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(keydownEvent);

      const keypressEvent = new KeyboardEvent('keypress', {
        key: char,
        charCode: char.charCodeAt(0),
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(keypressEvent);

      const keyupEvent = new KeyboardEvent('keyup', {
        key: char,
        code: char.length === 1 ? `Key${char.toUpperCase()}` : char,
        keyCode: char.charCodeAt(0),
        which: char.charCodeAt(0),
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(keyupEvent);
    }
  }, []);

  const dispatchKeyEvent = useCallback((key: string) => {
    console.log(`[DesktopEnv] key("${key}")`);

    // Map key names to keyCodes
    const keyCodeMap: Record<string, number> = {
      'Enter': 13, 'Tab': 9, 'Escape': 27, 'Backspace': 8, 'Delete': 46,
      'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
      'F1': 112, 'F2': 113, 'F3': 114, 'F4': 115, 'F5': 116, 'F6': 117,
      'F7': 118, 'F8': 119, 'F9': 120, 'F10': 121, 'F11': 122, 'F12': 123,
    };
    const keyCode = keyCodeMap[key] || key.charCodeAt(0);
    const code = keyCodeMap[key] ? key : `Key${key.toUpperCase()}`;

    // First, check if there's a focused input element that should receive the key
    // Use lastClickedElementRef first, then fall back to document.activeElement
    const targetInput = (lastClickedElementRef.current instanceof HTMLInputElement || lastClickedElementRef.current instanceof HTMLTextAreaElement)
      ? lastClickedElementRef.current
      : (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)
        ? document.activeElement
        : null;

    if (targetInput) {
      // Handle Enter on input - might trigger form submit or cell navigation
      if (key === 'Enter') {
        targetInput.focus();
        const keydownEvent = new KeyboardEvent('keydown', {
          key, code, keyCode, which: keyCode, bubbles: true, cancelable: true,
        });
        targetInput.dispatchEvent(keydownEvent);

        // Also check for form submission
        const form = targetInput.closest('form');
        if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        return;
      }

      // Handle Backspace on input
      if (key === 'Backspace') {
        targetInput.focus();
        const start = targetInput.selectionStart ?? targetInput.value.length;
        const end = targetInput.selectionEnd ?? targetInput.value.length;
        if (start > 0 || start !== end) {
          const currentValue = targetInput.value;
          if (start === end) {
            targetInput.value = currentValue.slice(0, start - 1) + currentValue.slice(end);
            targetInput.selectionStart = targetInput.selectionEnd = start - 1;
          } else {
            targetInput.value = currentValue.slice(0, start) + currentValue.slice(end);
            targetInput.selectionStart = targetInput.selectionEnd = start;
          }
          targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return;
      }
    }

    // For Univer spreadsheet, use the UniverJS API for key operations
    // NOTE: UniverJS creates contenteditable editors in a portal OUTSIDE the desktop container
    const univerEditor = document.querySelector('[contenteditable="true"][data-u-comp="editor"]') as HTMLElement;
    if (univerEditor && window.__univerAPI) {
      console.log(`[DesktopEnv] Found Univer editor, using UniverJS API for key: ${key}`);
      try {
        const workbook = window.__univerAPI.getActiveWorkbook();
        if (workbook) {
          const sheet = workbook.getActiveSheet();
          if (sheet) {
            const selection = sheet.getSelection();
            const activeRange = selection?.getActiveRange();

            if (activeRange) {
              const row = activeRange.getRow();
              const col = activeRange.getColumn();
              const currentCell = sheet.getRange(row, col);
              const currentValue = currentCell.getValue();

              if (key === 'Backspace') {
                // Delete last character
                const strValue = currentValue !== null && currentValue !== undefined ? String(currentValue) : '';
                if (strValue.length > 0) {
                  currentCell.setValue(strValue.slice(0, -1));
                  console.log(`[DesktopEnv] Backspace: cell (${row}, ${col}) = "${strValue.slice(0, -1)}"`);
                }
                return;
              }

              if (key === 'Delete') {
                // Clear cell
                currentCell.setValue('');
                console.log(`[DesktopEnv] Delete: cleared cell (${row}, ${col})`);
                return;
              }

              if (key === 'Enter') {
                // Enter confirms the edit - value is already set by type()
                // Move selection down by one row
                const maxRow = sheet.getMaxRows();
                if (row + 1 < maxRow) {
                  sheet.getRange(row + 1, col).activate();
                  console.log(`[DesktopEnv] Enter: moved to cell (${row + 1}, ${col})`);
                }
                return;
              }

              if (key === 'Escape') {
                // Escape cancels edit - in a real implementation we'd restore original value
                // For now, just log (the game doesn't track original values)
                console.log(`[DesktopEnv] Escape: edit cancelled for cell (${row}, ${col})`);
                return;
              }

              if (key === 'Tab') {
                // Tab moves to next column
                const maxCol = sheet.getMaxColumns();
                if (col + 1 < maxCol) {
                  sheet.getRange(row, col + 1).activate();
                  console.log(`[DesktopEnv] Tab: moved to cell (${row}, ${col + 1})`);
                }
                return;
              }

              // Arrow keys for navigation
              if (key === 'ArrowUp' && row > 0) {
                sheet.getRange(row - 1, col).activate();
                console.log(`[DesktopEnv] ArrowUp: moved to cell (${row - 1}, ${col})`);
                return;
              }
              if (key === 'ArrowDown' && row + 1 < sheet.getMaxRows()) {
                sheet.getRange(row + 1, col).activate();
                console.log(`[DesktopEnv] ArrowDown: moved to cell (${row + 1}, ${col})`);
                return;
              }
              if (key === 'ArrowLeft' && col > 0) {
                sheet.getRange(row, col - 1).activate();
                console.log(`[DesktopEnv] ArrowLeft: moved to cell (${row}, ${col - 1})`);
                return;
              }
              if (key === 'ArrowRight' && col + 1 < sheet.getMaxColumns()) {
                sheet.getRange(row, col + 1).activate();
                console.log(`[DesktopEnv] ArrowRight: moved to cell (${row}, ${col + 1})`);
                return;
              }
            }
          }
        }
      } catch (e) {
        console.error('[DesktopEnv] UniverJS API error in key():', e);
      }
      // If we couldn't handle via API, fall through to default behavior
    }

    // Find the best target for keyboard events (fallback for non-Univer elements)
    const keyTarget = lastClickedElementRef.current || document.activeElement || document.body;

    const keydownEvent = new KeyboardEvent('keydown', {
      key: key,
      code: code,
      keyCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      view: window,
    });
    keyTarget.dispatchEvent(keydownEvent);

    const keyupEvent = new KeyboardEvent('keyup', {
      key: key,
      code: code,
      keyCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      view: window,
    });
    keyTarget.dispatchEvent(keyupEvent);
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
});
