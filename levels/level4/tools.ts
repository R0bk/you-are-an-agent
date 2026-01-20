/**
 * Atlassian MCP Tool Executor
 *
 * Implements all 34 Atlassian tools with deterministic behavior.
 * Each tool operates on the mutable state and returns JSON results.
 */

import { ParsedToolCall } from './parser';
import {
  AtlassianState,
  JiraIssue,
  ConfluencePage,
  // Mutations
  editJiraIssue,
  transitionJiraIssue,
  addCommentToJiraIssue,
  addWorklogToJiraIssue,
  createJiraIssue,
  createConfluencePage,
  updateConfluencePage,
  createConfluenceInlineComment,
  createConfluenceFooterComment,
  createCompassComponent,
  createCompassComponentRelationship,
  createCompassCustomFieldDefinition,
  // Read tracking
  logRead,
} from './state';

export interface ToolResult {
  success: boolean;
  output: string; // JSON stringified result
  error?: string;
}

// All available tool names for discovery
export const ALL_TOOL_NAMES = [
  // Rovo / Shared
  'atlassianUserInfo',
  'getAccessibleAtlassianResources',
  'search',
  'fetch',
  // Confluence
  'createConfluenceFooterComment',
  'createConfluenceInlineComment',
  'createConfluencePage',
  'getConfluencePage',
  'getConfluencePageDescendants',
  'getConfluencePageFooterComments',
  'getConfluencePageInlineComments',
  'getConfluenceSpaces',
  'getPagesInConfluenceSpace',
  'searchConfluenceUsingCql',
  'updateConfluencePage',
  // Jira
  'addCommentToJiraIssue',
  'addWorklogToJiraIssue',
  'createJiraIssue',
  'editJiraIssue',
  'getJiraIssue',
  'getJiraIssueRemoteIssueLinks',
  'getJiraIssueTypeMetaWithFields',
  'getJiraProjectIssueTypesMetadata',
  'getTransitionsForJiraIssue',
  'getVisibleJiraProjects',
  'lookupJiraAccountId',
  'searchJiraIssuesUsingJql',
  'transitionJiraIssue',
  // Compass
  'createCompassComponent',
  'createCompassComponentRelationship',
  'createCompassCustomFieldDefinition',
  'getCompassComponent',
  'getCompassComponents',
  'getCompassCustomFieldDefinitions',
];

/**
 * Maps positional arguments (arg0, arg1, etc.) to named parameters for each tool.
 * This allows users to call tools like: toolName("value1", "value2")
 * instead of requiring: toolName({ param1: "value1", param2: "value2" })
 */
const POSITIONAL_ARG_MAPS: Record<string, string[]> = {
  // Confluence tools
  getConfluencePage: ['pageId'],
  getConfluencePageInlineComments: ['pageId'],
  getConfluencePageFooterComments: ['pageId'],
  getConfluencePageDescendants: ['pageId'],
  getPagesInConfluenceSpace: ['spaceId'],
  createConfluencePage: ['spaceId', 'title', 'body'],
  updateConfluencePage: ['pageId', 'title', 'body', 'version'],
  createConfluenceInlineComment: ['pageId', 'body', 'anchor'],
  createConfluenceFooterComment: ['pageId', 'body'],
  searchConfluenceUsingCql: ['cql'],
  // Jira tools
  getJiraIssue: ['issueIdOrKey'],
  getTransitionsForJiraIssue: ['issueIdOrKey'],
  editJiraIssue: ['issueIdOrKey', 'fields'],
  transitionJiraIssue: ['issueIdOrKey', 'transitionId'],
  addCommentToJiraIssue: ['issueIdOrKey', 'body'],
  addWorklogToJiraIssue: ['issueIdOrKey', 'timeSpent'],
  createJiraIssue: ['projectKey', 'summary', 'issuetype'],
  getJiraIssueRemoteIssueLinks: ['issueIdOrKey'],
  getJiraProjectIssueTypesMetadata: ['projectKey'],
  getJiraIssueTypeMetaWithFields: ['projectKey', 'issueType'],
  searchJiraIssuesUsingJql: ['jql'],
  lookupJiraAccountId: ['query'],
  // Rovo/Shared tools
  search: ['query', 'cloudId', 'limit'],
  fetch: ['ari'],
  // Compass tools
  getCompassComponent: ['componentId'],
  createCompassComponent: ['name', 'type'],
  createCompassComponentRelationship: ['sourceId', 'targetId'],
  createCompassCustomFieldDefinition: ['name', 'type'],
};

/**
 * Convert positional arguments (arg0, arg1, ...) to named arguments
 */
function mapPositionalArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  const argMap = POSITIONAL_ARG_MAPS[toolName];
  if (!argMap) return args;

  const result = { ...args };

  // Map arg0, arg1, etc. to named params
  for (let i = 0; i < argMap.length; i++) {
    const positionalKey = `arg${i}`;
    const namedKey = argMap[i];

    if (positionalKey in args && !(namedKey in args)) {
      result[namedKey] = args[positionalKey];
      delete result[positionalKey];
    }
  }

  return result;
}

/**
 * Execute a tool call against the state
 */
export function executeTool(
  call: ParsedToolCall,
  state: AtlassianState
): ToolResult {
  const toolName = call.toolName;
  const rawArgs = call.arguments || {};

  if (!toolName) {
    return { success: false, output: '', error: 'No tool name specified' };
  }

  // Get the executor function
  const executor = TOOL_EXECUTORS[toolName];
  if (!executor) {
    return {
      success: false,
      output: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
      error: `Unknown tool: ${toolName}`
    };
  }

  // Map positional args to named args
  const args = mapPositionalArgs(toolName, rawArgs);

  try {
    const result = executor(args, state);
    return { success: true, output: JSON.stringify(result, null, 2) };
  } catch (e) {
    const error = (e as Error).message;
    return {
      success: false,
      output: JSON.stringify({ error }),
      error
    };
  }
}

// Type for tool executor functions
type ToolExecutor = (args: Record<string, unknown>, state: AtlassianState) => unknown;

// ============ TOOL IMPLEMENTATIONS ============

const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  // ============ ROVO / SHARED ============

  atlassianUserInfo: (args, state) => {
    return {
      accountId: state.user.accountId,
      displayName: state.user.displayName,
      email: state.user.email,
      active: true
    };
  },

  getAccessibleAtlassianResources: (args, state) => {
    return {
      resources: state.resources.map(r => ({
        id: r.cloudId,
        url: r.site,
        name: r.site.replace('https://', '').replace('.atlassian.net', ''),
        scopes: ['read:jira-work', 'write:jira-work', 'read:confluence-content.all', 'write:confluence-content']
      }))
    };
  },

  search: (args, state) => {
    const query = String(args.query || '').toLowerCase();
    const limit = Math.min(Number(args.limit) || 5, 10);

    const results: Array<{
      type: string;
      id: string;
      title: string;
      url: string;
      excerpt?: string;
    }> = [];

    // Search Confluence pages
    for (const page of state.confluence.pages.values()) {
      if (page.title.toLowerCase().includes(query) || page.body.toLowerCase().includes(query)) {
        const space = state.confluence.spaces.find(s => s.id === page.spaceId);
        results.push({
          type: 'confluence:page',
          id: page.id,
          title: page.title,
          url: `https://acme.atlassian.net/wiki/spaces/${space?.key}/pages/${page.id}`,
          excerpt: page.body.substring(0, 200) + '...'
        });
      }
    }

    // Search Jira issues
    for (const issue of state.jira.issues.values()) {
      if (issue.key.toLowerCase().includes(query) ||
          issue.summary.toLowerCase().includes(query) ||
          (issue.description?.toLowerCase().includes(query))) {
        results.push({
          type: 'jira:issue',
          id: issue.id,
          title: `${issue.key}: ${issue.summary}`,
          url: `https://acme.atlassian.net/browse/${issue.key}`
        });
      }
    }

    return { results: results.slice(0, limit), total: results.length };
  },

  fetch: (args, state) => {
    const ari = String(args.ari || '');

    // Parse ARI: ari:cloud:confluence:cloudId:page/pageId
    // or ari:cloud:jira:cloudId:issue/issueId
    const ariMatch = ari.match(/ari:cloud:(\w+):[^:]+:(\w+)\/(.+)/);
    if (!ariMatch) {
      throw new Error(`Invalid ARI format: ${ari}`);
    }

    const [, product, type, id] = ariMatch;

    if (product === 'confluence' && type === 'page') {
      const page = state.confluence.pages.get(id);
      if (!page) throw new Error(`Page ${id} not found`);
      return formatConfluencePageResponse(page, state);
    }

    if (product === 'jira' && type === 'issue') {
      const issue = state.jira.issues.get(id) ||
        Array.from(state.jira.issues.values()).find(i => i.id === id);
      if (!issue) throw new Error(`Issue ${id} not found`);
      return formatJiraIssueResponse(issue);
    }

    throw new Error(`Unsupported ARI type: ${product}:${type}`);
  },

  // ============ CONFLUENCE ============

  getConfluenceSpaces: (args, state) => {
    const limit = Number(args.limit) || 25;
    return {
      results: state.confluence.spaces.slice(0, limit).map(s => ({
        id: s.id,
        key: s.key,
        name: s.name,
        type: s.type,
        _links: {
          webui: `https://acme.atlassian.net/wiki/spaces/${s.key}`
        }
      })),
      size: state.confluence.spaces.length
    };
  },

  getPagesInConfluenceSpace: (args, state) => {
    const spaceId = String(args.spaceId || '');
    const limit = Number(args.limit) || 25;

    const space = state.confluence.spaces.find(s => s.id === spaceId || s.key === spaceId);
    if (!space) {
      throw new Error(`Space ${spaceId} not found`);
    }

    const pages = Array.from(state.confluence.pages.values())
      .filter(p => p.spaceId === space.id);

    return {
      results: pages.slice(0, limit).map(p => ({
        id: p.id,
        title: p.title,
        version: { number: p.version },
        _links: {
          webui: `https://acme.atlassian.net/wiki/spaces/${space.key}/pages/${p.id}`
        }
      })),
      size: pages.length
    };
  },

  getConfluencePage: (args, state) => {
    const pageId = String(args.pageId || '');
    const page = state.confluence.pages.get(pageId);
    if (!page) {
      throw new Error(`Page ${pageId} not found`);
    }
    // Log that this page was read
    logRead(state, `confluence:page:${pageId}`, { title: page.title });
    return formatConfluencePageResponse(page, state);
  },

  getConfluencePageInlineComments: (args, state) => {
    const pageId = String(args.pageId || '');
    const page = state.confluence.pages.get(pageId);
    if (!page) {
      throw new Error(`Page ${pageId} not found`);
    }

    // Log that inline comments were read (critical for validation!)
    logRead(state, `confluence:inlineComments:${pageId}`, {
      commentCount: page.inlineComments.length,
      hasLegalComment: page.inlineComments.some(c => c.author.includes('Legal'))
    });

    return {
      results: page.inlineComments.map(c => ({
        id: c.id,
        anchor: c.anchor,
        body: { storage: { value: c.body } },
        author: { displayName: c.author },
        created: c.created
      })),
      size: page.inlineComments.length
    };
  },

  getConfluencePageFooterComments: (args, state) => {
    const pageId = String(args.pageId || '');
    const page = state.confluence.pages.get(pageId);
    if (!page) {
      throw new Error(`Page ${pageId} not found`);
    }

    return {
      results: page.footerComments.map(c => ({
        id: c.id,
        body: { storage: { value: c.body } },
        author: { displayName: c.author },
        created: c.created
      })),
      size: page.footerComments.length
    };
  },

  getConfluencePageDescendants: (args, state) => {
    const pageId = String(args.pageId || '');
    const limit = Number(args.limit) || 25;

    const descendants = Array.from(state.confluence.pages.values())
      .filter(p => p.parentId === pageId);

    return {
      results: descendants.slice(0, limit).map(p => ({
        id: p.id,
        title: p.title
      })),
      size: descendants.length
    };
  },

  createConfluencePage: (args, state) => {
    const spaceId = String(args.spaceId || '');
    const title = String(args.title || '');
    const body = String(args.body || '');
    const parentId = args.parentId ? String(args.parentId) : undefined;

    const result = createConfluencePage(state, spaceId, title, body, parentId);
    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      id: result.pageId,
      title,
      version: { number: 1 },
      _links: {
        webui: `https://acme.atlassian.net/wiki/pages/${result.pageId}`
      }
    };
  },

  updateConfluencePage: (args, state) => {
    const pageId = String(args.pageId || '');
    const title = args.title ? String(args.title) : undefined;
    const body = args.body ? String(args.body) : undefined;
    const version = args.version ? Number(args.version) : undefined;

    const result = updateConfluencePage(state, pageId, { title, body, version });
    if (!result.success) {
      throw new Error(result.error);
    }

    const page = state.confluence.pages.get(pageId)!;
    return formatConfluencePageResponse(page, state);
  },

  createConfluenceInlineComment: (args, state) => {
    const pageId = String(args.pageId || '');
    const body = String(args.body || '');
    const anchor = String(args.anchor || '');

    const result = createConfluenceInlineComment(state, pageId, body, anchor);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.commentId, created: true };
  },

  createConfluenceFooterComment: (args, state) => {
    const pageId = String(args.pageId || '');
    const body = String(args.body || '');

    const result = createConfluenceFooterComment(state, pageId, body);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.commentId, created: true };
  },

  searchConfluenceUsingCql: (args, state) => {
    const cql = String(args.cql || '').toLowerCase();
    const limit = Number(args.limit) || 25;

    // Very basic CQL parsing
    const results: ConfluencePage[] = [];

    // Parse "title ~ 'something'" or "text ~ 'something'"
    const titleMatch = cql.match(/title\s*~\s*["']([^"']+)["']/);
    const textMatch = cql.match(/text\s*~\s*["']([^"']+)["']/);
    const spaceMatch = cql.match(/space\s*=\s*["']([^"']+)["']/);

    for (const page of state.confluence.pages.values()) {
      let matches = true;

      if (titleMatch && !page.title.toLowerCase().includes(titleMatch[1].toLowerCase())) {
        matches = false;
      }
      if (textMatch && !page.body.toLowerCase().includes(textMatch[1].toLowerCase())) {
        matches = false;
      }
      if (spaceMatch) {
        const space = state.confluence.spaces.find(s => s.id === page.spaceId);
        if (space?.key.toLowerCase() !== spaceMatch[1].toLowerCase()) {
          matches = false;
        }
      }

      if (matches) {
        results.push(page);
      }
    }

    // Return in same format as global search for consistent display
    return {
      results: results.slice(0, limit).map(p => {
        const space = state.confluence.spaces.find(s => s.id === p.spaceId);
        return {
          type: 'confluence:page',
          id: p.id,
          title: p.title,
          url: `https://acme.atlassian.net/wiki/spaces/${space?.key}/pages/${p.id}`,
          excerpt: p.body.substring(0, 200) + '...'
        };
      }),
      total: results.length
    };
  },

  // ============ JIRA ============

  getVisibleJiraProjects: (args, state) => {
    return {
      values: state.jira.projects.map(p => ({
        id: p.id,
        key: p.key,
        name: p.name,
        projectTypeKey: 'software'
      }))
    };
  },

  getJiraProjectIssueTypesMetadata: (args, state) => {
    const projectKey = String(args.projectKey || '');
    if (!projectKey) {
      const availableProjects = state.jira.projects.map(p => p.key).join(', ');
      throw new Error(`Missing projectKey parameter. Available projects: ${availableProjects}. Usage: getJiraProjectIssueTypesMetadata("LHR")`);
    }
    const project = state.jira.projects.find(p => p.key === projectKey);
    if (!project) {
      const availableProjects = state.jira.projects.map(p => p.key).join(', ');
      throw new Error(`Project "${projectKey}" not found. Available projects: ${availableProjects}`);
    }

    return {
      issueTypes: project.issueTypes.map(t => ({
        id: t.id,
        name: t.name,
        subtask: false
      }))
    };
  },

  getJiraIssueTypeMetaWithFields: (args, state) => {
    const projectKey = String(args.projectKey || '');
    const issueTypeName = String(args.issueType || '');

    if (!projectKey) {
      const availableProjects = state.jira.projects.map(p => p.key).join(', ');
      throw new Error(`Missing projectKey parameter. Available projects: ${availableProjects}`);
    }
    const project = state.jira.projects.find(p => p.key === projectKey);
    if (!project) {
      const availableProjects = state.jira.projects.map(p => p.key).join(', ');
      throw new Error(`Project "${projectKey}" not found. Available projects: ${availableProjects}`);
    }

    const issueType = project.issueTypes.find(t => t.name === issueTypeName);
    if (!issueType) {
      throw new Error(`Issue type ${issueTypeName} not found in project ${projectKey}`);
    }

    return {
      issueType: {
        id: issueType.id,
        name: issueType.name
      },
      fields: issueType.fields.reduce((acc, f) => {
        acc[f.key] = {
          name: f.name,
          required: f.required,
          schema: f.schema
        };
        return acc;
      }, {} as Record<string, unknown>)
    };
  },

  searchJiraIssuesUsingJql: (args, state) => {
    const jql = String(args.jql || '').toLowerCase();
    const limit = Number(args.limit) || 10;
    const startAt = Number(args.startAt) || 0;

    const results: JiraIssue[] = [];

    // Basic JQL parsing
    const projectMatch = jql.match(/project\s*=\s*["']?(\w+)["']?/);
    const statusMatch = jql.match(/status\s*=\s*["']([^"']+)["']/);
    const keyMatch = jql.match(/key\s*=\s*["']?([A-Z]+-\d+)["']?/);

    for (const issue of state.jira.issues.values()) {
      let matches = true;

      if (projectMatch && issue.projectKey.toLowerCase() !== projectMatch[1].toLowerCase()) {
        matches = false;
      }
      if (statusMatch && issue.status.toLowerCase() !== statusMatch[1].toLowerCase()) {
        matches = false;
      }
      if (keyMatch && issue.key !== keyMatch[1]) {
        matches = false;
      }

      // Fallback: if no specific filters, search in summary
      if (!projectMatch && !statusMatch && !keyMatch) {
        if (!issue.summary.toLowerCase().includes(jql) &&
            !issue.key.toLowerCase().includes(jql)) {
          matches = false;
        }
      }

      if (matches) {
        results.push(issue);
      }
    }

    return {
      startAt,
      maxResults: limit,
      total: results.length,
      issues: results.slice(startAt, startAt + limit).map(i => formatJiraIssueResponse(i))
    };
  },

  getJiraIssue: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    if (!issueIdOrKey) {
      const availableIssues = Array.from(state.jira.issues.keys()).join(', ');
      throw new Error(`Missing issueIdOrKey parameter. Available issues: ${availableIssues}. Usage: getJiraIssue("LHR-100")`);
    }
    const issue = state.jira.issues.get(issueIdOrKey) ||
      Array.from(state.jira.issues.values()).find(i => i.id === issueIdOrKey);

    if (!issue) {
      const availableIssues = Array.from(state.jira.issues.keys()).join(', ');
      throw new Error(`Issue "${issueIdOrKey}" not found. Available issues: ${availableIssues}`);
    }

    return formatJiraIssueResponse(issue);
  },

  getTransitionsForJiraIssue: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    if (!issueIdOrKey) {
      const availableIssues = Array.from(state.jira.issues.keys()).join(', ');
      throw new Error(`Missing issueIdOrKey parameter. Available issues: ${availableIssues}`);
    }
    const issue = state.jira.issues.get(issueIdOrKey);
    if (!issue) {
      const availableIssues = Array.from(state.jira.issues.keys()).join(', ');
      throw new Error(`Issue "${issueIdOrKey}" not found. Available issues: ${availableIssues}`);
    }

    const transitions = state.jira.transitions.get(issue.key) || [];
    return {
      transitions: transitions.map(t => ({
        id: t.id,
        name: t.name,
        to: {
          name: t.toStatus
        }
      }))
    };
  },

  editJiraIssue: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    const fields = (args.fields || {}) as Record<string, unknown>;

    const result = editJiraIssue(state, issueIdOrKey, fields);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { ok: true, message: `Issue ${issueIdOrKey} updated` };
  },

  transitionJiraIssue: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    const transitionId = String(args.transitionId || '');

    const result = transitionJiraIssue(state, issueIdOrKey, transitionId);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { ok: true, newStatus: result.newStatus };
  },

  addCommentToJiraIssue: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    const body = String(args.body || '');

    const result = addCommentToJiraIssue(state, issueIdOrKey, body);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.commentId, created: true };
  },

  addWorklogToJiraIssue: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    const timeSpent = String(args.timeSpent || '');

    const result = addWorklogToJiraIssue(state, issueIdOrKey, timeSpent);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.worklogId, created: true };
  },

  createJiraIssue: (args, state) => {
    const projectKey = String(args.projectKey || '');
    const summary = String(args.summary || '');
    const issuetype = String(args.issuetype || 'Task');
    const description = args.description ? String(args.description) : undefined;

    const result = createJiraIssue(state, projectKey, summary, issuetype, description);
    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      id: result.issueKey?.replace(/[A-Z]+-/, 'J-'),
      key: result.issueKey,
      self: `https://acme.atlassian.net/rest/api/3/issue/${result.issueKey}`
    };
  },

  getJiraIssueRemoteIssueLinks: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    const issue = state.jira.issues.get(issueIdOrKey);
    if (!issue) {
      throw new Error(`Issue ${issueIdOrKey} not found`);
    }

    return issue.remoteLinks.map(l => ({
      id: l.id,
      object: {
        url: l.url,
        title: l.title
      }
    }));
  },

  lookupJiraAccountId: (args, state) => {
    const query = String(args.query || '').toLowerCase();

    // Only return current user if query matches
    if (state.user.displayName.toLowerCase().includes(query) ||
        state.user.email.toLowerCase().includes(query)) {
      return [{
        accountId: state.user.accountId,
        displayName: state.user.displayName,
        emailAddress: state.user.email,
        active: true
      }];
    }

    return [];
  },

  // ============ COMPASS ============

  getCompassComponents: (args, state) => {
    const limit = Number(args.limit) || 25;
    const typeFilter = args.type ? String(args.type) : undefined;

    let components = Array.from(state.compass.components.values());

    if (typeFilter) {
      components = components.filter(c => c.type === typeFilter);
    }

    return {
      values: components.slice(0, limit).map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        description: c.description
      })),
      total: components.length
    };
  },

  getCompassComponent: (args, state) => {
    const componentId = String(args.componentId || '');
    const component = state.compass.components.get(componentId);
    if (!component) {
      throw new Error(`Component ${componentId} not found`);
    }

    return {
      id: component.id,
      name: component.name,
      type: component.type,
      description: component.description,
      relationships: component.relationships,
      customFields: component.customFields
    };
  },

  createCompassComponent: (args, state) => {
    const name = String(args.name || '');
    const type = String(args.type || 'SERVICE') as 'SERVICE' | 'LIBRARY' | 'APPLICATION' | 'OTHER';
    const description = args.description ? String(args.description) : undefined;

    const result = createCompassComponent(state, name, type, description);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.componentId, created: true };
  },

  createCompassComponentRelationship: (args, state) => {
    const sourceId = String(args.sourceId || '');
    const targetId = String(args.targetId || '');
    const type = args.type ? String(args.type) : 'DEPENDS_ON';

    const result = createCompassComponentRelationship(state, sourceId, targetId, type);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.relationshipId, created: true };
  },

  getCompassCustomFieldDefinitions: (args, state) => {
    const limit = Number(args.limit) || 25;

    return {
      values: state.compass.customFieldDefs.slice(0, limit).map(f => ({
        id: f.id,
        name: f.name,
        type: f.type
      })),
      total: state.compass.customFieldDefs.length
    };
  },

  createCompassCustomFieldDefinition: (args, state) => {
    const name = String(args.name || '');
    const type = String(args.type || 'TEXT') as 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'USER';

    const result = createCompassCustomFieldDefinition(state, name, type);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.fieldId, created: true };
  },
};

// ============ HELPER FUNCTIONS ============

function formatConfluencePageResponse(page: ConfluencePage, state: AtlassianState) {
  const space = state.confluence.spaces.find(s => s.id === page.spaceId);
  return {
    id: page.id,
    title: page.title,
    space: {
      id: space?.id,
      key: space?.key,
      name: space?.name
    },
    version: {
      number: page.version,
      when: page.updated
    },
    body: {
      storage: {
        value: page.body,
        representation: 'storage'
      }
    },
    _links: {
      webui: `https://acme.atlassian.net/wiki/spaces/${space?.key}/pages/${page.id}`,
      self: `https://acme.atlassian.net/wiki/rest/api/content/${page.id}`
    }
  };
}

function formatJiraIssueResponse(issue: JiraIssue) {
  return {
    id: issue.id,
    key: issue.key,
    self: `https://acme.atlassian.net/rest/api/3/issue/${issue.key}`,
    fields: {
      summary: issue.summary,
      description: issue.description,
      status: {
        name: issue.status
      },
      issuetype: {
        name: issue.issueType
      },
      priority: issue.priority ? { name: issue.priority } : undefined,
      labels: issue.labels || [],
      created: issue.created,
      updated: issue.updated,
      ...issue.customFields
    }
  };
}
