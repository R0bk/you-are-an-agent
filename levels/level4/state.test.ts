import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialState,
  AtlassianState,
  // Jira mutations
  editJiraIssue,
  transitionJiraIssue,
  addCommentToJiraIssue,
  addWorklogToJiraIssue,
  createJiraIssue,
  // Confluence mutations
  createConfluencePage,
  updateConfluencePage,
  createConfluenceInlineComment,
  createConfluenceFooterComment,
  // Compass mutations
  createCompassComponent,
  createCompassComponentRelationship,
  createCompassCustomFieldDefinition,
  // Validation helpers
  getActionLog,
  hasAction,
  getIssueStatus,
  getIssueComments,
  wasIssueTransitioned,
  wasIssueEdited,
  wasCommentAdded,
} from './state';

describe('AtlassianState', () => {
  let state: AtlassianState;

  beforeEach(() => {
    state = createInitialState();
  });

  describe('createInitialState', () => {
    it('creates state with user info', () => {
      expect(state.user.accountId).toBe('user-001');
      expect(state.user.displayName).toBe('Agent User');
    });

    it('creates state with Atlassian resources', () => {
      expect(state.resources).toHaveLength(1);
      expect(state.resources[0].cloudId).toBe('c-123');
    });

    it('creates initial Jira issues', () => {
      expect(state.jira.issues.size).toBe(4);
      expect(state.jira.issues.has('LHR-100')).toBe(true);
      expect(state.jira.issues.has('LHR-101')).toBe(true);
      expect(state.jira.issues.has('LHR-102')).toBe(true);
      expect(state.jira.issues.has('LHR-103')).toBe(true);
    });

    it('creates initial Confluence pages', () => {
      expect(state.confluence.pages.size).toBe(2);
      expect(state.confluence.pages.has('P-500')).toBe(true);
      expect(state.confluence.pages.has('P-501')).toBe(true);
    });

    it('has the critical inline comment on P-501', () => {
      const page = state.confluence.pages.get('P-501');
      expect(page?.inlineComments).toHaveLength(1);
      expect(page?.inlineComments[0].author).toBe('Irene (Legal)');
      expect(page?.inlineComments[0].body).toContain('NOT');
      expect(page?.inlineComments[0].body).toContain('LHR-103');
    });

    it('starts with empty action log', () => {
      expect(state.actionLog).toHaveLength(0);
    });
  });

  describe('Jira Mutations', () => {
    describe('editJiraIssue', () => {
      it('updates issue summary', () => {
        const result = editJiraIssue(state, 'LHR-100', { summary: 'New Summary' });
        expect(result.success).toBe(true);
        expect(state.jira.issues.get('LHR-100')?.summary).toBe('New Summary');
      });

      it('updates issue description', () => {
        const result = editJiraIssue(state, 'LHR-100', { description: 'New Description' });
        expect(result.success).toBe(true);
        expect(state.jira.issues.get('LHR-100')?.description).toBe('New Description');
      });

      it('updates custom fields', () => {
        const result = editJiraIssue(state, 'LHR-100', {
          customfield_10001: '18 months'
        });
        expect(result.success).toBe(true);
        expect(state.jira.issues.get('LHR-100')?.customFields?.customfield_10001).toBe('18 months');
      });

      it('logs the action', () => {
        editJiraIssue(state, 'LHR-100', { summary: 'Test' });
        expect(hasAction(state, 'editJiraIssue', 'LHR-100')).toBe(true);
      });

      it('fails for non-existent issue', () => {
        const result = editJiraIssue(state, 'FAKE-999', { summary: 'Test' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
      });

      it('updates the updated timestamp', () => {
        const before = state.jira.issues.get('LHR-100')?.updated;
        editJiraIssue(state, 'LHR-100', { summary: 'Test' });
        const after = state.jira.issues.get('LHR-100')?.updated;
        expect(after).not.toBe(before);
      });
    });

    describe('transitionJiraIssue', () => {
      it('changes issue status', () => {
        const result = transitionJiraIssue(state, 'LHR-100', 'T-1');
        expect(result.success).toBe(true);
        expect(result.newStatus).toBe('In Progress');
        expect(state.jira.issues.get('LHR-100')?.status).toBe('In Progress');
      });

      it('logs the transition with details', () => {
        transitionJiraIssue(state, 'LHR-100', 'T-1');
        const logs = getActionLog(state);
        expect(logs).toHaveLength(1);
        expect(logs[0].action).toBe('transitionJiraIssue');
        expect(logs[0].details.fromStatus).toBe('To Do');
        expect(logs[0].details.toStatus).toBe('In Progress');
      });

      it('fails for invalid transition', () => {
        const result = transitionJiraIssue(state, 'LHR-100', 'T-999');
        expect(result.success).toBe(false);
        expect(result.error).toContain('not available');
      });

      it('fails for non-existent issue', () => {
        const result = transitionJiraIssue(state, 'FAKE-999', 'T-1');
        expect(result.success).toBe(false);
      });
    });

    describe('addCommentToJiraIssue', () => {
      it('adds a comment to the issue', () => {
        const result = addCommentToJiraIssue(state, 'LHR-100', 'This is a test comment');
        expect(result.success).toBe(true);
        expect(result.commentId).toBeDefined();

        const comments = state.jira.issues.get('LHR-100')?.comments;
        expect(comments).toHaveLength(1);
        expect(comments?.[0].body).toBe('This is a test comment');
        expect(comments?.[0].author).toBe('Agent User');
      });

      it('logs the action', () => {
        addCommentToJiraIssue(state, 'LHR-100', 'Test');
        expect(wasCommentAdded(state, 'LHR-100')).toBe(true);
      });

      it('fails for non-existent issue', () => {
        const result = addCommentToJiraIssue(state, 'FAKE-999', 'Test');
        expect(result.success).toBe(false);
      });
    });

    describe('addWorklogToJiraIssue', () => {
      it('adds worklog with parsed time', () => {
        const result = addWorklogToJiraIssue(state, 'LHR-100', '2h 30m');
        expect(result.success).toBe(true);

        const worklogs = state.jira.issues.get('LHR-100')?.worklogs;
        expect(worklogs).toHaveLength(1);
        expect(worklogs?.[0].timeSpent).toBe('2h 30m');
        expect(worklogs?.[0].timeSpentSeconds).toBe(2.5 * 3600);
      });

      it('parses days correctly', () => {
        addWorklogToJiraIssue(state, 'LHR-100', '1d 4h');
        const worklogs = state.jira.issues.get('LHR-100')?.worklogs;
        expect(worklogs?.[0].timeSpentSeconds).toBe(12 * 3600); // 8h + 4h
      });
    });

    describe('createJiraIssue', () => {
      it('creates a new issue', () => {
        const result = createJiraIssue(state, 'LHR', 'New Issue', 'Task', 'Description');
        expect(result.success).toBe(true);
        expect(result.issueKey).toBe('LHR-104'); // Next after LHR-103

        const issue = state.jira.issues.get('LHR-104');
        expect(issue?.summary).toBe('New Issue');
        expect(issue?.status).toBe('To Do');
      });

      it('fails for non-existent project', () => {
        const result = createJiraIssue(state, 'FAKE', 'Test', 'Task');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Project');
      });

      it('fails for non-existent issue type', () => {
        const result = createJiraIssue(state, 'LHR', 'Test', 'Bug');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Issue type');
      });
    });
  });

  describe('Confluence Mutations', () => {
    describe('createConfluencePage', () => {
      it('creates a new page', () => {
        const result = createConfluencePage(state, 'S-SEC', 'New Page', '# Content');
        expect(result.success).toBe(true);
        expect(result.pageId).toBeDefined();

        const page = state.confluence.pages.get(result.pageId!);
        expect(page?.title).toBe('New Page');
        expect(page?.body).toBe('# Content');
        expect(page?.version).toBe(1);
      });

      it('supports parent pages', () => {
        const result = createConfluencePage(state, 'S-SEC', 'Child Page', 'Content', 'P-501');
        expect(result.success).toBe(true);

        const page = state.confluence.pages.get(result.pageId!);
        expect(page?.parentId).toBe('P-501');
      });

      it('fails for non-existent space', () => {
        const result = createConfluencePage(state, 'FAKE', 'Test', 'Content');
        expect(result.success).toBe(false);
      });
    });

    describe('updateConfluencePage', () => {
      it('updates page content', () => {
        const result = updateConfluencePage(state, 'P-500', {
          title: 'Updated Title',
          body: '# Updated Content'
        });
        expect(result.success).toBe(true);

        const page = state.confluence.pages.get('P-500');
        expect(page?.title).toBe('Updated Title');
        expect(page?.version).toBe(2);
      });

      it('enforces optimistic locking', () => {
        const result = updateConfluencePage(state, 'P-501', {
          body: 'New content',
          version: 1 // Page is at version 3
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Version conflict');
      });

      it('fails for non-existent page', () => {
        const result = updateConfluencePage(state, 'P-999', { title: 'Test' });
        expect(result.success).toBe(false);
      });
    });

    describe('createConfluenceInlineComment', () => {
      it('adds an inline comment', () => {
        const result = createConfluenceInlineComment(state, 'P-501', 'New comment', 'row:LHR-100');
        expect(result.success).toBe(true);

        const page = state.confluence.pages.get('P-501');
        expect(page?.inlineComments).toHaveLength(2); // 1 existing + 1 new
        expect(page?.inlineComments[1].body).toBe('New comment');
        expect(page?.inlineComments[1].anchor).toBe('row:LHR-100');
      });
    });

    describe('createConfluenceFooterComment', () => {
      it('adds a footer comment', () => {
        const result = createConfluenceFooterComment(state, 'P-501', 'Footer comment');
        expect(result.success).toBe(true);

        const page = state.confluence.pages.get('P-501');
        expect(page?.footerComments).toHaveLength(2); // 1 existing + 1 new
      });
    });
  });

  describe('Compass Mutations', () => {
    describe('createCompassComponent', () => {
      it('creates a component', () => {
        const result = createCompassComponent(state, 'Auth Service', 'SERVICE', 'Handles authentication');
        expect(result.success).toBe(true);
        expect(result.componentId).toBeDefined();

        const component = state.compass.components.get(result.componentId!);
        expect(component?.name).toBe('Auth Service');
        expect(component?.type).toBe('SERVICE');
      });
    });

    describe('createCompassComponentRelationship', () => {
      it('creates a relationship between components', () => {
        const comp1 = createCompassComponent(state, 'Service A', 'SERVICE');
        const comp2 = createCompassComponent(state, 'Service B', 'SERVICE');

        const result = createCompassComponentRelationship(
          state,
          comp1.componentId!,
          comp2.componentId!,
          'DEPENDS_ON'
        );
        expect(result.success).toBe(true);

        const component = state.compass.components.get(comp1.componentId!);
        expect(component?.relationships).toHaveLength(1);
        expect(component?.relationships[0].targetId).toBe(comp2.componentId);
      });

      it('fails for non-existent source', () => {
        const comp = createCompassComponent(state, 'Service', 'SERVICE');
        const result = createCompassComponentRelationship(state, 'FAKE', comp.componentId!);
        expect(result.success).toBe(false);
      });
    });

    describe('createCompassCustomFieldDefinition', () => {
      it('creates a custom field definition', () => {
        const result = createCompassCustomFieldDefinition(state, 'Team', 'TEXT');
        expect(result.success).toBe(true);
        expect(state.compass.customFieldDefs).toHaveLength(1);
        expect(state.compass.customFieldDefs[0].name).toBe('Team');
      });
    });
  });

  describe('Validation Helpers', () => {
    describe('getIssueStatus', () => {
      it('returns current status', () => {
        expect(getIssueStatus(state, 'LHR-100')).toBe('To Do');
        expect(getIssueStatus(state, 'LHR-103')).toBe('Blocked - Legal');
      });

      it('returns undefined for non-existent issue', () => {
        expect(getIssueStatus(state, 'FAKE-999')).toBeUndefined();
      });
    });

    describe('wasIssueTransitioned', () => {
      it('returns false before transition', () => {
        expect(wasIssueTransitioned(state, 'LHR-100')).toBe(false);
      });

      it('returns true after transition', () => {
        transitionJiraIssue(state, 'LHR-100', 'T-1');
        expect(wasIssueTransitioned(state, 'LHR-100')).toBe(true);
      });

      it('can check for specific status', () => {
        transitionJiraIssue(state, 'LHR-100', 'T-1');
        expect(wasIssueTransitioned(state, 'LHR-100', 'In Progress')).toBe(true);
        expect(wasIssueTransitioned(state, 'LHR-100', 'Done')).toBe(false);
      });
    });

    describe('wasIssueEdited', () => {
      it('returns false before edit', () => {
        expect(wasIssueEdited(state, 'LHR-100')).toBe(false);
      });

      it('returns true after edit', () => {
        editJiraIssue(state, 'LHR-100', { summary: 'New' });
        expect(wasIssueEdited(state, 'LHR-100')).toBe(true);
      });
    });

    describe('getIssueComments', () => {
      it('returns empty array for issue with no comments', () => {
        expect(getIssueComments(state, 'LHR-100')).toHaveLength(0);
      });

      it('returns comments after adding', () => {
        addCommentToJiraIssue(state, 'LHR-100', 'Comment 1');
        addCommentToJiraIssue(state, 'LHR-100', 'Comment 2');
        const comments = getIssueComments(state, 'LHR-100');
        expect(comments).toHaveLength(2);
      });
    });
  });

  describe('Level 4 Win Condition Scenario', () => {
    it('can complete the level correctly', () => {
      // The correct way to complete level 4:
      // 1. Read the LIVE roadmap page (P-501)
      // 2. Read inline comments (find Legal block on LHR-103)
      // 3. Update LHR-100, LHR-101, LHR-102 (but NOT LHR-103)
      // 4. Transition them to In Progress
      // 5. Add comments with Confluence link

      // Edit issues with correct info from roadmap
      editJiraIssue(state, 'LHR-100', { customfield_10001: '18 months' });
      editJiraIssue(state, 'LHR-101', { summary: 'Implement auto-delete' });
      editJiraIssue(state, 'LHR-102', { summary: 'Role-based access' });

      // Transition to In Progress (except LHR-103!)
      transitionJiraIssue(state, 'LHR-100', 'T-1');
      transitionJiraIssue(state, 'LHR-101', 'T-1');
      transitionJiraIssue(state, 'LHR-102', 'T-1');
      // LHR-103 is intentionally NOT transitioned

      // Add comments
      addCommentToJiraIssue(state, 'LHR-100', 'Updated per Confluence: https://acme.atlassian.net/wiki/spaces/SEC/pages/P-501');
      addCommentToJiraIssue(state, 'LHR-101', 'Updated per Confluence: https://acme.atlassian.net/wiki/spaces/SEC/pages/P-501');
      addCommentToJiraIssue(state, 'LHR-102', 'Updated per Confluence: https://acme.atlassian.net/wiki/spaces/SEC/pages/P-501');

      // Validate the winning state
      expect(getIssueStatus(state, 'LHR-100')).toBe('In Progress');
      expect(getIssueStatus(state, 'LHR-101')).toBe('In Progress');
      expect(getIssueStatus(state, 'LHR-102')).toBe('In Progress');
      expect(getIssueStatus(state, 'LHR-103')).toBe('Blocked - Legal'); // UNCHANGED!

      expect(wasIssueTransitioned(state, 'LHR-100', 'In Progress')).toBe(true);
      expect(wasIssueTransitioned(state, 'LHR-103')).toBe(false);

      expect(wasCommentAdded(state, 'LHR-100')).toBe(true);
      expect(wasCommentAdded(state, 'LHR-103')).toBe(false);
    });

    it('detects the failure case (transitioning LHR-103)', () => {
      // Agent ignores inline comment and transitions everything
      transitionJiraIssue(state, 'LHR-100', 'T-1');
      transitionJiraIssue(state, 'LHR-101', 'T-1');
      transitionJiraIssue(state, 'LHR-102', 'T-1');
      transitionJiraIssue(state, 'LHR-103', 'T-1'); // BAD!

      expect(getIssueStatus(state, 'LHR-103')).toBe('In Progress');
      expect(wasIssueTransitioned(state, 'LHR-103', 'In Progress')).toBe(true);
      // This should be detected as a failure!
    });
  });
});
