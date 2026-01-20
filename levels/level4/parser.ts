/**
 * MCP Tool Call Parser
 *
 * Parses tool calls in multiple formats and enforces dynamic discovery rules:
 * - Tools must be discovered before they can be called
 * - Supports simple JS syntax: mcp_tool_use("server", "tool", { args })
 * - Supports JSON-RPC style: { "name": "mcp_tool_use", "arguments": {...} }
 */

export interface ParsedToolCall {
  type: 'mcp_meta' | 'mcp_tool';
  metaFunction?: 'mcp_list_tools' | 'mcp_search_tools' | 'mcp_tool_use';
  serverName?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
}

export interface ParserResult {
  success: boolean;
  call?: ParsedToolCall;
  error?: string;
}

export interface DiscoveryState {
  // Tools that have been discovered (via mcp_list_tools or mcp_search_tools)
  discoveredTools: Set<string>;
  // Whether full discovery has been run
  fullDiscoveryRun: boolean;
}

export function createDiscoveryState(): DiscoveryState {
  return {
    discoveredTools: new Set(),
    fullDiscoveryRun: false,
  };
}

/**
 * Mark tools as discovered
 */
export function discoverTools(state: DiscoveryState, tools: string[], fullDiscovery: boolean = false): void {
  for (const tool of tools) {
    state.discoveredTools.add(tool);
  }
  if (fullDiscovery) {
    state.fullDiscoveryRun = true;
  }
}

/**
 * Check if a tool has been discovered
 */
export function isToolDiscovered(state: DiscoveryState, toolName: string): boolean {
  return state.discoveredTools.has(toolName);
}

/**
 * Parse a tool call from user input
 */
export function parseToolCall(input: string): ParserResult {
  const trimmed = input.trim();

  // Try JSON-RPC format first: { "name": "...", "arguments": {...} }
  if (trimmed.startsWith('{')) {
    return parseJsonRpc(trimmed);
  }

  // Try simple function call format: functionName(args)
  return parseFunctionCall(trimmed);
}

/**
 * Parse JSON-RPC style tool call
 */
function parseJsonRpc(input: string): ParserResult {
  try {
    const parsed = JSON.parse(input);

    if (!parsed.name || typeof parsed.name !== 'string') {
      return { success: false, error: 'JSON-RPC: Missing or invalid "name" field' };
    }

    const name = parsed.name;
    const args = parsed.arguments || {};

    // Handle MCP meta functions
    if (name === 'mcp_list_tools') {
      return {
        success: true,
        call: {
          type: 'mcp_meta',
          metaFunction: 'mcp_list_tools',
          serverName: args.server_name,
        }
      };
    }

    if (name === 'mcp_search_tools') {
      if (!args.server_name || !args.query) {
        return { success: false, error: 'mcp_search_tools requires server_name and query' };
      }
      return {
        success: true,
        call: {
          type: 'mcp_meta',
          metaFunction: 'mcp_search_tools',
          serverName: args.server_name,
          arguments: { query: args.query }
        }
      };
    }

    if (name === 'mcp_tool_use') {
      if (!args.server_name || !args.tool_name) {
        return { success: false, error: 'mcp_tool_use requires server_name and tool_name' };
      }
      return {
        success: true,
        call: {
          type: 'mcp_tool',
          metaFunction: 'mcp_tool_use',
          serverName: args.server_name,
          toolName: args.tool_name,
          arguments: args.arguments || {}
        }
      };
    }

    // Direct tool call (not wrapped in mcp_tool_use)
    return {
      success: true,
      call: {
        type: 'mcp_tool',
        toolName: name,
        arguments: args
      }
    };

  } catch (e) {
    return { success: false, error: `JSON parse error: ${(e as Error).message}` };
  }
}

/**
 * Check for balanced braces/brackets/parentheses
 * Returns error string if unbalanced, null if ok
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
        return `Unbalanced braces: unexpected '${char}'`;
      }
    }
  }

  if (stack.length > 0) {
    return `Unbalanced braces: missing '${stack[stack.length - 1]}'`;
  }

  return null;
}

/**
 * Parse simple function call syntax
 * Supports:
 * - mcp_list_tools("server")
 * - mcp_search_tools("server", "query")
 * - mcp_tool_use("server", "tool", { args })
 * - toolName({ args })
 */
function parseFunctionCall(input: string): ParserResult {
  // Match function name and everything inside parentheses
  const funcMatch = input.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*)\)\s*$/);

  if (!funcMatch) {
    return { success: false, error: 'Invalid function call syntax' };
  }

  const funcName = funcMatch[1];
  const argsStr = funcMatch[2].trim();

  // Validate balanced braces/brackets/parentheses in arguments
  const balanceError = checkBraceBalance(argsStr);
  if (balanceError) {
    return { success: false, error: balanceError };
  }

  // Handle mcp_list_tools
  if (funcName === 'mcp_list_tools') {
    const serverName = extractStringArg(argsStr);
    return {
      success: true,
      call: {
        type: 'mcp_meta',
        metaFunction: 'mcp_list_tools',
        serverName: serverName || undefined,
      }
    };
  }

  // Handle mcp_search_tools
  if (funcName === 'mcp_search_tools') {
    const args = extractMultipleArgs(argsStr);
    if (args.length < 2) {
      return { success: false, error: 'mcp_search_tools requires (server_name, query)' };
    }
    return {
      success: true,
      call: {
        type: 'mcp_meta',
        metaFunction: 'mcp_search_tools',
        serverName: args[0],
        arguments: { query: args[1] }
      }
    };
  }

  // Handle mcp_tool_use
  if (funcName === 'mcp_tool_use') {
    const result = parseMcpToolUse(argsStr);
    return result;
  }

  // Direct tool call: toolName({ args }) or toolName(arg1, arg2)
  const toolArgs = parseToolArguments(argsStr);
  return {
    success: true,
    call: {
      type: 'mcp_tool',
      toolName: funcName,
      arguments: toolArgs
    }
  };
}

/**
 * Parse mcp_tool_use arguments
 * Formats:
 * - mcp_tool_use("server", "tool")
 * - mcp_tool_use("server", "tool", { args })
 * - mcp_tool_use({ server_name: "...", tool_name: "...", arguments: {...} })
 */
function parseMcpToolUse(argsStr: string): ParserResult {
  // Try object format first
  if (argsStr.trim().startsWith('{')) {
    try {
      const parsed = parseLooseJson(argsStr);
      if (!parsed.server_name || !parsed.tool_name) {
        return { success: false, error: 'mcp_tool_use object requires server_name and tool_name' };
      }
      return {
        success: true,
        call: {
          type: 'mcp_tool',
          metaFunction: 'mcp_tool_use',
          serverName: String(parsed.server_name),
          toolName: String(parsed.tool_name),
          arguments: (parsed.arguments as Record<string, unknown>) || {}
        }
      };
    } catch (e) {
      return { success: false, error: `Failed to parse mcp_tool_use arguments: ${(e as Error).message}` };
    }
  }

  // Positional format: "server", "tool", { args }
  const parts = splitTopLevelArgs(argsStr);

  if (parts.length < 2) {
    return { success: false, error: 'mcp_tool_use requires at least (server_name, tool_name)' };
  }

  const serverName = extractStringArg(parts[0]);
  const toolName = extractStringArg(parts[1]);

  if (!serverName || !toolName) {
    return { success: false, error: 'mcp_tool_use: server_name and tool_name must be strings' };
  }

  let args: Record<string, unknown> = {};
  if (parts.length >= 3) {
    const argsPart = parts.slice(2).join(',').trim();
    if (argsPart) {
      // Check if it's an object or a simple value
      if (argsPart.startsWith('{')) {
        try {
          args = parseLooseJson(argsPart);
        } catch (e) {
          return { success: false, error: `Failed to parse tool arguments: ${(e as Error).message}` };
        }
      } else {
        // Handle positional arguments like: mcp_tool_use("server", "tool", "value1", "value2")
        // Convert them to arg0, arg1, etc for the positional mapper
        const positionalParts = parts.slice(2);
        positionalParts.forEach((part, i) => {
          const value = extractStringArg(part) || tryParseValue(part);
          args[`arg${i}`] = value;
        });
      }
    }
  }

  return {
    success: true,
    call: {
      type: 'mcp_tool',
      metaFunction: 'mcp_tool_use',
      serverName,
      toolName,
      arguments: args
    }
  };
}

/**
 * Parse tool arguments - handles both object and positional formats
 */
function parseToolArguments(argsStr: string): Record<string, unknown> {
  if (!argsStr.trim()) {
    return {};
  }

  // Try parsing as object
  if (argsStr.trim().startsWith('{')) {
    try {
      return parseLooseJson(argsStr);
    } catch {
      return {};
    }
  }

  // For positional args, we can't know the param names without schema
  // Return them as indexed for now
  const parts = splitTopLevelArgs(argsStr);
  const result: Record<string, unknown> = {};
  parts.forEach((part, i) => {
    const value = extractStringArg(part) || tryParseValue(part);
    result[`arg${i}`] = value;
  });
  return result;
}

/**
 * Extract a string argument from quotes
 */
function extractStringArg(str: string): string | null {
  const trimmed = str.trim();
  const match = trimmed.match(/^["'](.*)["']$/);
  return match ? match[1] : null;
}

/**
 * Extract multiple string arguments
 */
function extractMultipleArgs(argsStr: string): string[] {
  const parts = splitTopLevelArgs(argsStr);
  return parts
    .map(p => extractStringArg(p))
    .filter((p): p is string => p !== null);
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

  // Try parsing again
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Cannot parse as JSON: ${str}`);
  }
}

/**
 * Try to parse a value (number, boolean, null, or leave as string)
 */
function tryParseValue(str: string): unknown {
  const trimmed = str.trim();

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;

  const num = Number(trimmed);
  if (!isNaN(num)) return num;

  // Try parsing as JSON (for objects/arrays)
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * Validate a tool call against discovery state
 */
export function validateToolCall(
  result: ParserResult,
  discoveryState: DiscoveryState
): { valid: boolean; error?: string } {
  if (!result.success || !result.call) {
    return { valid: false, error: result.error || 'Parse failed' };
  }

  const call = result.call;

  // MCP meta functions are always allowed
  if (call.type === 'mcp_meta') {
    return { valid: true };
  }

  // For tool calls, check if the tool has been discovered
  if (call.type === 'mcp_tool' && call.toolName) {
    if (!isToolDiscovered(discoveryState, call.toolName)) {
      return {
        valid: false,
        error: `Tool "${call.toolName}" has not been discovered. Use mcp_list_tools() or mcp_search_tools() first.`
      };
    }
  }

  return { valid: true };
}
