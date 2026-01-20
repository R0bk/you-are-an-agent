/**
 * Nexus MCP Tool Executor
 *
 * Implements all 34 Nexus tools with deterministic behavior.
 * Each tool operates on the mutable state and returns JSON results.
 */

import { ParsedToolCall } from './parser';
import {
  NexusState,
  TrackerIssue,
  PagesDoc,
  // Mutations
  editTrackerIssue,
  transitionTrackerIssue,
  addCommentToTrackerIssue,
  addWorklogToTrackerIssue,
  createTrackerIssue,
  createPagesDoc,
  updatePagesDoc,
  createPagesInlineComment,
  createPagesFooterComment,
  createCatalogComponent,
  createCatalogComponentRelationship,
  createCatalogCustomFieldDefinition,
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
  // Core / Shared
  'nexusUserInfo',
  'getAccessibleNexusResources',
  'search',
  'fetch',
  // Pages
  'createPagesFooterComment',
  'createPagesInlineComment',
  'createPagesDoc',
  'getPagesDoc',
  'getPagesDocDescendants',
  'getPagesDocFooterComments',
  'getPagesDocInlineComments',
  'getPagesSpaces',
  'getDocsInPagesSpace',
  'searchPagesUsingNql',
  'updatePagesDoc',
  // Tracker
  'addCommentToTrackerIssue',
  'addWorklogToTrackerIssue',
  'createTrackerIssue',
  'editTrackerIssue',
  'getTrackerIssue',
  'getTrackerIssueRemoteLinks',
  'getTrackerIssueTypeMetaWithFields',
  'getTrackerProjectIssueTypesMetadata',
  'getTransitionsForTrackerIssue',
  'getVisibleTrackerProjects',
  'lookupTrackerAccountId',
  'searchTrackerIssuesUsingTql',
  'transitionTrackerIssue',
  // Catalog
  'createCatalogComponent',
  'createCatalogComponentRelationship',
  'createCatalogCustomFieldDefinition',
  'getCatalogComponent',
  'getCatalogComponents',
  'getCatalogCustomFieldDefinitions',
];

/**
 * Maps positional arguments (arg0, arg1, etc.) to named parameters for each tool.
 * This allows users to call tools like: toolName("value1", "value2")
 * instead of requiring: toolName({ param1: "value1", param2: "value2" })
 */
const POSITIONAL_ARG_MAPS: Record<string, string[]> = {
  // Pages tools
  getPagesDoc: ['docId'],
  getPagesDocInlineComments: ['docId'],
  getPagesDocFooterComments: ['docId'],
  getPagesDocDescendants: ['docId'],
  getDocsInPagesSpace: ['spaceId'],
  createPagesDoc: ['spaceId', 'title', 'body'],
  updatePagesDoc: ['docId', 'title', 'body', 'version'],
  createPagesInlineComment: ['docId', 'body', 'anchor'],
  createPagesFooterComment: ['docId', 'body'],
  searchPagesUsingNql: ['nql'],
  // Tracker tools
  getTrackerIssue: ['issueIdOrKey'],
  getTransitionsForTrackerIssue: ['issueIdOrKey'],
  editTrackerIssue: ['issueIdOrKey', 'fields'],
  transitionTrackerIssue: ['issueIdOrKey', 'transitionId'],
  addCommentToTrackerIssue: ['issueIdOrKey', 'body'],
  addWorklogToTrackerIssue: ['issueIdOrKey', 'timeSpent'],
  createTrackerIssue: ['projectKey', 'summary', 'issuetype'],
  getTrackerIssueRemoteLinks: ['issueIdOrKey'],
  getTrackerProjectIssueTypesMetadata: ['projectKey'],
  getTrackerIssueTypeMetaWithFields: ['projectKey', 'issueType'],
  searchTrackerIssuesUsingTql: ['tql'],
  lookupTrackerAccountId: ['query'],
  // Core/Shared tools
  search: ['query', 'cloudId', 'limit'],
  fetch: ['ari'],
  // Catalog tools
  getCatalogComponent: ['componentId'],
  createCatalogComponent: ['name', 'type'],
  createCatalogComponentRelationship: ['sourceId', 'targetId'],
  createCatalogCustomFieldDefinition: ['name', 'type'],
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
  state: NexusState
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
type ToolExecutor = (args: Record<string, unknown>, state: NexusState) => unknown;

// ============ TOOL IMPLEMENTATIONS ============

const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  // ============ CORE / SHARED ============

  nexusUserInfo: (args, state) => {
    return {
      accountId: state.user.accountId,
      displayName: state.user.displayName,
      email: state.user.email,
      active: true
    };
  },

  getAccessibleNexusResources: (args, state) => {
    return {
      resources: state.resources.map(r => ({
        id: r.cloudId,
        url: r.site,
        name: r.site.replace('https://', '').replace('.nexus.io', ''),
        scopes: ['read:tracker-work', 'write:tracker-work', 'read:pages-content.all', 'write:pages-content']
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

    // Search Pages docs
    for (const doc of state.pages.docs.values()) {
      if (doc.title.toLowerCase().includes(query) || doc.body.toLowerCase().includes(query)) {
        const space = state.pages.spaces.find(s => s.id === doc.spaceId);
        results.push({
          type: 'pages:doc',
          id: doc.id,
          title: doc.title,
          url: `https://acme.nexus.io/wiki/spaces/${space?.key}/docs/${doc.id}`,
          excerpt: doc.body.substring(0, 200) + '...'
        });
      }
    }

    // Search Tracker issues
    for (const issue of state.tracker.issues.values()) {
      if (issue.key.toLowerCase().includes(query) ||
          issue.summary.toLowerCase().includes(query) ||
          (issue.description?.toLowerCase().includes(query))) {
        results.push({
          type: 'tracker:issue',
          id: issue.id,
          title: `${issue.key}: ${issue.summary}`,
          url: `https://acme.nexus.io/browse/${issue.key}`
        });
      }
    }

    return { results: results.slice(0, limit), total: results.length };
  },

  fetch: (args, state) => {
    const ari = String(args.ari || '');

    // Parse ARI: ari:cloud:pages:cloudId:doc/docId
    // or ari:cloud:tracker:cloudId:issue/issueId
    const ariMatch = ari.match(/ari:cloud:(\w+):[^:]+:(\w+)\/(.+)/);
    if (!ariMatch) {
      throw new Error(`Invalid ARI format: ${ari}`);
    }

    const [, product, type, id] = ariMatch;

    if (product === 'pages' && type === 'doc') {
      const doc = state.pages.docs.get(id);
      if (!doc) throw new Error(`Doc ${id} not found`);
      return formatPagesDocResponse(doc, state);
    }

    if (product === 'tracker' && type === 'issue') {
      const issue = state.tracker.issues.get(id) ||
        Array.from(state.tracker.issues.values()).find(i => i.id === id);
      if (!issue) throw new Error(`Issue ${id} not found`);
      return formatTrackerIssueResponse(issue);
    }

    throw new Error(`Unsupported ARI type: ${product}:${type}`);
  },

  // ============ PAGES ============

  getPagesSpaces: (args, state) => {
    const limit = Number(args.limit) || 25;
    return {
      results: state.pages.spaces.slice(0, limit).map(s => ({
        id: s.id,
        key: s.key,
        name: s.name,
        type: s.type,
        _links: {
          webui: `https://acme.nexus.io/wiki/spaces/${s.key}`
        }
      })),
      size: state.pages.spaces.length
    };
  },

  getDocsInPagesSpace: (args, state) => {
    const spaceId = String(args.spaceId || '');
    const limit = Number(args.limit) || 25;

    const space = state.pages.spaces.find(s => s.id === spaceId || s.key === spaceId);
    if (!space) {
      throw new Error(`Space ${spaceId} not found`);
    }

    const docs = Array.from(state.pages.docs.values())
      .filter(p => p.spaceId === space.id);

    return {
      results: docs.slice(0, limit).map(p => ({
        id: p.id,
        title: p.title,
        version: { number: p.version },
        _links: {
          webui: `https://acme.nexus.io/wiki/spaces/${space.key}/docs/${p.id}`
        }
      })),
      size: docs.length
    };
  },

  getPagesDoc: (args, state) => {
    const docId = String(args.docId || '');
    const doc = state.pages.docs.get(docId);
    if (!doc) {
      throw new Error(`Doc ${docId} not found`);
    }
    // Log that this doc was read
    logRead(state, `pages:doc:${docId}`, { title: doc.title });
    return formatPagesDocResponse(doc, state);
  },

  getPagesDocInlineComments: (args, state) => {
    const docId = String(args.docId || '');
    const doc = state.pages.docs.get(docId);
    if (!doc) {
      throw new Error(`Doc ${docId} not found`);
    }

    // Log that inline comments were read (critical for validation!)
    logRead(state, `pages:inlineComments:${docId}`, {
      commentCount: doc.inlineComments.length,
      hasLegalComment: doc.inlineComments.some(c => c.author.includes('Legal'))
    });

    return {
      results: doc.inlineComments.map(c => ({
        id: c.id,
        anchor: c.anchor,
        body: { storage: { value: c.body } },
        author: { displayName: c.author },
        created: c.created
      })),
      size: doc.inlineComments.length
    };
  },

  getPagesDocFooterComments: (args, state) => {
    const docId = String(args.docId || '');
    const doc = state.pages.docs.get(docId);
    if (!doc) {
      throw new Error(`Doc ${docId} not found`);
    }

    return {
      results: doc.footerComments.map(c => ({
        id: c.id,
        body: { storage: { value: c.body } },
        author: { displayName: c.author },
        created: c.created
      })),
      size: doc.footerComments.length
    };
  },

  getPagesDocDescendants: (args, state) => {
    const docId = String(args.docId || '');
    const limit = Number(args.limit) || 25;

    const descendants = Array.from(state.pages.docs.values())
      .filter(p => p.parentId === docId);

    return {
      results: descendants.slice(0, limit).map(p => ({
        id: p.id,
        title: p.title
      })),
      size: descendants.length
    };
  },

  createPagesDoc: (args, state) => {
    const spaceId = String(args.spaceId || '');
    const title = String(args.title || '');
    const body = String(args.body || '');
    const parentId = args.parentId ? String(args.parentId) : undefined;

    const result = createPagesDoc(state, spaceId, title, body, parentId);
    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      id: result.docId,
      title,
      version: { number: 1 },
      _links: {
        webui: `https://acme.nexus.io/wiki/docs/${result.docId}`
      }
    };
  },

  updatePagesDoc: (args, state) => {
    const docId = String(args.docId || '');
    const title = args.title ? String(args.title) : undefined;
    const body = args.body ? String(args.body) : undefined;
    const version = args.version ? Number(args.version) : undefined;

    const result = updatePagesDoc(state, docId, { title, body, version });
    if (!result.success) {
      throw new Error(result.error);
    }

    const doc = state.pages.docs.get(docId)!;
    return formatPagesDocResponse(doc, state);
  },

  createPagesInlineComment: (args, state) => {
    const docId = String(args.docId || '');
    const body = String(args.body || '');
    const anchor = String(args.anchor || '');

    const result = createPagesInlineComment(state, docId, body, anchor);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.commentId, created: true };
  },

  createPagesFooterComment: (args, state) => {
    const docId = String(args.docId || '');
    const body = String(args.body || '');

    const result = createPagesFooterComment(state, docId, body);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.commentId, created: true };
  },

  searchPagesUsingNql: (args, state) => {
    const nql = String(args.nql || '').toLowerCase();
    const limit = Number(args.limit) || 25;

    // Very basic NQL parsing
    const results: PagesDoc[] = [];

    // Parse "title ~ 'something'" or "text ~ 'something'"
    const titleMatch = nql.match(/title\s*~\s*["']([^"']+)["']/);
    const textMatch = nql.match(/text\s*~\s*["']([^"']+)["']/);
    const spaceMatch = nql.match(/space\s*=\s*["']([^"']+)["']/);

    for (const doc of state.pages.docs.values()) {
      let matches = true;

      if (titleMatch && !doc.title.toLowerCase().includes(titleMatch[1].toLowerCase())) {
        matches = false;
      }
      if (textMatch && !doc.body.toLowerCase().includes(textMatch[1].toLowerCase())) {
        matches = false;
      }
      if (spaceMatch) {
        const space = state.pages.spaces.find(s => s.id === doc.spaceId);
        if (space?.key.toLowerCase() !== spaceMatch[1].toLowerCase()) {
          matches = false;
        }
      }

      if (matches) {
        results.push(doc);
      }
    }

    // Return in same format as global search for consistent display
    return {
      results: results.slice(0, limit).map(p => {
        const space = state.pages.spaces.find(s => s.id === p.spaceId);
        return {
          type: 'pages:doc',
          id: p.id,
          title: p.title,
          url: `https://acme.nexus.io/wiki/spaces/${space?.key}/docs/${p.id}`,
          excerpt: p.body.substring(0, 200) + '...'
        };
      }),
      total: results.length
    };
  },

  // ============ TRACKER ============

  getVisibleTrackerProjects: (args, state) => {
    return {
      values: state.tracker.projects.map(p => ({
        id: p.id,
        key: p.key,
        name: p.name,
        projectTypeKey: 'software'
      }))
    };
  },

  getTrackerProjectIssueTypesMetadata: (args, state) => {
    const projectKey = String(args.projectKey || '');
    if (!projectKey) {
      const availableProjects = state.tracker.projects.map(p => p.key).join(', ');
      throw new Error(`Missing projectKey parameter. Available projects: ${availableProjects}. Usage: getTrackerProjectIssueTypesMetadata("LHR")`);
    }
    const project = state.tracker.projects.find(p => p.key === projectKey);
    if (!project) {
      const availableProjects = state.tracker.projects.map(p => p.key).join(', ');
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

  getTrackerIssueTypeMetaWithFields: (args, state) => {
    const projectKey = String(args.projectKey || '');
    const issueTypeName = String(args.issueType || '');

    if (!projectKey) {
      const availableProjects = state.tracker.projects.map(p => p.key).join(', ');
      throw new Error(`Missing projectKey parameter. Available projects: ${availableProjects}`);
    }
    const project = state.tracker.projects.find(p => p.key === projectKey);
    if (!project) {
      const availableProjects = state.tracker.projects.map(p => p.key).join(', ');
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

  searchTrackerIssuesUsingTql: (args, state) => {
    const tql = String(args.tql || '').toLowerCase();
    const limit = Number(args.limit) || 10;
    const startAt = Number(args.startAt) || 0;

    const results: TrackerIssue[] = [];

    // Basic TQL parsing
    const projectMatch = tql.match(/project\s*=\s*["']?(\w+)["']?/);
    const statusMatch = tql.match(/status\s*=\s*["']([^"']+)["']/);
    const keyMatch = tql.match(/key\s*=\s*["']?([A-Z]+-\d+)["']?/);

    for (const issue of state.tracker.issues.values()) {
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
        if (!issue.summary.toLowerCase().includes(tql) &&
            !issue.key.toLowerCase().includes(tql)) {
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
      issues: results.slice(startAt, startAt + limit).map(i => formatTrackerIssueResponse(i))
    };
  },

  getTrackerIssue: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    if (!issueIdOrKey) {
      const availableIssues = Array.from(state.tracker.issues.keys()).join(', ');
      throw new Error(`Missing issueIdOrKey parameter. Available issues: ${availableIssues}. Usage: getTrackerIssue("LHR-100")`);
    }
    const issue = state.tracker.issues.get(issueIdOrKey) ||
      Array.from(state.tracker.issues.values()).find(i => i.id === issueIdOrKey);

    if (!issue) {
      const availableIssues = Array.from(state.tracker.issues.keys()).join(', ');
      throw new Error(`Issue "${issueIdOrKey}" not found. Available issues: ${availableIssues}`);
    }

    return formatTrackerIssueResponse(issue);
  },

  getTransitionsForTrackerIssue: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    if (!issueIdOrKey) {
      const availableIssues = Array.from(state.tracker.issues.keys()).join(', ');
      throw new Error(`Missing issueIdOrKey parameter. Available issues: ${availableIssues}`);
    }
    const issue = state.tracker.issues.get(issueIdOrKey);
    if (!issue) {
      const availableIssues = Array.from(state.tracker.issues.keys()).join(', ');
      throw new Error(`Issue "${issueIdOrKey}" not found. Available issues: ${availableIssues}`);
    }

    const transitions = state.tracker.transitions.get(issue.key) || [];
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

  editTrackerIssue: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    const fields = (args.fields || {}) as Record<string, unknown>;

    const result = editTrackerIssue(state, issueIdOrKey, fields);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { ok: true, message: `Issue ${issueIdOrKey} updated` };
  },

  transitionTrackerIssue: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    const transitionId = String(args.transitionId || '');

    const result = transitionTrackerIssue(state, issueIdOrKey, transitionId);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { ok: true, newStatus: result.newStatus };
  },

  addCommentToTrackerIssue: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    const body = String(args.body || '');

    const result = addCommentToTrackerIssue(state, issueIdOrKey, body);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.commentId, created: true };
  },

  addWorklogToTrackerIssue: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    const timeSpent = String(args.timeSpent || '');

    const result = addWorklogToTrackerIssue(state, issueIdOrKey, timeSpent);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.worklogId, created: true };
  },

  createTrackerIssue: (args, state) => {
    const projectKey = String(args.projectKey || '');
    const summary = String(args.summary || '');
    const issuetype = String(args.issuetype || 'Task');
    const description = args.description ? String(args.description) : undefined;

    const result = createTrackerIssue(state, projectKey, summary, issuetype, description);
    if (!result.success) {
      throw new Error(result.error);
    }

    return {
      id: result.issueKey?.replace(/[A-Z]+-/, 'J-'),
      key: result.issueKey,
      self: `https://acme.nexus.io/rest/api/3/issue/${result.issueKey}`
    };
  },

  getTrackerIssueRemoteLinks: (args, state) => {
    const issueIdOrKey = String(args.issueIdOrKey || '');
    const issue = state.tracker.issues.get(issueIdOrKey);
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

  lookupTrackerAccountId: (args, state) => {
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

  // ============ CATALOG ============

  getCatalogComponents: (args, state) => {
    const limit = Number(args.limit) || 25;
    const typeFilter = args.type ? String(args.type) : undefined;

    let components = Array.from(state.catalog.components.values());

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

  getCatalogComponent: (args, state) => {
    const componentId = String(args.componentId || '');
    const component = state.catalog.components.get(componentId);
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

  createCatalogComponent: (args, state) => {
    const name = String(args.name || '');
    const type = String(args.type || 'SERVICE') as 'SERVICE' | 'LIBRARY' | 'APPLICATION' | 'OTHER';
    const description = args.description ? String(args.description) : undefined;

    const result = createCatalogComponent(state, name, type, description);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.componentId, created: true };
  },

  createCatalogComponentRelationship: (args, state) => {
    const sourceId = String(args.sourceId || '');
    const targetId = String(args.targetId || '');
    const type = args.type ? String(args.type) : 'DEPENDS_ON';

    const result = createCatalogComponentRelationship(state, sourceId, targetId, type);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.relationshipId, created: true };
  },

  getCatalogCustomFieldDefinitions: (args, state) => {
    const limit = Number(args.limit) || 25;

    return {
      values: state.catalog.customFieldDefs.slice(0, limit).map(f => ({
        id: f.id,
        name: f.name,
        type: f.type
      })),
      total: state.catalog.customFieldDefs.length
    };
  },

  createCatalogCustomFieldDefinition: (args, state) => {
    const name = String(args.name || '');
    const type = String(args.type || 'TEXT') as 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'USER';

    const result = createCatalogCustomFieldDefinition(state, name, type);
    if (!result.success) {
      throw new Error(result.error);
    }

    return { id: result.fieldId, created: true };
  },
};

// ============ HELPER FUNCTIONS ============

function formatPagesDocResponse(doc: PagesDoc, state: NexusState) {
  const space = state.pages.spaces.find(s => s.id === doc.spaceId);
  return {
    id: doc.id,
    title: doc.title,
    space: {
      id: space?.id,
      key: space?.key,
      name: space?.name
    },
    version: {
      number: doc.version,
      when: doc.updated
    },
    body: {
      storage: {
        value: doc.body,
        representation: 'storage'
      }
    },
    _links: {
      webui: `https://acme.nexus.io/wiki/spaces/${space?.key}/docs/${doc.id}`,
      self: `https://acme.nexus.io/wiki/rest/api/content/${doc.id}`
    }
  };
}

function formatTrackerIssueResponse(issue: TrackerIssue) {
  return {
    id: issue.id,
    key: issue.key,
    self: `https://acme.nexus.io/rest/api/3/issue/${issue.key}`,
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
