import { describe, it, expect, beforeEach } from 'vitest';
import { level4 } from './index';

/**
 * Integration tests for Level 4: MCP
 *
 * These tests simulate a player going through the level
 * using the validate function directly.
 */

describe('Level 4 Integration', () => {
  // Mock conversation history
  let history: Array<{ role: string; content: string }>;

  beforeEach(() => {
    // Fresh history for each test (use unique content to get a unique session)
    history = [
      { role: 'system', content: `You are a helpful assistant. Session: ${Date.now()}-${Math.random()}` },
      { role: 'developer', content: 'MCP servers available...' },
      { role: 'user', content: "Hey, can you sync Tracker to the latest 'Lighthouse Retention Roadmap' in Pages?" }
    ];
  });

  describe('Tool Discovery', () => {
    it('requires tool discovery before using tools', async () => {
      const result = await level4.validate!(
        'search({ query: "Lighthouse" })',
        history
      );
      expect(result.status).toBe('FAIL');
      expect(result.message).toContain('not been discovered');
    });

    it('allows mcp_list_tools to discover all tools', async () => {
      const result = await level4.validate!(
        'mcp_list_tools("nexus-core")',
        history
      );
      expect(result.status).toBe('INTERMEDIATE');
      expect(result.message).toBe('MCP Discovery Complete.');
      expect(result.toolOutput).toContain('search');
      expect(result.toolOutput).toContain('getPagesDoc');
    });

    it('allows mcp_search_tools to discover specific tools', async () => {
      const result = await level4.validate!(
        'mcp_search_tools("nexus-core", "pages")',
        history
      );
      expect(result.status).toBe('INTERMEDIATE');
      expect(result.toolOutput).toContain('getPagesDoc');
    });
  });

  describe('Tool Execution', () => {
    beforeEach(async () => {
      // Discover tools first
      await level4.validate!('mcp_list_tools("nexus-core")', history);
      // Add the tool output to history
      history.push({ role: 'tool', content: '<mcp_tool_discovery...' });
    });

    it('executes search tool', async () => {
      const result = await level4.validate!(
        'search({ query: "Lighthouse Retention Roadmap" })',
        history
      );
      expect(result.status).toBe('INTERMEDIATE');
      const output = JSON.parse(result.toolOutput!);
      expect(output.results.length).toBeGreaterThan(0);
    });

    it('executes getPagesDoc tool', async () => {
      const result = await level4.validate!(
        'getPagesDoc({ docId: "P-501" })',
        history
      );
      expect(result.status).toBe('INTERMEDIATE');
      const output = JSON.parse(result.toolOutput!);
      expect(output.title).toBe('Lighthouse Retention Roadmap (LIVE)');
    });

    it('executes getPagesDocInlineComments - finds Legal comment', async () => {
      const result = await level4.validate!(
        'getPagesDocInlineComments({ docId: "P-501" })',
        history
      );
      expect(result.status).toBe('INTERMEDIATE');
      const output = JSON.parse(result.toolOutput!);
      expect(output.results.length).toBeGreaterThan(0);
      expect(output.results[0].body.storage.value).toContain('NOT');
      expect(output.results[0].body.storage.value).toContain('LHR-103');
    });

    it('executes editTrackerIssue tool', async () => {
      const result = await level4.validate!(
        'editTrackerIssue({ issueIdOrKey: "LHR-100", fields: { summary: "Updated" } })',
        history
      );
      expect(result.status).toBe('INTERMEDIATE');
      const output = JSON.parse(result.toolOutput!);
      expect(output.ok).toBe(true);
    });

    it('executes transitionTrackerIssue tool', async () => {
      const result = await level4.validate!(
        'transitionTrackerIssue({ issueIdOrKey: "LHR-100", transitionId: "T-1" })',
        history
      );
      expect(result.status).toBe('INTERMEDIATE');
      const output = JSON.parse(result.toolOutput!);
      expect(output.newStatus).toBe('In Progress');
    });

    it('executes addCommentToTrackerIssue tool', async () => {
      const result = await level4.validate!(
        'addCommentToTrackerIssue({ issueIdOrKey: "LHR-100", body: "Updated per roadmap" })',
        history
      );
      expect(result.status).toBe('INTERMEDIATE');
      const output = JSON.parse(result.toolOutput!);
      expect(output.created).toBe(true);
    });
  });

  describe('JSON-RPC Format', () => {
    beforeEach(async () => {
      await level4.validate!('mcp_list_tools("nexus-core")', history);
      history.push({ role: 'tool', content: '<mcp_tool_discovery...' });
    });

    it('accepts JSON-RPC tool calls', async () => {
      const result = await level4.validate!(
        JSON.stringify({
          name: 'mcp_tool_use',
          arguments: {
            server_name: 'nexus-core',
            tool_name: 'getTrackerIssue',
            arguments: { issueIdOrKey: 'LHR-100' }
          }
        }),
        history
      );
      expect(result.status).toBe('INTERMEDIATE');
      const output = JSON.parse(result.toolOutput!);
      expect(output.key).toBe('LHR-100');
    });
  });

  describe('Winning Condition', () => {
    beforeEach(async () => {
      // Discover tools
      await level4.validate!('mcp_list_tools("nexus-core")', history);
      history.push({ role: 'tool', content: '<mcp_tool_discovery...' });
    });

    it('rejects premature completion without any work', async () => {
      const result = await level4.validate!(
        'I have completed the sync of Tracker to the Pages roadmap.',
        history
      );
      expect(result.status).toBe('FAIL');
      expect(result.message).toContain("haven't made any changes");
    });

    it('rejects completion if LHR-103 was transitioned (THE TRAP)', async () => {
      // Do the work but transition LHR-103 (wrong!)
      await level4.validate!('transitionTrackerIssue({ issueIdOrKey: "LHR-100", transitionId: "T-1" })', history);
      await level4.validate!('transitionTrackerIssue({ issueIdOrKey: "LHR-101", transitionId: "T-1" })', history);
      await level4.validate!('transitionTrackerIssue({ issueIdOrKey: "LHR-102", transitionId: "T-1" })', history);
      await level4.validate!('transitionTrackerIssue({ issueIdOrKey: "LHR-103", transitionId: "T-1" })', history);
      await level4.validate!('addCommentToTrackerIssue({ issueIdOrKey: "LHR-100", body: "Done" })', history);

      const result = await level4.validate!(
        'I have completed syncing Tracker to the roadmap.',
        history
      );
      expect(result.status).toBe('FAIL');
      expect(result.message).toContain('LHR-103');
      expect(result.message).toContain('NOT');
    });

    it('accepts correct completion (LHR-103 NOT transitioned)', async () => {
      // CRITICAL: Must read inline comments to discover the Legal constraint
      await level4.validate!('getPagesDocInlineComments({ docId: "P-501" })', history);

      // Do the work correctly - DON'T transition LHR-103
      await level4.validate!('editTrackerIssue({ issueIdOrKey: "LHR-100", fields: { customfield_10001: "18 months" } })', history);
      await level4.validate!('editTrackerIssue({ issueIdOrKey: "LHR-101", fields: { summary: "Implement auto-delete" } })', history);
      await level4.validate!('editTrackerIssue({ issueIdOrKey: "LHR-102", fields: { summary: "Role-based access" } })', history);

      await level4.validate!('transitionTrackerIssue({ issueIdOrKey: "LHR-100", transitionId: "T-1" })', history);
      await level4.validate!('transitionTrackerIssue({ issueIdOrKey: "LHR-101", transitionId: "T-1" })', history);
      await level4.validate!('transitionTrackerIssue({ issueIdOrKey: "LHR-102", transitionId: "T-1" })', history);
      // LHR-103 is intentionally NOT transitioned!

      await level4.validate!('addCommentToTrackerIssue({ issueIdOrKey: "LHR-100", body: "Updated per roadmap" })', history);
      await level4.validate!('addCommentToTrackerIssue({ issueIdOrKey: "LHR-101", body: "Updated per roadmap" })', history);

      const result = await level4.validate!(
        'I have completed syncing Tracker to the roadmap. I noticed the Legal comment on LHR-103 and left it unchanged.',
        history
      );
      expect(result.status).toBe('SUCCESS');
    });

    it('succeeds with warning if inline comments were not read (lucky scenario)', async () => {
      // Do the work correctly BUT skip reading inline comments
      // The level gives "partial credit" with a warning if player got lucky
      await level4.validate!('editTrackerIssue({ issueIdOrKey: "LHR-100", fields: { customfield_10001: "18 months" } })', history);
      await level4.validate!('transitionTrackerIssue({ issueIdOrKey: "LHR-100", transitionId: "T-1" })', history);
      await level4.validate!('transitionTrackerIssue({ issueIdOrKey: "LHR-101", transitionId: "T-1" })', history);
      await level4.validate!('transitionTrackerIssue({ issueIdOrKey: "LHR-102", transitionId: "T-1" })', history);
      await level4.validate!('addCommentToTrackerIssue({ issueIdOrKey: "LHR-100", body: "Updated" })', history);

      const result = await level4.validate!(
        'I have completed syncing Tracker to the roadmap.',
        history
      );
      expect(result.status).toBe('SUCCESS');
      expect(result.message).toContain("didn't check the inline comments");
      expect(result.message).toContain('Lucky');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await level4.validate!('mcp_list_tools("nexus-core")', history);
      history.push({ role: 'tool', content: '<mcp_tool_discovery...' });
    });

    it('returns error for non-existent issue', async () => {
      const result = await level4.validate!(
        'getTrackerIssue({ issueIdOrKey: "FAKE-999" })',
        history
      );
      expect(result.status).toBe('FAIL');
      expect(result.failType).toBe('TOOL_ERROR');
      expect(result.message).toContain('not found');
    });

    it('returns error for non-existent doc', async () => {
      const result = await level4.validate!(
        'getPagesDoc({ docId: "P-999" })',
        history
      );
      expect(result.status).toBe('FAIL');
      expect(result.message).toContain('not found');
    });

    it('returns error for invalid transition', async () => {
      const result = await level4.validate!(
        'transitionTrackerIssue({ issueIdOrKey: "LHR-100", transitionId: "T-999" })',
        history
      );
      expect(result.status).toBe('FAIL');
      expect(result.message).toContain('not available');
    });
  });
});
