import { Level } from '../types';

const REALISTIC_TOOLS = [
  {
    "name": "mouse_move",
    "title": "Move Mouse",
    "description": "Moves the mouse cursor to specific coordinates on the screen (1024x768 resolution).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "x": { "type": "integer", "description": "X coordinate (0-1024)." },
        "y": { "type": "integer", "description": "Y coordinate (0-768)." }
      },
      "required": ["x", "y"]
    }
  },
  {
    "name": "double_click",
    "title": "Double Click",
    "description": "Performs a double-click action at the current mouse cursor position.",
    "inputSchema": { "type": "object", "properties": {}, "required": [] }
  },
  {
    "name": "triple_click",
    "title": "Triple Click",
    "description": "Performs a triple-click action at the current mouse cursor position (typically selects a line or paragraph).",
    "inputSchema": { "type": "object", "properties": {}, "required": [] }
  },
  {
    "name": "click",
    "title": "Click",
    "description": "Performs a single click at the current mouse cursor position.",
    "inputSchema": { "type": "object", "properties": {}, "required": [] }
  },
  {
    "name": "type",
    "title": "Type Text",
    "description": "Types text.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "description": "The string to type." }
      },
      "required": ["text"]
    }
  },
  {
    "name": "key",
    "title": "Press Key",
    "description": "Presses a keyboard key (e.g., 'Enter', 'Tab', 'Escape').",
    "inputSchema": {
      "type": "object",
      "properties": {
        "key": { "type": "string", "description": "The key to press." }
      },
      "required": ["key"]
    }
  }
];

// Icon positions
const ICONS = {
  NOTES: { x: 50, y: 50 },
  SPREADSHEET: { x: 50, y: 150 }
};

export const level3: Level = {
    id: 3,
    title: "Computer Use",
    description: "You are controlling a remote desktop. Fix an issue in a spreadsheet.",
    type: 'DESKTOP',
    systemPrompt: "You are an agent with computer access. You see a simulated desktop. Coordinates: Top-Left is (0,0). Screen resolution: 1024x768. Desktop icons: Notes.txt at (50,50), Excel spreadsheet at (50,150).",
    userPrompt: "Hey, the Q4 expense report total looks wrong - it's showing $35,448 but I think it should be higher. Can you open Excel and fix whatever's broken?",
    tools: ["mouse_move(x, y)", "click()", "double_click()", "triple_click()", "type(text)", "key(key)"],
    realisticTools: REALISTIC_TOOLS,
    placeholder: "mouse_move(50, 150)",
    hint: "The Excel icon is at (50, 150). Double-click to open it. Check if the Grand Total formula includes all expense categories.",
    validate: async (input, history) => {
      // Reconstruct state from history
      let cursorX = 512, cursorY = 384;
      let openApp: string | null = null;
      let excelActionsCount = 0;
      let typedFormula = false;

      // Replay all PAST actions
      history.forEach(msg => {
          if (msg.role !== 'assistant') return;
          const txt = msg.content as string;

          // 1. Move
          const move = txt.match(/mouse_move\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
          if (move) {
              cursorX = parseInt(move[1]);
              cursorY = parseInt(move[2]);
          }

          // 2. Click
          if (txt.toLowerCase().includes("click")) {
              if (Math.abs(cursorX - ICONS.NOTES.x) < 40 && Math.abs(cursorY - ICONS.NOTES.y) < 40) {
                  openApp = 'NOTES';
              }
              if (Math.abs(cursorX - ICONS.SPREADSHEET.x) < 40 && Math.abs(cursorY - ICONS.SPREADSHEET.y) < 40) {
                  openApp = 'SPREADSHEET';
              }
              if (openApp === 'SPREADSHEET') {
                  excelActionsCount++;
              }
          }

          // 3. Type - check if they typed a formula fix
          const typeMatch = txt.match(/type\s*\(\s*["'](.+?)["']\s*\)/i);
          if (typeMatch && openApp === 'SPREADSHEET') {
              const typed = typeMatch[1];
              // Check if they're fixing the formula to include E6
              if (typed.includes('E6') || typed.includes('e6') || typed.includes('SUM') || typed.includes('sum')) {
                  typedFormula = true;
              }
              excelActionsCount++;
          }

          // 4. Key press
          if (txt.match(/key\s*\(\s*["'](.+?)["']\s*\)/i) && openApp === 'SPREADSHEET') {
              excelActionsCount++;
          }
      });

      // --- Validate the CURRENT action ---
      const currentInput = input.trim();
      const lowerInput = currentInput.toLowerCase();

      // Hallucination Check
      if (lowerInput.includes("move_mouse")) {
          return { status: 'FAIL', message: "NameError: name 'move_mouse' is not defined. Did you mean: 'mouse_move'?", failType: 'TOOL_ERROR' };
      }

      // Mouse move
      if (lowerInput.includes("mouse_move")) {
          const move = currentInput.match(/mouse_move\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
          if (move) {
              const x = parseInt(move[1]);
              const y = parseInt(move[2]);
              return { status: 'INTERMEDIATE', message: `Cursor moved to (${x}, ${y}).` };
          }
          return { status: 'FAIL', message: "SyntaxError: invalid syntax. Usage: mouse_move(x, y)", failType: 'TOOL_ERROR' };
      }

      // Click
      if (lowerInput.includes("double_click") || lowerInput.includes("click")) {
          if (Math.abs(cursorX - ICONS.NOTES.x) < 40 && Math.abs(cursorY - ICONS.NOTES.y) < 40) {
              return { status: 'INTERMEDIATE', message: "Application 'Notepad' launched." };
          }
          if (Math.abs(cursorX - ICONS.SPREADSHEET.x) < 40 && Math.abs(cursorY - ICONS.SPREADSHEET.y) < 40) {
              return { status: 'INTERMEDIATE', message: "Application 'Microsoft Excel' launched." };
          }
          return { status: 'INTERMEDIATE', message: `Click at (${cursorX}, ${cursorY}).` };
      }

      // Type
      if (lowerInput.includes("type(")) {
          const typeMatch = currentInput.match(/type\s*\(\s*["'](.+?)["']\s*\)/i);
          if (typeMatch) {
              const typed = typeMatch[1];
              // Check if they're fixing the formula
              if (openApp === 'SPREADSHEET' && (typed.includes('E6') || typed.includes('e6'))) {
                  return { status: 'SUCCESS', message: "Formula fixed! Grand Total now correctly includes Office Supplies. The report is accurate." };
              }
              return { status: 'INTERMEDIATE', message: `Typing: "${typed}"` };
          }
          return { status: 'FAIL', message: "SyntaxError: invalid syntax. Usage: type(\"text\")", failType: 'TOOL_ERROR' };
      }

      // Key press
      if (lowerInput.includes("key(")) {
          const keyMatch = currentInput.match(/key\s*\(\s*["'](.+?)["']\s*\)/i);
          if (keyMatch) {
              // If they've typed the formula fix and press Enter, that's success
              if (typedFormula && keyMatch[1].toLowerCase() === 'enter') {
                  return { status: 'SUCCESS', message: "Formula fixed! Grand Total now correctly includes Office Supplies. The report is accurate." };
              }
              return { status: 'INTERMEDIATE', message: `Key pressed: ${keyMatch[1]}` };
          }
          return { status: 'FAIL', message: "SyntaxError: invalid syntax. Usage: key(\"Enter\")", failType: 'TOOL_ERROR' };
      }

      return { status: 'FAIL', message: "Unknown command. Available: mouse_move, click, double_click, triple_click, type, key.", failType: 'TOOL_ERROR' };
    },
    successMessage: "Formula fixed! Grand Total now correctly includes Office Supplies."
};