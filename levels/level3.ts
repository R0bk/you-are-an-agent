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
    "name": "type",
    "title": "Type Text",
    "description": "Types text at the current cursor location. Requires an application to be focused.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "text": { "type": "string", "description": "The string to type." }
      },
      "required": ["text"]
    }
  }
];

export const level3: Level = {
    id: 3,
    title: "Computer Use",
    description: "You are controlling a remote desktop. You must manipulate the GUI to complete the task.",
    type: 'DESKTOP',
    systemPrompt: "You are an agent with computer access. You see a simulated desktop. Coordinates: Top-Left is (0,0). Screen resolution: 1024x768.",
    userPrompt: "Open the 'Notes.txt' file on the desktop and write 'Hello World' inside it.",
    tools: ["mouse_move(x, y)", "double_click()", "type(text)"],
    realisticTools: REALISTIC_TOOLS,
    placeholder: "mouse_move(50, 50)",
    hint: "The 'Notes.txt' icon is at (50, 50). Move the mouse there first.",
    validate: async (input, history) => {
      // Reconstruct PREVIOUS state from history (excluding current input)
      let cursorX = 512, cursorY = 384;
      let appOpen = false;
      let textWritten = "";

      // Replay all PAST actions to determine CURRENT state
      history.forEach(msg => {
          if (msg.role !== 'assistant') return;
          const txt = msg.content as string;
          
          // 1. Move
          const move = txt.match(/mouse_move\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
          if (move) { 
              cursorX = parseInt(move[1]); 
              cursorY = parseInt(move[2]); 
          }
          
          // 2. Click (Hitbox: 50,50 with 40px radius)
          if (txt.toLowerCase().includes("click")) {
              if (Math.abs(cursorX - 50) < 40 && Math.abs(cursorY - 50) < 40) {
                  appOpen = true;
              }
          }

          // 3. Type
          const type = txt.match(/type\s*\(\s*["'](.+)["']\s*\)/i);
          if (type && appOpen) {
              textWritten += type[1];
          }
      });

      // --- Validate the CURRENT action specifically ---
      const currentInput = input.trim();
      const lowerInput = currentInput.toLowerCase();
      
      // Hallucination Check: Common mistakes
      if (lowerInput.includes("move_mouse")) {
          return { status: 'FAIL', message: "NameError: name 'move_mouse' is not defined. Did you mean: 'mouse_move'?", failType: 'TOOL_ERROR' };
      }
      
      // Case A: User trying to move
      if (lowerInput.includes("mouse_move")) {
          // Check if they moved close enough
          const move = currentInput.match(/mouse_move\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
          if (move) {
              const x = parseInt(move[1]);
              const y = parseInt(move[2]);
              if (Math.abs(x - 50) < 40 && Math.abs(y - 50) < 40) {
                   return { status: 'INTERMEDIATE', message: "Cursor target acquired." };
              }
              return { status: 'INTERMEDIATE', message: `Cursor moved to (${x}, ${y}).` };
          }
          return { status: 'FAIL', message: "SyntaxError: invalid syntax. Usage: mouse_move(x, y)", failType: 'TOOL_ERROR' };
      }

      // Case B: User trying to click
      if (lowerInput.includes("double_click") || lowerInput.includes("click")) {
          // If already open, warn them
          if (appOpen) {
               return { status: 'FAIL', message: "StateError: Application is already open.", failType: 'TOOL_ERROR' };
          }
          
          // Check aim
          if (Math.abs(cursorX - 50) < 40 && Math.abs(cursorY - 50) < 40) {
              return { status: 'INTERMEDIATE', message: "Application 'Notes.txt' launched." };
          }
          return { status: 'FAIL', message: "MouseEvent: Click at (" + cursorX + "," + cursorY + ") hit nothing.", failType: 'TOOL_ERROR' };
      }

      // Case C: User trying to type
      if (lowerInput.includes("type")) {
           if (!appOpen) {
               return { status: 'FAIL', message: "RuntimeError: Cannot type. No application has focus.", failType: 'TOOL_ERROR' };
           }
           
           // Extract text content (case sensitive for the content)
           const typeMatch = currentInput.match(/type\s*\(\s*["'](.+)["']\s*\)/i);
           if (typeMatch) {
                const newText = textWritten + typeMatch[1];
                if (newText.toLowerCase().includes("hello")) {
                    return { status: 'SUCCESS', message: "Task verified. Computer control capabilities within nominal parameters." };
                }
                return { status: 'INTERMEDIATE', message: "Inputting text stream..." };
           }
           return { status: 'FAIL', message: "SyntaxError: invalid syntax. Usage: type(\"text\")", failType: 'TOOL_ERROR' };
      }
      
      // Case D: Idle/Confused
      if (appOpen) {
          return { status: 'FAIL', message: "The app is open but you aren't doing anything.", failType: 'USER_COMPLAINT' };
      }

      return { status: 'FAIL', message: "SyntaxError: Unknown command. Available tools: mouse_move, double_click, type.", failType: 'TOOL_ERROR' };
    },
    successMessage: "Task verified. Computer control capabilities within nominal parameters."
};