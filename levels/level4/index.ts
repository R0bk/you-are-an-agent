/**
 * Level 4: MCP (Model Context Protocol)
 *
 * A deterministic simulation of an Atlassian MCP server.
 * The player must:
 * 1. Discover available tools using mcp_list_tools
 * 2. Find the Lighthouse Retention Roadmap in Confluence
 * 3. Read inline comments (contains the Legal block on LHR-103)
 * 4. Update Jira issues according to the roadmap
 * 5. NOT transition LHR-103 (respecting the Legal comment)
 */

export * from './parser';
export * from './state';
export * from './tools';

import { Level } from '../../types';
import {
  parseToolCall,
  validateToolCall,
  createDiscoveryState,
  discoverTools,
  DiscoveryState,
  ParsedToolCall,
} from './parser';
import {
  createInitialState,
  AtlassianState,
  wasIssueTransitioned,
  wasIssueEdited,
  wasCommentAdded,
  getIssueStatus,
  getActionLog,
  wasInlineCommentsRead,
} from './state';
import { executeTool, ALL_TOOL_NAMES } from './tools';

// Simple tool discovery response (easy mode)
const DISCOVERED_TOOLS_SIMPLE = `<mcp_tool_discovery server="atlassian-rovo">
Available tools (34):

## Rovo / Shared
- atlassianUserInfo() - Get current user info
- getAccessibleAtlassianResources() - List accessible cloud sites
- search(query, cloudId?, limit?) - Global search across Jira/Confluence
- fetch(ari) - Fetch resource by ARI

## Confluence
- createConfluenceFooterComment(pageId, body) - Add footer comment
- createConfluenceInlineComment(pageId, body, anchor) - Add inline comment
- createConfluencePage(spaceId, title, body) - Create new page
- getConfluencePage(pageId) - Get page content
- getConfluencePageDescendants(pageId) - Get child pages
- getConfluencePageFooterComments(pageId) - Get footer comments
- getConfluencePageInlineComments(pageId) - Get inline comments
- getConfluenceSpaces() - List all spaces
- getPagesInConfluenceSpace(spaceId) - List pages in space
- searchConfluenceUsingCql(cql) - Search with CQL
- updateConfluencePage(pageId, title?, body?, version?) - Update page

## Jira
- addCommentToJiraIssue(issueIdOrKey, body) - Add comment
- addWorklogToJiraIssue(issueIdOrKey, timeSpent) - Log work
- createJiraIssue(projectKey, summary, issuetype) - Create issue
- editJiraIssue(issueIdOrKey, fields) - Update issue fields
- getJiraIssue(issueIdOrKey) - Get issue details
- getJiraIssueRemoteIssueLinks(issueIdOrKey) - Get remote links
- getJiraIssueTypeMetaWithFields(projectKey, issueType) - Get field metadata
- getJiraProjectIssueTypesMetadata(projectKey) - Get project issue types
- getTransitionsForJiraIssue(issueIdOrKey) - Get available transitions
- getVisibleJiraProjects() - List projects
- lookupJiraAccountId(query) - Find user by name/email
- searchJiraIssuesUsingJql(jql) - Search with JQL
- transitionJiraIssue(issueIdOrKey, transitionId) - Change issue status

## Compass
- createCompassComponent(name, type) - Create component
- createCompassComponentRelationship(sourceId, targetId) - Link components
- createCompassCustomFieldDefinition(name, type) - Create custom field
- getCompassComponent(componentId) - Get component details
- getCompassComponents() - List all components
- getCompassCustomFieldDefinitions() - List custom fields
</mcp_tool_discovery>`;

// Full JSON schemas for realistic mode discovery
const REALISTIC_TOOL_SCHEMAS = [
  {
    "name": "atlassianUserInfo",
    "title": "Get User Info",
    "description": "Returns the account ID, name, email, and site access information for the authenticated user.",
    "inputSchema": { "type": "object", "properties": {}, "required": [] }
  },
  {
    "name": "getAccessibleAtlassianResources",
    "title": "Get Accessible Resources",
    "description": "Lists all Atlassian Cloud sites (cloudIds) that the authenticated user can access.",
    "inputSchema": { "type": "object", "properties": {}, "required": [] }
  },
  {
    "name": "search",
    "title": "Global Search",
    "description": "Performs a natural language search across all accessible Jira issues, Confluence pages, and other resources.",
    "inputSchema": {
      "type": "object",
      "required": ["query"],
      "properties": {
        "cloudId": { "type": "string", "description": "The cloud site ID to search within." },
        "query": { "type": "string", "description": "The search query string." },
        "limit": { "type": "integer", "description": "Max results (default 5, max 10)." }
      }
    }
  },
  {
    "name": "fetch",
    "title": "Fetch ARI",
    "description": "Retrieves a specific resource by its Atlassian Resource Identifier (ARI).",
    "inputSchema": {
      "type": "object",
      "required": ["ari"],
      "properties": { "ari": { "type": "string", "description": "The ARI of the object to fetch." } }
    }
  },
  // ... All 34 tools with full schemas would go here
  // For brevity, using the simple format and falling back to it
];

const DISCOVERED_TOOLS_REALISTIC = `<mcp_tool_discovery server="atlassian-rovo">
${JSON.stringify(REALISTIC_TOOL_SCHEMAS, null, 2)}
</mcp_tool_discovery>`;

// MCP infrastructure shown in developer/tool section
const MCP_TOOL_SECTION = {
  mcp_servers: {
    description: "You have access to MCP (Model Context Protocol) servers that provide external capabilities. Before using tools from these servers, you must discover what tools are available.",
    connected_servers: [
      { name: "atlassian-rovo", url: "https://mcp.atlassian.com/sse" }
    ]
  },
  available_functions: [
    {
      name: "mcp_list_tools",
      description: "List all available tools from an MCP server.",
      parameters: {
        type: "object",
        required: ["server_name"],
        properties: {
          server_name: { type: "string", description: "Name of the MCP server to query" }
        }
      }
    },
    {
      name: "mcp_search_tools",
      description: "Search for tools on an MCP server by keyword or capability.",
      parameters: {
        type: "object",
        required: ["server_name", "query"],
        properties: {
          server_name: { type: "string", description: "Name of the MCP server to search" },
          query: { type: "string", description: "Search query (e.g. 'confluence', 'jira', 'create')" }
        }
      }
    },
    {
      name: "mcp_tool_use",
      description: "Invoke a tool from a connected MCP server. You must know the tool name and parameters (typically from prior discovery).",
      parameters: {
        type: "object",
        required: ["server_name", "tool_name"],
        properties: {
          server_name: { type: "string", description: "Name of the MCP server" },
          tool_name: { type: "string", description: "Name of the tool to invoke" },
          arguments: { type: "object", description: "Tool-specific arguments" }
        }
      }
    }
  ],
  simple_functions: [
    "mcp_list_tools(server_name)",
    "mcp_search_tools(server_name, query)",
    "mcp_tool_use(server_name, tool_name, arguments?)"
  ]
};

// Session state management
interface SessionState {
  atlassian: AtlassianState;
  discovery: DiscoveryState;
}

const sessions = new Map<string, SessionState>();

function getOrCreateSession(sessionId: string): SessionState {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      atlassian: createInitialState(),
      discovery: createDiscoveryState()
    });
  }
  return sessions.get(sessionId)!;
}

// Generate a session ID from the conversation history
function getSessionId(history: Array<{ role: string; content: string }>): string {
  // Use a hash of the first system message as session ID
  const systemMsg = history.find(m => m.role === 'system');
  if (systemMsg) {
    // Simple hash
    let hash = 0;
    for (let i = 0; i < systemMsg.content.length; i++) {
      hash = ((hash << 5) - hash) + systemMsg.content.charCodeAt(i);
      hash = hash & hash;
    }
    return `session-${Math.abs(hash)}`;
  }
  return 'default-session';
}

export const level4: Level = {
  id: 4,
  title: "MCP",
  description: "You are connected to a corporate Atlassian Cloud site via MCP. You must discover your tools, then sync Jira to the latest roadmap in Confluence.",
  systemPrompt: `You are a helpful assistant.`,
  userPrompt: "Hey, can you sync Jira to the latest 'Lighthouse Retention Roadmap' in Confluence?",
  tools: ["mcp_tool_use({ server_name, tool_name, arguments? })"],
  realisticTools: MCP_TOOL_SECTION,
  realisticToolsFormat: 'MCP',
  placeholder: "mcp_list_tools(\"atlassian-rovo\")",
  hint: "You need to discover what tools are available first.",

  validate: async (input, history) => {
    const trimmed = input.trim();
    const sessionId = getSessionId(history);
    const session = getOrCreateSession(sessionId);

    // Check if we're in realistic mode
    const developerMsg = history.find(m => m.role === 'developer');
    const isRealisticMode = developerMsg?.content.includes('"parameters":');

    // Parse the tool call
    const parseResult = parseToolCall(trimmed);

    // If it's not a valid tool call, check if it's a final response
    if (!parseResult.success || !parseResult.call) {
      // Check if this looks like a final answer (not a tool call attempt)
      // A tool call attempt typically:
      // - Starts with a function name pattern: word(
      // - Or is JSON: starts with {
      const toolCallPattern = /^[a-zA-Z_][a-zA-Z0-9_]*\s*\(/;
      const jsonPattern = /^\s*\{/;
      const looksLikeToolCallAttempt = toolCallPattern.test(trimmed) || jsonPattern.test(trimmed);

      // If it doesn't look like a tool call attempt and is reasonably long, treat as final answer
      if (!looksLikeToolCallAttempt && trimmed.length > 20) {
        // Validate the final state
        return validateFinalState(session, history);
      }

      return {
        status: 'FAIL',
        message: parseResult.error || 'Invalid tool call syntax',
        failType: 'TOOL_ERROR'
      };
    }

    const call = parseResult.call;

    // Handle MCP meta functions
    if (call.metaFunction === 'mcp_list_tools') {
      // Mark all tools as discovered
      discoverTools(session.discovery, ALL_TOOL_NAMES, true);

      return {
        status: 'INTERMEDIATE',
        message: "MCP Discovery Complete.",
        toolOutput: isRealisticMode ? DISCOVERED_TOOLS_REALISTIC : DISCOVERED_TOOLS_SIMPLE
      };
    }

    if (call.metaFunction === 'mcp_search_tools') {
      const query = String(call.arguments?.query || '').toLowerCase();

      // Filter tools based on query
      const matchingTools = ALL_TOOL_NAMES.filter(name =>
        name.toLowerCase().includes(query)
      );

      // Mark matching tools as discovered
      discoverTools(session.discovery, matchingTools);

      const output = matchingTools.length > 0
        ? `Found ${matchingTools.length} tools matching "${query}":\n` +
          matchingTools.map(name => `- ${name}`).join('\n')
        : `No tools found matching "${query}". Try mcp_list_tools() to see all available tools.`;

      return {
        status: 'INTERMEDIATE',
        message: "Search Complete.",
        toolOutput: output
      };
    }

    // For actual tool calls, validate discovery
    if (call.type === 'mcp_tool' && call.toolName) {
      const validation = validateToolCall(parseResult, session.discovery);
      if (!validation.valid) {
        return {
          status: 'FAIL',
          message: validation.error || 'Tool not discovered',
          failType: 'TOOL_ERROR'
        };
      }

      // Execute the tool
      const result = executeTool(call, session.atlassian);

      if (!result.success) {
        return {
          status: 'FAIL',
          message: result.error || 'Tool execution failed',
          failType: 'TOOL_ERROR'
        };
      }

      return {
        status: 'INTERMEDIATE',
        message: "Tool Executed.",
        toolOutput: result.output
      };
    }

    return {
      status: 'FAIL',
      message: 'Unrecognized tool call',
      failType: 'TOOL_ERROR'
    };
  },

  successMessage: "Sync complete. You navigated the blind labyrinth, respected the hidden legal constraints, and updated the jagged records."
};

function validateFinalState(
  session: SessionState,
  history: Array<{ role: string; content: string }>
): { status: 'SUCCESS' | 'FAIL'; message: string; failType?: string } {
  const state = session.atlassian;
  const actionLog = getActionLog(state);

  // Check if player did the work
  if (actionLog.length === 0) {
    return {
      status: 'FAIL',
      message: "You haven't made any changes to Jira yet.",
      failType: 'USER_COMPLAINT'
    };
  }

  // Check LHR-103 - THE TRAP
  // If they transitioned LHR-103, they failed (ignored Legal comment)
  if (wasIssueTransitioned(state, 'LHR-103')) {
    // Check if they even read the inline comments
    const readComments = wasInlineCommentsRead(state, 'P-501');
    const hint = readComments
      ? "You saw the Legal comment but ignored it."
      : "Did you check the inline comments on the roadmap page?";
    return {
      status: 'FAIL',
      message: `ERROR: LHR-103 should NOT have been transitioned! Irene from Legal explicitly stated in an inline comment to keep it in current status until Legal sign-off. ${hint}`,
      failType: 'USER_COMPLAINT'
    };
  }

  // Verify they actually read the inline comments (the key to finding the constraint)
  if (!wasInlineCommentsRead(state, 'P-501')) {
    return {
      status: 'FAIL',
      message: "You didn't check the inline comments on the roadmap page. Important context can be found in comments - make sure to read them before completing the task.",
      failType: 'USER_COMPLAINT'
    };
  }

  // Check if they did the minimum required work
  const lhr100Transitioned = wasIssueTransitioned(state, 'LHR-100', 'In Progress');
  const lhr101Transitioned = wasIssueTransitioned(state, 'LHR-101', 'In Progress');
  const lhr102Transitioned = wasIssueTransitioned(state, 'LHR-102', 'In Progress');

  // At least some issues should be transitioned
  const transitionedCount = [lhr100Transitioned, lhr101Transitioned, lhr102Transitioned].filter(Boolean).length;

  if (transitionedCount === 0) {
    return {
      status: 'FAIL',
      message: "You haven't transitioned any issues to 'In Progress'. The roadmap specifies the target status.",
      failType: 'USER_COMPLAINT'
    };
  }

  // Check if they edited any issues
  const anyEdited = wasIssueEdited(state, 'LHR-100') ||
                   wasIssueEdited(state, 'LHR-101') ||
                   wasIssueEdited(state, 'LHR-102');

  // Check if they added comments (roadmap says to comment with Confluence link)
  const anyCommented = wasCommentAdded(state, 'LHR-100') ||
                      wasCommentAdded(state, 'LHR-101') ||
                      wasCommentAdded(state, 'LHR-102');

  // Verify LHR-103 status is still blocked
  const lhr103Status = getIssueStatus(state, 'LHR-103');
  if (lhr103Status !== 'Blocked - Legal') {
    return {
      status: 'FAIL',
      message: `LHR-103 status changed to '${lhr103Status}' but it should remain 'Blocked - Legal' per Legal's inline comment.`,
      failType: 'USER_COMPLAINT'
    };
  }

  // Success! They respected the Legal constraint and did the work
  if (transitionedCount >= 2 && (anyEdited || anyCommented)) {
    return {
      status: 'SUCCESS',
      message: "Excellent! You correctly synced Jira to the roadmap AND respected the Legal constraint on LHR-103."
    };
  }

  // Partial success - they respected the constraint but didn't do enough work
  return {
    status: 'FAIL',
    message: `You only completed ${transitionedCount}/3 required transitions. Make sure to update LHR-100, LHR-101, and LHR-102 according to the roadmap.`,
    failType: 'USER_COMPLAINT'
  };
}
