import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseToolCall,
  createDiscoveryState,
  discoverTools,
  isToolDiscovered,
  validateToolCall,
  DiscoveryState,
} from './parser';

describe('parseToolCall', () => {
  describe('mcp_list_tools', () => {
    it('parses simple format: mcp_list_tools("server")', () => {
      const result = parseToolCall('mcp_list_tools("nexus-core")');
      expect(result.success).toBe(true);
      expect(result.call?.type).toBe('mcp_meta');
      expect(result.call?.metaFunction).toBe('mcp_list_tools');
      expect(result.call?.serverName).toBe('nexus-core');
    });

    it('parses with single quotes: mcp_list_tools(\'server\')', () => {
      const result = parseToolCall("mcp_list_tools('nexus-core')");
      expect(result.success).toBe(true);
      expect(result.call?.serverName).toBe('nexus-core');
    });

    it('parses with no argument: mcp_list_tools()', () => {
      const result = parseToolCall('mcp_list_tools()');
      expect(result.success).toBe(true);
      expect(result.call?.metaFunction).toBe('mcp_list_tools');
      expect(result.call?.serverName).toBeUndefined();
    });

    it('parses JSON-RPC format', () => {
      const input = JSON.stringify({
        name: 'mcp_list_tools',
        arguments: { server_name: 'nexus-core' }
      });
      const result = parseToolCall(input);
      expect(result.success).toBe(true);
      expect(result.call?.type).toBe('mcp_meta');
      expect(result.call?.metaFunction).toBe('mcp_list_tools');
      expect(result.call?.serverName).toBe('nexus-core');
    });
  });

  describe('mcp_search_tools', () => {
    it('parses simple format: mcp_search_tools("server", "query")', () => {
      const result = parseToolCall('mcp_search_tools("nexus-core", "pages")');
      expect(result.success).toBe(true);
      expect(result.call?.type).toBe('mcp_meta');
      expect(result.call?.metaFunction).toBe('mcp_search_tools');
      expect(result.call?.serverName).toBe('nexus-core');
      expect(result.call?.arguments?.query).toBe('pages');
    });

    it('fails without required arguments', () => {
      const result = parseToolCall('mcp_search_tools("nexus-core")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('server_name');
    });

    it('parses JSON-RPC format', () => {
      const input = JSON.stringify({
        name: 'mcp_search_tools',
        arguments: { server_name: 'nexus-core', query: 'tracker issue' }
      });
      const result = parseToolCall(input);
      expect(result.success).toBe(true);
      expect(result.call?.arguments?.query).toBe('tracker issue');
    });
  });

  describe('mcp_tool_use', () => {
    it('parses positional format: mcp_tool_use("server", "tool")', () => {
      const result = parseToolCall('mcp_tool_use("nexus-core", "getPagesDoc")');
      expect(result.success).toBe(true);
      expect(result.call?.type).toBe('mcp_tool');
      expect(result.call?.metaFunction).toBe('mcp_tool_use');
      expect(result.call?.serverName).toBe('nexus-core');
      expect(result.call?.toolName).toBe('getPagesDoc');
    });

    it('parses with arguments: mcp_tool_use("server", "tool", { args })', () => {
      const result = parseToolCall('mcp_tool_use("nexus-core", "getPagesDoc", { "docId": "P-501" })');
      expect(result.success).toBe(true);
      expect(result.call?.toolName).toBe('getPagesDoc');
      expect(result.call?.arguments).toEqual({ docId: 'P-501' });
    });

    it('parses with loose JS object arguments', () => {
      const result = parseToolCall('mcp_tool_use("nexus-core", "getPagesDoc", { docId: "P-501" })');
      expect(result.success).toBe(true);
      expect(result.call?.arguments).toEqual({ docId: 'P-501' });
    });

    it('parses object format: mcp_tool_use({ server_name, tool_name, arguments })', () => {
      const result = parseToolCall('mcp_tool_use({ server_name: "nexus-core", tool_name: "search", arguments: { query: "roadmap" } })');
      expect(result.success).toBe(true);
      expect(result.call?.serverName).toBe('nexus-core');
      expect(result.call?.toolName).toBe('search');
      expect(result.call?.arguments).toEqual({ query: 'roadmap' });
    });

    it('parses JSON-RPC format', () => {
      const input = JSON.stringify({
        name: 'mcp_tool_use',
        arguments: {
          server_name: 'nexus-core',
          tool_name: 'editTrackerIssue',
          arguments: { issueIdOrKey: 'LHR-100', fields: { summary: 'New summary' } }
        }
      });
      const result = parseToolCall(input);
      expect(result.success).toBe(true);
      expect(result.call?.toolName).toBe('editTrackerIssue');
      expect(result.call?.arguments).toEqual({
        issueIdOrKey: 'LHR-100',
        fields: { summary: 'New summary' }
      });
    });

    it('fails without server_name', () => {
      const result = parseToolCall('mcp_tool_use("", "getPagesDoc")');
      expect(result.success).toBe(false);
    });

    it('fails without tool_name', () => {
      const result = parseToolCall('mcp_tool_use("nexus-core", "")');
      expect(result.success).toBe(false);
    });
  });

  describe('direct tool calls', () => {
    it('parses direct call with object args: search({ query: "roadmap" })', () => {
      const result = parseToolCall('search({ query: "roadmap" })');
      expect(result.success).toBe(true);
      expect(result.call?.type).toBe('mcp_tool');
      expect(result.call?.toolName).toBe('search');
      expect(result.call?.arguments).toEqual({ query: 'roadmap' });
    });

    it('parses direct call with JSON args: getPagesDoc({ "docId": "P-501" })', () => {
      const result = parseToolCall('getPagesDoc({ "docId": "P-501" })');
      expect(result.success).toBe(true);
      expect(result.call?.toolName).toBe('getPagesDoc');
      expect(result.call?.arguments).toEqual({ docId: 'P-501' });
    });

    it('parses direct call with no args: getPagesSpaces()', () => {
      const result = parseToolCall('getPagesSpaces()');
      expect(result.success).toBe(true);
      expect(result.call?.toolName).toBe('getPagesSpaces');
      expect(result.call?.arguments).toEqual({});
    });

    it('parses JSON-RPC direct tool call', () => {
      const input = JSON.stringify({
        name: 'getTrackerIssue',
        arguments: { issueIdOrKey: 'LHR-100' }
      });
      const result = parseToolCall(input);
      expect(result.success).toBe(true);
      expect(result.call?.toolName).toBe('getTrackerIssue');
    });
  });

  describe('complex arguments', () => {
    it('handles nested objects', () => {
      const result = parseToolCall('editTrackerIssue({ issueIdOrKey: "LHR-100", fields: { summary: "New", priority: { id: "2" } } })');
      expect(result.success).toBe(true);
      expect(result.call?.arguments).toEqual({
        issueIdOrKey: 'LHR-100',
        fields: { summary: 'New', priority: { id: '2' } }
      });
    });

    it('handles arrays in arguments', () => {
      const result = parseToolCall('searchTrackerIssuesUsingTql({ jql: "project = LHR", fields: ["summary", "status"] })');
      expect(result.success).toBe(true);
      expect((result.call?.arguments as any)?.fields).toEqual(['summary', 'status']);
    });

    it('handles multiline input', () => {
      const input = `mcp_tool_use(
        "nexus-core",
        "editTrackerIssue",
        {
          "issueIdOrKey": "LHR-100",
          "fields": {
            "summary": "Updated summary"
          }
        }
      )`;
      const result = parseToolCall(input);
      expect(result.success).toBe(true);
      expect(result.call?.toolName).toBe('editTrackerIssue');
    });

    it('handles strings with commas and special chars', () => {
      const result = parseToolCall('addCommentToTrackerIssue({ issueIdOrKey: "LHR-100", body: "See: https://example.com, also check docs" })');
      expect(result.success).toBe(true);
      expect((result.call?.arguments as any)?.body).toBe('See: https://example.com, also check docs');
    });
  });

  describe('error handling', () => {
    it('returns error for invalid syntax', () => {
      const result = parseToolCall('not a valid call');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error for malformed JSON', () => {
      const result = parseToolCall('{ name: broken json }');
      expect(result.success).toBe(false);
    });

    it('returns error for missing parentheses', () => {
      const result = parseToolCall('getPagesDoc');
      expect(result.success).toBe(false);
    });

    it('returns error for unbalanced braces', () => {
      const result = parseToolCall('search({ query: "test" )');
      expect(result.success).toBe(false);
    });
  });

  describe('whitespace handling', () => {
    it('handles leading/trailing whitespace', () => {
      const result = parseToolCall('   mcp_list_tools("nexus-core")   ');
      expect(result.success).toBe(true);
    });

    it('handles whitespace around arguments', () => {
      const result = parseToolCall('mcp_tool_use(  "nexus-core"  ,  "search"  ,  { query: "test" }  )');
      expect(result.success).toBe(true);
    });
  });
});

describe('DiscoveryState', () => {
  let state: DiscoveryState;

  beforeEach(() => {
    state = createDiscoveryState();
  });

  describe('createDiscoveryState', () => {
    it('creates empty state', () => {
      expect(state.discoveredTools.size).toBe(0);
      expect(state.fullDiscoveryRun).toBe(false);
    });
  });

  describe('discoverTools', () => {
    it('adds tools to discovered set', () => {
      discoverTools(state, ['search', 'getPagesDoc']);
      expect(state.discoveredTools.has('search')).toBe(true);
      expect(state.discoveredTools.has('getPagesDoc')).toBe(true);
    });

    it('marks full discovery when specified', () => {
      discoverTools(state, ['search'], true);
      expect(state.fullDiscoveryRun).toBe(true);
    });

    it('does not duplicate tools', () => {
      discoverTools(state, ['search', 'search', 'search']);
      expect(state.discoveredTools.size).toBe(1);
    });
  });

  describe('isToolDiscovered', () => {
    it('returns true for discovered tools', () => {
      discoverTools(state, ['getTrackerIssue']);
      expect(isToolDiscovered(state, 'getTrackerIssue')).toBe(true);
    });

    it('returns false for undiscovered tools', () => {
      expect(isToolDiscovered(state, 'getTrackerIssue')).toBe(false);
    });
  });
});

describe('validateToolCall', () => {
  let state: DiscoveryState;

  beforeEach(() => {
    state = createDiscoveryState();
  });

  describe('MCP meta functions', () => {
    it('allows mcp_list_tools without discovery', () => {
      const parsed = parseToolCall('mcp_list_tools("nexus-core")');
      const validation = validateToolCall(parsed, state);
      expect(validation.valid).toBe(true);
    });

    it('allows mcp_search_tools without discovery', () => {
      const parsed = parseToolCall('mcp_search_tools("nexus-core", "jira")');
      const validation = validateToolCall(parsed, state);
      expect(validation.valid).toBe(true);
    });

    it('rejects mcp_tool_use with undiscovered tool', () => {
      const parsed = parseToolCall('mcp_tool_use("nexus-core", "search", { query: "test" })');
      const validation = validateToolCall(parsed, state);
      // mcp_tool_use with an undiscovered wrapped tool should fail
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('has not been discovered');
    });

    it('allows mcp_tool_use with discovered tool', () => {
      discoverTools(state, ['search']);
      const parsed = parseToolCall('mcp_tool_use("nexus-core", "search", { query: "test" })');
      const validation = validateToolCall(parsed, state);
      expect(validation.valid).toBe(true);
    });
  });

  describe('direct tool calls', () => {
    it('rejects undiscovered tools', () => {
      const parsed = parseToolCall('getPagesDoc({ docId: "P-501" })');
      const validation = validateToolCall(parsed, state);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('has not been discovered');
    });

    it('allows discovered tools', () => {
      discoverTools(state, ['getPagesDoc']);
      const parsed = parseToolCall('getPagesDoc({ docId: "P-501" })');
      const validation = validateToolCall(parsed, state);
      expect(validation.valid).toBe(true);
    });

    it('rejects tools not in search results', () => {
      // Simulate a search that found only pages tools
      discoverTools(state, ['getPagesDoc', 'updatePagesDoc']);

      // Try to use a jira tool
      const parsed = parseToolCall('getTrackerIssue({ issueIdOrKey: "LHR-100" })');
      const validation = validateToolCall(parsed, state);
      expect(validation.valid).toBe(false);
    });

    it('allows all tools after full discovery', () => {
      const allTools = [
        'search', 'getPagesDoc', 'getTrackerIssue', 'editTrackerIssue',
        'transitionTrackerIssue', 'addCommentToTrackerIssue'
      ];
      discoverTools(state, allTools, true);

      for (const tool of allTools) {
        const parsed = parseToolCall(`${tool}()`);
        const validation = validateToolCall(parsed, state);
        expect(validation.valid).toBe(true);
      }
    });
  });

  describe('parse failures', () => {
    it('returns invalid for parse errors', () => {
      const parsed = parseToolCall('invalid syntax');
      const validation = validateToolCall(parsed, state);
      expect(validation.valid).toBe(false);
    });
  });
});

describe('integration scenarios', () => {
  it('handles typical MCP workflow', () => {
    const state = createDiscoveryState();

    // Step 1: List tools (allowed without discovery)
    const listCall = parseToolCall('mcp_list_tools("nexus-core")');
    expect(validateToolCall(listCall, state).valid).toBe(true);

    // Simulate the result: tools are now discovered
    discoverTools(state, [
      'search', 'getPagesDoc', 'getPagesDocInlineComments',
      'getTrackerIssue', 'editTrackerIssue', 'transitionTrackerIssue', 'addCommentToTrackerIssue'
    ], true);

    // Step 2: Search for roadmap
    const searchCall = parseToolCall('search({ query: "Lighthouse Retention Roadmap" })');
    expect(validateToolCall(searchCall, state).valid).toBe(true);

    // Step 3: Get page content
    const pageCall = parseToolCall('getPagesDoc({ docId: "P-501" })');
    expect(validateToolCall(pageCall, state).valid).toBe(true);

    // Step 4: Get inline comments
    const commentsCall = parseToolCall('getPagesDocInlineComments({ docId: "P-501" })');
    expect(validateToolCall(commentsCall, state).valid).toBe(true);

    // Step 5: Edit Jira issue
    const editCall = parseToolCall('editTrackerIssue({ issueIdOrKey: "LHR-100", fields: { customfield_10001: "18 months" } })');
    expect(validateToolCall(editCall, state).valid).toBe(true);
  });

  it('rejects calls when only partial discovery was done', () => {
    const state = createDiscoveryState();

    // Search only found Confluence tools
    const searchCall = parseToolCall('mcp_search_tools("nexus-core", "pages")');
    expect(validateToolCall(searchCall, state).valid).toBe(true);

    // Simulate search results
    discoverTools(state, ['getPagesDoc', 'updatePagesDoc', 'getPagesDocInlineComments']);

    // Confluence tools work
    const pageCall = parseToolCall('getPagesDoc({ docId: "P-501" })');
    expect(validateToolCall(pageCall, state).valid).toBe(true);

    // But Jira tools are rejected
    const jiraCall = parseToolCall('editTrackerIssue({ issueIdOrKey: "LHR-100" })');
    expect(validateToolCall(jiraCall, state).valid).toBe(false);
  });
});
