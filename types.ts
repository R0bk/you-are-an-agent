export enum GameState {
  PLAYING = 'PLAYING',
  MANIFESTO = 'MANIFESTO', // Debrief screen between phases
  PLAYING_ADVANCED = 'PLAYING_ADVANCED',
  ENDING = 'ENDING'
}

export enum MessageType {
  SYSTEM = 'SYSTEM',
  USER = 'USER',
  ASSISTANT = 'ASSISTANT', // The player
  TOOL = 'TOOL'
}

export interface Message {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content: string;
  isError?: boolean; // New: to style tool errors differently
  imageUrl?: string; // Screenshot data URL for desktop captures
}

export interface ValidationResult {
  status: 'SUCCESS' | 'FAIL' | 'INTERMEDIATE';
  message: string;
  toolOutput?: string; // If intermediate, what the "system" responds with
  failType?: 'TOOL_ERROR' | 'USER_COMPLAINT'; // New: Determines how the error is presented
}

export interface Level {
  id: number;
  title: string;
  description: string;
  systemPrompt: string;
  userPrompt: string;
  tools?: string[]; // List of available tools (Simple Mode)
  realisticTools?: any[]; // Full JSON Schema definitions (Realistic Mode)
  /**
   * If true, do not append any tool availability/definition section to the SYSTEM prompt.
   * (Useful for levels where "no tools" is part of the intended vibe.)
   */
  hideToolsInSystemPrompt?: boolean;
  /**
   * How `realisticTools` should be presented in the SYSTEM prompt.
   * - 'MCP': wrapped in `<mcp_servers>` + `<mcp_tool_definitions ...>` (legacy/default)
   * - 'PLAIN_JSON': shown as plain JSON tool definitions without any MCP mention
   */
  realisticToolsFormat?: 'MCP' | 'PLAIN_JSON';
  placeholder?: string;
  hint?: string;
  // Validate now takes the input AND the history of the conversation so far
  validate: (input: string, history: Message[]) => Promise<ValidationResult>;
  successMessage: string;
  imageUrl?: string; 
  type?: 'TEXT' | 'DESKTOP'; // Render mode
}

export interface SimulationStats {
  tokensProcessed: number;
  errorsMade: number;
  startTime: number;
}