/**
 * WebVM Tool Call Parser
 *
 * Parses tool calls for the WebVM level with strict syntax validation:
 * - shell(command: string)      - Execute shell command
 * - read_file(path: string)     - Read file contents (via cat)
 * - write_file(path, content)   - Write file contents
 */

export type ToolName = 'shell' | 'read_file' | 'write_file';

export interface ParsedToolCall {
  tool: ToolName;
  args: Record<string, unknown>;
}

export interface ParserResult {
  success: boolean;
  call?: ParsedToolCall;
  error?: string;
}

/**
 * Parse a tool call from user input
 */
export function parseToolCall(input: string): ParserResult {
  const trimmed = input.trim();

  // Try JSON format first: { "name": "shell", "arguments": { "command": "ls" } }
  if (trimmed.startsWith('{')) {
    return parseJsonFormat(trimmed);
  }

  // Try function call format: shell("ls -la")
  return parseFunctionCall(trimmed);
}

/**
 * Parse JSON format tool call
 */
function parseJsonFormat(input: string): ParserResult {
  try {
    const parsed = JSON.parse(input);

    if (!parsed.name || typeof parsed.name !== 'string') {
      return { success: false, error: 'JSON format requires "name" field' };
    }

    const name = parsed.name as string;
    const args = parsed.arguments || {};

    if (!isValidToolName(name)) {
      return { success: false, error: `Unknown tool: "${name}". Available tools: shell, read_file, write_file` };
    }

    return validateAndBuild(name, args);
  } catch (e) {
    return { success: false, error: `JSON parse error: ${(e as Error).message}` };
  }
}

/**
 * Check if name is a valid tool
 */
function isValidToolName(name: string): name is ToolName {
  return ['shell', 'read_file', 'write_file'].includes(name);
}

/**
 * Parse function call syntax: tool(args)
 */
function parseFunctionCall(input: string): ParserResult {
  // Match: functionName(everything inside)
  const funcMatch = input.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*)\)\s*$/);

  if (!funcMatch) {
    return { success: false, error: 'Invalid syntax. Expected: tool(arguments)' };
  }

  const funcName = funcMatch[1];
  const argsStr = funcMatch[2];

  if (!isValidToolName(funcName)) {
    return { success: false, error: `Unknown tool: "${funcName}". Available tools: shell, read_file, write_file` };
  }

  // Validate balanced brackets
  const balanceError = checkBraceBalance(argsStr);
  if (balanceError) {
    return { success: false, error: balanceError };
  }

  // Parse arguments based on tool type
  return parseToolArguments(funcName, argsStr);
}

/**
 * Check for balanced braces/brackets/quotes
 */
function checkBraceBalance(str: string): string | null {
  const stack: string[] = [];
  const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  const closers = new Set(Object.values(pairs));
  let inString: string | null = null;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (inString) {
      if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }

    if (pairs[char]) {
      stack.push(pairs[char]);
    } else if (closers.has(char)) {
      if (stack.length === 0 || stack.pop() !== char) {
        return `Unbalanced: unexpected '${char}'`;
      }
    }
  }

  if (stack.length > 0) {
    return `Unbalanced: missing '${stack[stack.length - 1]}'`;
  }

  if (inString) {
    return `Unclosed string: missing ${inString}`;
  }

  return null;
}

/**
 * Parse arguments for a specific tool
 */
function parseToolArguments(tool: ToolName, argsStr: string): ParserResult {
  const trimmed = argsStr.trim();

  switch (tool) {
    case 'shell':
      return parseShellArgs(trimmed);
    case 'read_file':
      return parseReadFileArgs(trimmed);
    case 'write_file':
      return parseWriteFileArgs(trimmed);
    default:
      return { success: false, error: `Unknown tool: ${tool}` };
  }
}

/**
 * Parse shell(command) arguments
 * Supports: shell("ls -la") or shell({ command: "ls -la" })
 */
function parseShellArgs(argsStr: string): ParserResult {
  if (!argsStr) {
    return { success: false, error: 'shell() requires a command argument' };
  }

  // Object format: { command: "..." }
  if (argsStr.startsWith('{')) {
    try {
      const parsed = parseLooseJson(argsStr);
      if (typeof parsed.command !== 'string') {
        return { success: false, error: 'shell({ command }) requires string command' };
      }
      return validateAndBuild('shell', { command: parsed.command });
    } catch (e) {
      return { success: false, error: `Invalid shell arguments: ${(e as Error).message}` };
    }
  }

  // String format: "command"
  const command = extractString(argsStr);
  if (command === null) {
    return { success: false, error: 'shell() requires a quoted string argument' };
  }

  return validateAndBuild('shell', { command });
}

/**
 * Parse read_file(path) arguments
 * Supports: read_file("path") or read_file({ path: "..." })
 */
function parseReadFileArgs(argsStr: string): ParserResult {
  if (!argsStr) {
    return { success: false, error: 'read_file() requires a path argument' };
  }

  // Object format: { path: "..." }
  if (argsStr.startsWith('{')) {
    try {
      const parsed = parseLooseJson(argsStr);
      if (typeof parsed.path !== 'string') {
        return { success: false, error: 'read_file({ path }) requires string path' };
      }
      return validateAndBuild('read_file', { path: parsed.path });
    } catch (e) {
      return { success: false, error: `Invalid read_file arguments: ${(e as Error).message}` };
    }
  }

  // String format: "path"
  const path = extractString(argsStr);
  if (path === null) {
    return { success: false, error: 'read_file() requires a quoted string path' };
  }

  return validateAndBuild('read_file', { path });
}

/**
 * Parse write_file(path, content) arguments
 * Supports: write_file("path", "content") or write_file({ path: "...", content: "..." })
 */
function parseWriteFileArgs(argsStr: string): ParserResult {
  if (!argsStr) {
    return { success: false, error: 'write_file() requires path and content arguments' };
  }

  // Object format: { path: "...", content: "..." }
  if (argsStr.startsWith('{')) {
    try {
      const parsed = parseLooseJson(argsStr);
      if (typeof parsed.path !== 'string') {
        return { success: false, error: 'write_file({ path, content }) requires string path' };
      }
      if (typeof parsed.content !== 'string') {
        return { success: false, error: 'write_file({ path, content }) requires string content' };
      }
      return validateAndBuild('write_file', {
        path: parsed.path,
        content: processEscapeSequences(parsed.content)
      });
    } catch (e) {
      return { success: false, error: `Invalid write_file arguments: ${(e as Error).message}` };
    }
  }

  // Positional format: "path", "content"
  const parts = splitTopLevelArgs(argsStr);
  if (parts.length < 2) {
    return { success: false, error: 'write_file() requires two arguments: path and content' };
  }

  const path = extractString(parts[0]);
  if (path === null) {
    return { success: false, error: 'write_file() path must be a quoted string' };
  }

  // Join remaining parts in case content contained commas
  const contentPart = parts.slice(1).join(',').trim();
  const content = extractString(contentPart);
  if (content === null) {
    return { success: false, error: 'write_file() content must be a quoted string' };
  }

  return validateAndBuild('write_file', {
    path,
    content: processEscapeSequences(content)
  });
}

/**
 * Process escape sequences in string content
 * Uses a placeholder approach to handle \\\\ correctly
 */
export function processEscapeSequences(str: string): string {
  // Use placeholder for escaped backslashes to avoid double-processing
  const BACKSLASH_PLACEHOLDER = '\x00BACKSLASH\x00';
  return str
    .replace(/\\\\/g, BACKSLASH_PLACEHOLDER)  // Preserve literal backslashes
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(new RegExp(BACKSLASH_PLACEHOLDER, 'g'), '\\');  // Restore backslashes
}

/**
 * Extract a string from quotes (single or double)
 */
function extractString(str: string): string | null {
  const trimmed = str.trim();

  // Match double-quoted string (handles escaped quotes)
  const doubleMatch = trimmed.match(/^"((?:[^"\\]|\\.)*)"/);
  if (doubleMatch) {
    return unescapeString(doubleMatch[1]);
  }

  // Match single-quoted string (handles escaped quotes)
  const singleMatch = trimmed.match(/^'((?:[^'\\]|\\.)*)'/);
  if (singleMatch) {
    return unescapeString(singleMatch[1]);
  }

  return null;
}

/**
 * Unescape string content (escaped quotes)
 */
function unescapeString(str: string): string {
  return str
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

/**
 * Split arguments at top-level commas (not inside braces/brackets/quotes)
 */
function splitTopLevelArgs(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let inString: string | null = null;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }

    if (inString) {
      current += char;
      if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = char;
      current += char;
      continue;
    }

    if (char === '{' || char === '[' || char === '(') {
      depth++;
      current += char;
      continue;
    }

    if (char === '}' || char === ']' || char === ')') {
      depth--;
      current += char;
      continue;
    }

    if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

/**
 * Parse loose JSON (handles unquoted keys, trailing commas)
 */
function parseLooseJson(str: string): Record<string, unknown> {
  const trimmed = str.trim();

  // Try standard JSON first
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to loose parsing
  }

  // Convert loose JS object syntax to JSON
  // Add quotes around unquoted keys
  let jsonStr = trimmed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  // Remove trailing commas
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Cannot parse as JSON: ${str}`);
  }
}

/**
 * Validate tool arguments and build the result
 */
function validateAndBuild(tool: ToolName, args: Record<string, unknown>): ParserResult {
  switch (tool) {
    case 'shell':
      if (typeof args.command !== 'string' || !args.command.trim()) {
        return { success: false, error: 'shell() requires a non-empty command string' };
      }
      return {
        success: true,
        call: { tool: 'shell', args: { command: args.command } }
      };

    case 'read_file':
      if (typeof args.path !== 'string' || !args.path.trim()) {
        return { success: false, error: 'read_file() requires a non-empty path string' };
      }
      return {
        success: true,
        call: { tool: 'read_file', args: { path: args.path } }
      };

    case 'write_file':
      if (typeof args.path !== 'string' || !args.path.trim()) {
        return { success: false, error: 'write_file() requires a non-empty path string' };
      }
      if (typeof args.content !== 'string') {
        return { success: false, error: 'write_file() requires a content string' };
      }
      return {
        success: true,
        call: { tool: 'write_file', args: { path: args.path, content: args.content } }
      };

    default:
      return { success: false, error: `Unknown tool: ${tool}` };
  }
}
