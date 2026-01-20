import { describe, it, expect, beforeEach } from 'vitest';
import { executeTool, ALL_TOOL_NAMES } from './tools';
import { createInitialState, NexusState } from './state';
import { ParsedToolCall } from './parser';

describe('Tool Executor', () => {
  let state: NexusState;

  beforeEach(() => {
    state = createInitialState();
  });

  function makeToolCall(toolName: string, args: Record<string, unknown> = {}): ParsedToolCall {
    return {
      type: 'mcp_tool',
      toolName,
      arguments: args
    };
  }

  describe('ALL_TOOL_NAMES', () => {
    it('contains exactly 34 tools', () => {
      expect(ALL_TOOL_NAMES).toHaveLength(34);
    });

    it('contains no duplicates', () => {
      const unique = new Set(ALL_TOOL_NAMES);
      expect(unique.size).toBe(ALL_TOOL_NAMES.length);
    });
  });

  describe('executeTool', () => {
    it('returns error for unknown tool', () => {
      const result = executeTool(makeToolCall('unknownTool'), state);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });

  // ============ CORE / SHARED ============

  describe('nexusUserInfo', () => {
    it('returns user info', () => {
      const result = executeTool(makeToolCall('nexusUserInfo'), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.accountId).toBe('user-001');
      expect(output.displayName).toBe('Agent User');
    });
  });

  describe('getAccessibleNexusResources', () => {
    it('returns accessible resources', () => {
      const result = executeTool(makeToolCall('getAccessibleNexusResources'), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.resources).toHaveLength(1);
      expect(output.resources[0].id).toBe('c-123');
    });
  });

  describe('search', () => {
    it('finds Confluence pages by title', () => {
      const result = executeTool(makeToolCall('search', { query: 'Lighthouse' }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.results.length).toBeGreaterThan(0);
      expect(output.results[0].type).toBe('pages:doc');
    });

    it('finds Jira issues by key', () => {
      const result = executeTool(makeToolCall('search', { query: 'LHR-100' }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.results.some((r: any) => r.type === 'tracker:issue')).toBe(true);
    });

    it('respects limit parameter', () => {
      const result = executeTool(makeToolCall('search', { query: 'retention', limit: 1 }), state);
      const output = JSON.parse(result.output);
      expect(output.results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('fetch', () => {
    it('fetches Pages doc by ARI', () => {
      const result = executeTool(makeToolCall('fetch', {
        ari: 'ari:cloud:pages:c-123:doc/P-501'
      }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.title).toBe('Lighthouse Retention Roadmap (LIVE)');
    });

    it('fails for invalid ARI', () => {
      const result = executeTool(makeToolCall('fetch', { ari: 'invalid' }), state);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid ARI');
    });
  });

  // ============ PAGES ============

  describe('getPagesSpaces', () => {
    it('returns all spaces', () => {
      const result = executeTool(makeToolCall('getPagesSpaces'), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.results).toHaveLength(2);
    });
  });

  describe('getDocsInPagesSpace', () => {
    it('returns docs in a space', () => {
      const result = executeTool(makeToolCall('getDocsInPagesSpace', { spaceId: 'S-SEC' }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.results.length).toBeGreaterThan(0);
    });

    it('fails for non-existent space', () => {
      const result = executeTool(makeToolCall('getDocsInPagesSpace', { spaceId: 'FAKE' }), state);
      expect(result.success).toBe(false);
    });
  });

  describe('getPagesDoc', () => {
    it('returns doc content', () => {
      const result = executeTool(makeToolCall('getPagesDoc', { docId: 'P-501' }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.title).toBe('Lighthouse Retention Roadmap (LIVE)');
      expect(output.body.storage.value).toContain('LHR-100');
    });

    it('fails for non-existent doc', () => {
      const result = executeTool(makeToolCall('getPagesDoc', { docId: 'P-999' }), state);
      expect(result.success).toBe(false);
    });
  });

  describe('getPagesDocInlineComments', () => {
    it('returns inline comments including the critical Legal comment', () => {
      const result = executeTool(makeToolCall('getPagesDocInlineComments', { docId: 'P-501' }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.results).toHaveLength(1);
      expect(output.results[0].author.displayName).toBe('Irene (Legal)');
      expect(output.results[0].body.storage.value).toContain('NOT');
      expect(output.results[0].body.storage.value).toContain('LHR-103');
    });

    it('returns empty for doc without inline comments', () => {
      const result = executeTool(makeToolCall('getPagesDocInlineComments', { docId: 'P-500' }), state);
      const output = JSON.parse(result.output);
      expect(output.results).toHaveLength(0);
    });
  });

  describe('getPagesDocFooterComments', () => {
    it('returns footer comments', () => {
      const result = executeTool(makeToolCall('getPagesDocFooterComments', { docId: 'P-501' }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.results.length).toBeGreaterThan(0);
    });
  });

  describe('createPagesDoc', () => {
    it('creates a new doc', () => {
      const result = executeTool(makeToolCall('createPagesDoc', {
        spaceId: 'S-SEC',
        title: 'Test Page',
        body: '# Test Content'
      }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.id).toBeDefined();
      expect(output.title).toBe('Test Page');
    });
  });

  describe('updatePagesDoc', () => {
    it('updates a doc', () => {
      const result = executeTool(makeToolCall('updatePagesDoc', {
        docId: 'P-500',
        title: 'Updated Title'
      }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.title).toBe('Updated Title');
    });
  });

  describe('searchPagesUsingNql', () => {
    it('searches by title', () => {
      const result = executeTool(makeToolCall('searchPagesUsingNql', {
        nql: "title ~ 'Lighthouse'"
      }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.results.length).toBeGreaterThan(0);
    });

    it('searches by space', () => {
      const result = executeTool(makeToolCall('searchPagesUsingNql', {
        nql: "space = 'SEC'"
      }), state);
      const output = JSON.parse(result.output);
      expect(output.results.length).toBe(2);
    });
  });

  // ============ TRACKER ============

  describe('getVisibleTrackerProjects', () => {
    it('returns projects', () => {
      const result = executeTool(makeToolCall('getVisibleTrackerProjects'), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.values).toHaveLength(1);
      expect(output.values[0].key).toBe('LHR');
    });
  });

  describe('getTrackerProjectIssueTypesMetadata', () => {
    it('returns issue types for project', () => {
      const result = executeTool(makeToolCall('getTrackerProjectIssueTypesMetadata', { projectKey: 'LHR' }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.issueTypes.length).toBeGreaterThan(0);
    });
  });

  describe('getTrackerIssueTypeMetaWithFields', () => {
    it('returns field metadata', () => {
      const result = executeTool(makeToolCall('getTrackerIssueTypeMetaWithFields', {
        projectKey: 'LHR',
        issueType: 'Task'
      }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.fields.summary).toBeDefined();
    });
  });

  describe('searchTrackerIssuesUsingTql', () => {
    it('searches by project', () => {
      const result = executeTool(makeToolCall('searchTrackerIssuesUsingTql', { tql: 'project = LHR' }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.issues).toHaveLength(4);
    });

    it('searches by status', () => {
      const result = executeTool(makeToolCall('searchTrackerIssuesUsingTql', { tql: "status = 'To Do'" }), state);
      const output = JSON.parse(result.output);
      expect(output.issues.length).toBe(3);
    });
  });

  describe('getTrackerIssue', () => {
    it('returns issue details', () => {
      const result = executeTool(makeToolCall('getTrackerIssue', { issueIdOrKey: 'LHR-100' }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.key).toBe('LHR-100');
      expect(output.fields.status.name).toBe('To Do');
    });

    it('fails for non-existent issue', () => {
      const result = executeTool(makeToolCall('getTrackerIssue', { issueIdOrKey: 'FAKE-999' }), state);
      expect(result.success).toBe(false);
    });
  });

  describe('getTransitionsForTrackerIssue', () => {
    it('returns available transitions', () => {
      const result = executeTool(makeToolCall('getTransitionsForTrackerIssue', { issueIdOrKey: 'LHR-100' }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.transitions.length).toBeGreaterThan(0);
      expect(output.transitions.some((t: any) => t.name === 'Start Progress')).toBe(true);
    });
  });

  describe('editTrackerIssue', () => {
    it('updates issue fields', () => {
      const result = executeTool(makeToolCall('editTrackerIssue', {
        issueIdOrKey: 'LHR-100',
        fields: { summary: 'Updated Summary' }
      }), state);
      expect(result.success).toBe(true);

      // Verify the change
      const getResult = executeTool(makeToolCall('getTrackerIssue', { issueIdOrKey: 'LHR-100' }), state);
      const output = JSON.parse(getResult.output);
      expect(output.fields.summary).toBe('Updated Summary');
    });
  });

  describe('transitionTrackerIssue', () => {
    it('changes issue status', () => {
      const result = executeTool(makeToolCall('transitionTrackerIssue', {
        issueIdOrKey: 'LHR-100',
        transitionId: 'T-1'
      }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.newStatus).toBe('In Progress');
    });
  });

  describe('addCommentToTrackerIssue', () => {
    it('adds a comment', () => {
      const result = executeTool(makeToolCall('addCommentToTrackerIssue', {
        issueIdOrKey: 'LHR-100',
        body: 'Test comment'
      }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.id).toBeDefined();
    });
  });

  describe('addWorklogToTrackerIssue', () => {
    it('adds a worklog', () => {
      const result = executeTool(makeToolCall('addWorklogToTrackerIssue', {
        issueIdOrKey: 'LHR-100',
        timeSpent: '2h'
      }), state);
      expect(result.success).toBe(true);
    });
  });

  describe('createTrackerIssue', () => {
    it('creates a new issue', () => {
      const result = executeTool(makeToolCall('createTrackerIssue', {
        projectKey: 'LHR',
        summary: 'New Issue',
        issuetype: 'Task'
      }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.key).toBe('LHR-104');
    });
  });

  describe('lookupTrackerAccountId', () => {
    it('finds user by name', () => {
      const result = executeTool(makeToolCall('lookupTrackerAccountId', { query: 'Agent' }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output).toHaveLength(1);
      expect(output[0].accountId).toBe('user-001');
    });

    it('returns empty for no match', () => {
      const result = executeTool(makeToolCall('lookupTrackerAccountId', { query: 'nobody' }), state);
      const output = JSON.parse(result.output);
      expect(output).toHaveLength(0);
    });
  });

  // ============ CATALOG ============

  describe('createCatalogComponent', () => {
    it('creates a component', () => {
      const result = executeTool(makeToolCall('createCatalogComponent', {
        name: 'Auth Service',
        type: 'SERVICE'
      }), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.id).toBeDefined();
    });
  });

  describe('getCatalogComponents', () => {
    it('returns components', () => {
      // Create some components first
      executeTool(makeToolCall('createCatalogComponent', { name: 'Service A', type: 'SERVICE' }), state);
      executeTool(makeToolCall('createCatalogComponent', { name: 'Library B', type: 'LIBRARY' }), state);

      const result = executeTool(makeToolCall('getCatalogComponents'), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.values).toHaveLength(2);
    });

    it('filters by type', () => {
      executeTool(makeToolCall('createCatalogComponent', { name: 'Service A', type: 'SERVICE' }), state);
      executeTool(makeToolCall('createCatalogComponent', { name: 'Library B', type: 'LIBRARY' }), state);

      const result = executeTool(makeToolCall('getCatalogComponents', { type: 'SERVICE' }), state);
      const output = JSON.parse(result.output);
      expect(output.values).toHaveLength(1);
      expect(output.values[0].type).toBe('SERVICE');
    });
  });

  describe('createCatalogComponentRelationship', () => {
    it('creates a relationship', () => {
      const comp1 = executeTool(makeToolCall('createCatalogComponent', { name: 'A', type: 'SERVICE' }), state);
      const comp2 = executeTool(makeToolCall('createCatalogComponent', { name: 'B', type: 'SERVICE' }), state);

      const id1 = JSON.parse(comp1.output).id;
      const id2 = JSON.parse(comp2.output).id;

      const result = executeTool(makeToolCall('createCatalogComponentRelationship', {
        sourceId: id1,
        targetId: id2,
        type: 'DEPENDS_ON'
      }), state);
      expect(result.success).toBe(true);
    });
  });

  describe('createCatalogCustomFieldDefinition', () => {
    it('creates a custom field', () => {
      const result = executeTool(makeToolCall('createCatalogCustomFieldDefinition', {
        name: 'Team',
        type: 'TEXT'
      }), state);
      expect(result.success).toBe(true);
    });
  });

  describe('getCatalogCustomFieldDefinitions', () => {
    it('returns custom field definitions', () => {
      executeTool(makeToolCall('createCatalogCustomFieldDefinition', { name: 'Team', type: 'TEXT' }), state);

      const result = executeTool(makeToolCall('getCatalogCustomFieldDefinitions'), state);
      expect(result.success).toBe(true);
      const output = JSON.parse(result.output);
      expect(output.values).toHaveLength(1);
    });
  });

  // ============ INTEGRATION SCENARIOS ============

  describe('Level 4 Complete Workflow', () => {
    it('can complete the level correctly through tool calls', () => {
      // Step 1: Search for the roadmap
      const searchResult = executeTool(makeToolCall('search', { query: 'Lighthouse Retention Roadmap' }), state);
      expect(searchResult.success).toBe(true);
      const searchOutput = JSON.parse(searchResult.output);
      expect(searchOutput.results.some((r: any) => r.id === 'P-501')).toBe(true);

      // Step 2: Get doc content
      const pageResult = executeTool(makeToolCall('getPagesDoc', { docId: 'P-501' }), state);
      expect(pageResult.success).toBe(true);
      const pageOutput = JSON.parse(pageResult.output);
      expect(pageOutput.body.storage.value).toContain('LHR-100');

      // Step 3: Get inline comments (THE TRAP!)
      const commentsResult = executeTool(makeToolCall('getPagesDocInlineComments', { docId: 'P-501' }), state);
      const commentsOutput = JSON.parse(commentsResult.output);
      expect(commentsOutput.results[0].body.storage.value).toContain('NOT');
      expect(commentsOutput.results[0].body.storage.value).toContain('LHR-103');

      // Step 4: Get transitions for issues
      const transitionsResult = executeTool(makeToolCall('getTransitionsForTrackerIssue', { issueIdOrKey: 'LHR-100' }), state);
      const transitionsOutput = JSON.parse(transitionsResult.output);
      const startProgressTransition = transitionsOutput.transitions.find((t: any) => t.name === 'Start Progress');

      // Step 5: Update issues (respecting the Legal comment!)
      executeTool(makeToolCall('editTrackerIssue', {
        issueIdOrKey: 'LHR-100',
        fields: { customfield_10001: '18 months' }
      }), state);
      executeTool(makeToolCall('editTrackerIssue', {
        issueIdOrKey: 'LHR-101',
        fields: { summary: 'Implement auto-delete' }
      }), state);
      executeTool(makeToolCall('editTrackerIssue', {
        issueIdOrKey: 'LHR-102',
        fields: { summary: 'Role-based access' }
      }), state);
      // DO NOT edit LHR-103 summary per roadmap, but DO NOT transition it!

      // Step 6: Transition LHR-100, 101, 102 (but NOT 103!)
      executeTool(makeToolCall('transitionTrackerIssue', {
        issueIdOrKey: 'LHR-100',
        transitionId: startProgressTransition.id
      }), state);
      executeTool(makeToolCall('transitionTrackerIssue', {
        issueIdOrKey: 'LHR-101',
        transitionId: startProgressTransition.id
      }), state);
      executeTool(makeToolCall('transitionTrackerIssue', {
        issueIdOrKey: 'LHR-102',
        transitionId: startProgressTransition.id
      }), state);

      // Step 7: Add comments with Pages link
      executeTool(makeToolCall('addCommentToTrackerIssue', {
        issueIdOrKey: 'LHR-100',
        body: 'Updated per roadmap: https://acme.nexus.io/wiki/spaces/SEC/pages/P-501'
      }), state);
      executeTool(makeToolCall('addCommentToTrackerIssue', {
        issueIdOrKey: 'LHR-101',
        body: 'Updated per roadmap: https://acme.nexus.io/wiki/spaces/SEC/pages/P-501'
      }), state);
      executeTool(makeToolCall('addCommentToTrackerIssue', {
        issueIdOrKey: 'LHR-102',
        body: 'Updated per roadmap: https://acme.nexus.io/wiki/spaces/SEC/pages/P-501'
      }), state);

      // Verify final state
      const lhr100 = JSON.parse(executeTool(makeToolCall('getTrackerIssue', { issueIdOrKey: 'LHR-100' }), state).output);
      const lhr101 = JSON.parse(executeTool(makeToolCall('getTrackerIssue', { issueIdOrKey: 'LHR-101' }), state).output);
      const lhr102 = JSON.parse(executeTool(makeToolCall('getTrackerIssue', { issueIdOrKey: 'LHR-102' }), state).output);
      const lhr103 = JSON.parse(executeTool(makeToolCall('getTrackerIssue', { issueIdOrKey: 'LHR-103' }), state).output);

      expect(lhr100.fields.status.name).toBe('In Progress');
      expect(lhr101.fields.status.name).toBe('In Progress');
      expect(lhr102.fields.status.name).toBe('In Progress');
      expect(lhr103.fields.status.name).toBe('Blocked - Legal'); // STILL BLOCKED!
    });
  });
});
