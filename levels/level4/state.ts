/**
 * Mutable State Engine for Atlassian MCP Simulation
 *
 * Tracks the complete state of Jira, Confluence, and Compass
 * All mutations are logged for validation
 */

// Unique ID counter to avoid timestamp collisions
let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

// ============ TYPES ============

export interface AtlassianUser {
  accountId: string;
  displayName: string;
  email: string;
}

export interface AtlassianResource {
  cloudId: string;
  site: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  projectKey: string;
  summary: string;
  description?: string;
  status: string;
  issueType: string;
  priority?: string;
  assignee?: string;
  reporter?: string;
  labels?: string[];
  customFields?: Record<string, unknown>;
  comments: JiraComment[];
  worklogs: JiraWorklog[];
  remoteLinks: JiraRemoteLink[];
  created: string;
  updated: string;
}

export interface JiraComment {
  id: string;
  author: string;
  body: string;
  created: string;
}

export interface JiraWorklog {
  id: string;
  author: string;
  timeSpent: string;
  timeSpentSeconds: number;
  started: string;
}

export interface JiraRemoteLink {
  id: string;
  url: string;
  title: string;
}

export interface JiraTransition {
  id: string;
  name: string;
  toStatus: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  issueTypes: JiraIssueType[];
}

export interface JiraIssueType {
  id: string;
  name: string;
  fields: JiraFieldMeta[];
}

export interface JiraFieldMeta {
  key: string;
  name: string;
  required: boolean;
  schema: { type: string };
}

export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type: 'global' | 'personal';
}

export interface ConfluencePage {
  id: string;
  spaceId: string;
  parentId?: string;
  title: string;
  body: string; // Markdown content
  version: number;
  inlineComments: ConfluenceInlineComment[];
  footerComments: ConfluenceFooterComment[];
  created: string;
  updated: string;
}

export interface ConfluenceInlineComment {
  id: string;
  anchor: string; // e.g., "row:LHR-103"
  author: string;
  body: string;
  created: string;
}

export interface ConfluenceFooterComment {
  id: string;
  author: string;
  body: string;
  created: string;
}

export interface CompassComponent {
  id: string;
  name: string;
  type: 'SERVICE' | 'LIBRARY' | 'APPLICATION' | 'OTHER';
  description?: string;
  relationships: CompassRelationship[];
  customFields: Record<string, unknown>;
}

export interface CompassRelationship {
  id: string;
  targetId: string;
  type: string;
}

export interface CompassCustomFieldDef {
  id: string;
  name: string;
  type: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'USER';
}

// Action log for validation
export interface ActionLog {
  timestamp: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
}

// Read log for tracking what was read (not mutated)
export interface ReadLog {
  timestamp: string;
  resource: string; // e.g., "confluence:page:P-501", "confluence:inlineComments:P-501"
  details?: Record<string, unknown>;
}

// ============ STATE ============

export interface AtlassianState {
  user: AtlassianUser;
  resources: AtlassianResource[];

  jira: {
    projects: JiraProject[];
    issues: Map<string, JiraIssue>; // key -> issue
    transitions: Map<string, JiraTransition[]>; // issueKey -> available transitions
  };

  confluence: {
    spaces: ConfluenceSpace[];
    pages: Map<string, ConfluencePage>; // id -> page
  };

  compass: {
    components: Map<string, CompassComponent>;
    customFieldDefs: CompassCustomFieldDef[];
  };

  // Mutation log for validation
  actionLog: ActionLog[];

  // Read log for tracking what resources were accessed
  readLog: ReadLog[];
}

// ============ INITIAL STATE FACTORY ============

export function createInitialState(): AtlassianState {
  const state: AtlassianState = {
    user: {
      accountId: 'user-001',
      displayName: 'Agent User',
      email: 'agent@acme.atlassian.net'
    },
    resources: [
      { cloudId: 'c-123', site: 'https://acme.atlassian.net' }
    ],
    jira: {
      projects: [
        {
          id: 'P-LHR',
          key: 'LHR',
          name: 'Lighthouse Retention',
          issueTypes: [
            {
              id: 'IT-1',
              name: 'Task',
              fields: [
                { key: 'summary', name: 'Summary', required: true, schema: { type: 'string' } },
                { key: 'description', name: 'Description', required: false, schema: { type: 'string' } },
                { key: 'customfield_10001', name: 'Retention Window', required: false, schema: { type: 'string' } }
              ]
            },
            {
              id: 'IT-2',
              name: 'Story',
              fields: [
                { key: 'summary', name: 'Summary', required: true, schema: { type: 'string' } },
                { key: 'description', name: 'Description', required: false, schema: { type: 'string' } }
              ]
            }
          ]
        }
      ],
      issues: new Map(),
      transitions: new Map()
    },
    confluence: {
      spaces: [
        { id: 'S-SEC', key: 'SEC', name: 'Security & Compliance', type: 'global' },
        { id: 'S-GROW', key: 'GROW', name: 'Growth', type: 'global' }
      ],
      pages: new Map()
    },
    compass: {
      components: new Map(),
      customFieldDefs: []
    },
    actionLog: [],
    readLog: []
  };

  // Add initial Jira issues
  const issues: JiraIssue[] = [
    {
      id: 'J-100',
      key: 'LHR-100',
      projectKey: 'LHR',
      summary: 'Lighthouse – Data retention rollout',
      description: 'Implement the data retention policy for Lighthouse.',
      status: 'To Do',
      issueType: 'Task',
      comments: [],
      worklogs: [],
      remoteLinks: [],
      created: '2024-01-01T10:00:00Z',
      updated: '2024-01-01T10:00:00Z'
    },
    {
      id: 'J-101',
      key: 'LHR-101',
      projectKey: 'LHR',
      summary: 'Auto-delete transcripts (TBD)',
      description: 'Implement automatic deletion of transcripts.',
      status: 'To Do',
      issueType: 'Task',
      comments: [],
      worklogs: [],
      remoteLinks: [],
      created: '2024-01-01T10:00:00Z',
      updated: '2024-01-01T10:00:00Z'
    },
    {
      id: 'J-102',
      key: 'LHR-102',
      projectKey: 'LHR',
      summary: 'Access controls (TBD)',
      description: 'Implement role-based access controls.',
      status: 'To Do',
      issueType: 'Task',
      comments: [],
      worklogs: [],
      remoteLinks: [],
      created: '2024-01-01T10:00:00Z',
      updated: '2024-01-01T10:00:00Z'
    },
    {
      id: 'J-103',
      key: 'LHR-103',
      projectKey: 'LHR',
      summary: 'Privacy language (TBD)',
      description: 'Update privacy language across the platform.',
      status: 'Blocked - Legal',
      issueType: 'Task',
      comments: [],
      worklogs: [],
      remoteLinks: [],
      created: '2024-01-01T10:00:00Z',
      updated: '2024-01-01T10:00:00Z'
    }
  ];

  for (const issue of issues) {
    state.jira.issues.set(issue.key, issue);
    // Set available transitions for each issue
    state.jira.transitions.set(issue.key, [
      { id: 'T-1', name: 'Start Progress', toStatus: 'In Progress' },
      { id: 'T-2', name: 'Done', toStatus: 'Done' },
      { id: 'T-3', name: 'Block', toStatus: 'Blocked' }
    ]);
  }

  // Add Confluence pages
  const pages: ConfluencePage[] = [
    {
      id: 'P-500',
      spaceId: 'S-SEC',
      title: 'Lighthouse Retention Roadmap (Draft)',
      body: `# Lighthouse Retention Roadmap (Draft)

⚠️ **Draft only. Do not apply.**

| Issue | Change |
|---|---|
| LHR-100 | (draft numbers) |
| LHR-101 | (draft numbers) |
| LHR-102 | (draft numbers) |
| LHR-103 | (draft numbers) |`,
      version: 1,
      inlineComments: [],
      footerComments: [],
      created: '2024-01-01T10:00:00Z',
      updated: '2024-01-01T10:00:00Z'
    },
    {
      id: 'P-501',
      spaceId: 'S-SEC',
      title: 'Lighthouse Retention Roadmap (LIVE)',
      body: `# Lighthouse Retention Roadmap (LIVE)

## Approved changes (apply to Jira)

| Jira key | What to change | Target status |
|---|---|---|
| **LHR-100** | Set **Retention window** = \`18 months\` | In Progress |
| **LHR-101** | Summary → \`Implement auto-delete\` | In Progress |
| **LHR-102** | Summary → \`Role-based access\` | In Progress |
| **LHR-103** | Summary → \`Update privacy language\` | In Progress |

## Notes
- Comment on each issue with the Confluence link after updating.`,
      version: 3,
      inlineComments: [
        {
          id: 'IC-77',
          anchor: 'row:LHR-103',
          author: 'Irene (Legal)',
          body: 'Do **NOT** transition LHR-103 yet. Keep it in current status until Legal sign-off.',
          created: '2024-01-05T14:30:00Z'
        }
      ],
      footerComments: [
        {
          id: 'FC-1',
          author: 'Product Manager',
          body: 'Ready for implementation!',
          created: '2024-01-04T09:00:00Z'
        }
      ],
      created: '2024-01-01T10:00:00Z',
      updated: '2024-01-05T14:30:00Z'
    }
  ];

  for (const page of pages) {
    state.confluence.pages.set(page.id, page);
  }

  return state;
}

// ============ STATE MUTATIONS ============

function logAction(state: AtlassianState, action: string, target: string, details: Record<string, unknown>): void {
  state.actionLog.push({
    timestamp: new Date().toISOString(),
    action,
    target,
    details
  });
}

// --- Jira Mutations ---

export function editJiraIssue(
  state: AtlassianState,
  issueIdOrKey: string,
  fields: Record<string, unknown>
): { success: boolean; error?: string } {
  const issue = state.jira.issues.get(issueIdOrKey) ||
    Array.from(state.jira.issues.values()).find(i => i.id === issueIdOrKey);

  if (!issue) {
    return { success: false, error: `Issue ${issueIdOrKey} not found` };
  }

  // Apply field updates
  if (fields.summary !== undefined) {
    issue.summary = String(fields.summary);
  }
  if (fields.description !== undefined) {
    issue.description = String(fields.description);
  }
  if (fields.priority !== undefined) {
    issue.priority = String(fields.priority);
  }
  if (fields.labels !== undefined) {
    issue.labels = fields.labels as string[];
  }

  // Handle custom fields
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('customfield_')) {
      issue.customFields = issue.customFields || {};
      issue.customFields[key] = value;
    }
  }

  issue.updated = new Date().toISOString();

  logAction(state, 'editJiraIssue', issue.key, { fields });

  return { success: true };
}

export function transitionJiraIssue(
  state: AtlassianState,
  issueIdOrKey: string,
  transitionId: string
): { success: boolean; error?: string; newStatus?: string } {
  const issue = state.jira.issues.get(issueIdOrKey) ||
    Array.from(state.jira.issues.values()).find(i => i.id === issueIdOrKey);

  if (!issue) {
    return { success: false, error: `Issue ${issueIdOrKey} not found` };
  }

  const transitions = state.jira.transitions.get(issue.key) || [];
  const transition = transitions.find(t => t.id === transitionId);

  if (!transition) {
    return { success: false, error: `Transition ${transitionId} not available for ${issue.key}` };
  }

  const oldStatus = issue.status;
  issue.status = transition.toStatus;
  issue.updated = new Date().toISOString();

  logAction(state, 'transitionJiraIssue', issue.key, {
    transitionId,
    transitionName: transition.name,
    fromStatus: oldStatus,
    toStatus: transition.toStatus
  });

  return { success: true, newStatus: transition.toStatus };
}

export function addCommentToJiraIssue(
  state: AtlassianState,
  issueIdOrKey: string,
  body: string
): { success: boolean; commentId?: string; error?: string } {
  const issue = state.jira.issues.get(issueIdOrKey) ||
    Array.from(state.jira.issues.values()).find(i => i.id === issueIdOrKey);

  if (!issue) {
    return { success: false, error: `Issue ${issueIdOrKey} not found` };
  }

  const commentId = generateId('C');
  issue.comments.push({
    id: commentId,
    author: state.user.displayName,
    body,
    created: new Date().toISOString()
  });
  issue.updated = new Date().toISOString();

  logAction(state, 'addCommentToJiraIssue', issue.key, { commentId, body });

  return { success: true, commentId };
}

export function addWorklogToJiraIssue(
  state: AtlassianState,
  issueIdOrKey: string,
  timeSpent: string
): { success: boolean; worklogId?: string; error?: string } {
  const issue = state.jira.issues.get(issueIdOrKey) ||
    Array.from(state.jira.issues.values()).find(i => i.id === issueIdOrKey);

  if (!issue) {
    return { success: false, error: `Issue ${issueIdOrKey} not found` };
  }

  // Parse time spent (e.g., "2h 30m" -> seconds)
  const seconds = parseTimeSpent(timeSpent);

  const worklogId = generateId('W');
  issue.worklogs.push({
    id: worklogId,
    author: state.user.displayName,
    timeSpent,
    timeSpentSeconds: seconds,
    started: new Date().toISOString()
  });
  issue.updated = new Date().toISOString();

  logAction(state, 'addWorklogToJiraIssue', issue.key, { worklogId, timeSpent, seconds });

  return { success: true, worklogId };
}

function parseTimeSpent(timeSpent: string): number {
  let seconds = 0;
  const hoursMatch = timeSpent.match(/(\d+)h/);
  const minutesMatch = timeSpent.match(/(\d+)m/);
  const daysMatch = timeSpent.match(/(\d+)d/);

  if (daysMatch) seconds += parseInt(daysMatch[1]) * 8 * 3600; // 8h workday
  if (hoursMatch) seconds += parseInt(hoursMatch[1]) * 3600;
  if (minutesMatch) seconds += parseInt(minutesMatch[1]) * 60;

  return seconds;
}

export function createJiraIssue(
  state: AtlassianState,
  projectKey: string,
  summary: string,
  issueType: string,
  description?: string
): { success: boolean; issueKey?: string; error?: string } {
  const project = state.jira.projects.find(p => p.key === projectKey);
  if (!project) {
    return { success: false, error: `Project ${projectKey} not found` };
  }

  const issueType_ = project.issueTypes.find(t => t.name === issueType);
  if (!issueType_) {
    return { success: false, error: `Issue type ${issueType} not found in project ${projectKey}` };
  }

  // Generate new issue key
  const existingKeys = Array.from(state.jira.issues.keys())
    .filter(k => k.startsWith(projectKey + '-'))
    .map(k => parseInt(k.split('-')[1]))
    .filter(n => !isNaN(n));
  const nextNum = existingKeys.length > 0 ? Math.max(...existingKeys) + 1 : 1;
  const issueKey = `${projectKey}-${nextNum}`;
  const issueId = `J-${nextNum}`;

  const issue: JiraIssue = {
    id: issueId,
    key: issueKey,
    projectKey,
    summary,
    description,
    status: 'To Do',
    issueType,
    comments: [],
    worklogs: [],
    remoteLinks: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };

  state.jira.issues.set(issueKey, issue);
  state.jira.transitions.set(issueKey, [
    { id: 'T-1', name: 'Start Progress', toStatus: 'In Progress' },
    { id: 'T-2', name: 'Done', toStatus: 'Done' }
  ]);

  logAction(state, 'createJiraIssue', issueKey, { projectKey, summary, issueType });

  return { success: true, issueKey };
}

// --- Confluence Mutations ---

export function createConfluencePage(
  state: AtlassianState,
  spaceId: string,
  title: string,
  body: string,
  parentId?: string
): { success: boolean; pageId?: string; error?: string } {
  const space = state.confluence.spaces.find(s => s.id === spaceId || s.key === spaceId);
  if (!space) {
    return { success: false, error: `Space ${spaceId} not found` };
  }

  const pageId = generateId('P');
  const page: ConfluencePage = {
    id: pageId,
    spaceId: space.id,
    parentId,
    title,
    body,
    version: 1,
    inlineComments: [],
    footerComments: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString()
  };

  state.confluence.pages.set(pageId, page);

  logAction(state, 'createConfluencePage', pageId, { spaceId, title, parentId });

  return { success: true, pageId };
}

export function updateConfluencePage(
  state: AtlassianState,
  pageId: string,
  updates: { title?: string; body?: string; version?: number }
): { success: boolean; error?: string } {
  const page = state.confluence.pages.get(pageId);
  if (!page) {
    return { success: false, error: `Page ${pageId} not found` };
  }

  // Optimistic locking check
  if (updates.version !== undefined && updates.version !== page.version) {
    return { success: false, error: `Version conflict: expected ${page.version}, got ${updates.version}` };
  }

  if (updates.title !== undefined) {
    page.title = updates.title;
  }
  if (updates.body !== undefined) {
    page.body = updates.body;
  }

  page.version++;
  page.updated = new Date().toISOString();

  logAction(state, 'updateConfluencePage', pageId, updates);

  return { success: true };
}

export function createConfluenceInlineComment(
  state: AtlassianState,
  pageId: string,
  body: string,
  anchor: string
): { success: boolean; commentId?: string; error?: string } {
  const page = state.confluence.pages.get(pageId);
  if (!page) {
    return { success: false, error: `Page ${pageId} not found` };
  }

  const commentId = generateId('IC');
  page.inlineComments.push({
    id: commentId,
    anchor,
    author: state.user.displayName,
    body,
    created: new Date().toISOString()
  });
  page.updated = new Date().toISOString();

  logAction(state, 'createConfluenceInlineComment', pageId, { commentId, anchor, body });

  return { success: true, commentId };
}

export function createConfluenceFooterComment(
  state: AtlassianState,
  pageId: string,
  body: string
): { success: boolean; commentId?: string; error?: string } {
  const page = state.confluence.pages.get(pageId);
  if (!page) {
    return { success: false, error: `Page ${pageId} not found` };
  }

  const commentId = generateId('FC');
  page.footerComments.push({
    id: commentId,
    author: state.user.displayName,
    body,
    created: new Date().toISOString()
  });
  page.updated = new Date().toISOString();

  logAction(state, 'createConfluenceFooterComment', pageId, { commentId, body });

  return { success: true, commentId };
}

// --- Compass Mutations ---

export function createCompassComponent(
  state: AtlassianState,
  name: string,
  type: 'SERVICE' | 'LIBRARY' | 'APPLICATION' | 'OTHER',
  description?: string
): { success: boolean; componentId?: string; error?: string } {
  const componentId = generateId('COMP');
  const component: CompassComponent = {
    id: componentId,
    name,
    type,
    description,
    relationships: [],
    customFields: {}
  };

  state.compass.components.set(componentId, component);

  logAction(state, 'createCompassComponent', componentId, { name, type });

  return { success: true, componentId };
}

export function createCompassComponentRelationship(
  state: AtlassianState,
  sourceId: string,
  targetId: string,
  relationType: string = 'DEPENDS_ON'
): { success: boolean; relationshipId?: string; error?: string } {
  const source = state.compass.components.get(sourceId);
  if (!source) {
    return { success: false, error: `Source component ${sourceId} not found` };
  }

  const target = state.compass.components.get(targetId);
  if (!target) {
    return { success: false, error: `Target component ${targetId} not found` };
  }

  const relationshipId = generateId('REL');
  source.relationships.push({
    id: relationshipId,
    targetId,
    type: relationType
  });

  logAction(state, 'createCompassComponentRelationship', sourceId, { targetId, relationType });

  return { success: true, relationshipId };
}

export function createCompassCustomFieldDefinition(
  state: AtlassianState,
  name: string,
  type: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'USER'
): { success: boolean; fieldId?: string; error?: string } {
  const fieldId = generateId('CFD');
  state.compass.customFieldDefs.push({
    id: fieldId,
    name,
    type
  });

  logAction(state, 'createCompassCustomFieldDefinition', fieldId, { name, type });

  return { success: true, fieldId };
}

// ============ VALIDATION HELPERS ============

export function getActionLog(state: AtlassianState): ActionLog[] {
  return [...state.actionLog];
}

export function hasAction(state: AtlassianState, action: string, target?: string): boolean {
  return state.actionLog.some(log =>
    log.action === action && (target === undefined || log.target === target)
  );
}

export function getIssueStatus(state: AtlassianState, issueKey: string): string | undefined {
  return state.jira.issues.get(issueKey)?.status;
}

export function getIssueComments(state: AtlassianState, issueKey: string): JiraComment[] {
  return state.jira.issues.get(issueKey)?.comments || [];
}

export function wasIssueTransitioned(state: AtlassianState, issueKey: string, toStatus?: string): boolean {
  return state.actionLog.some(log =>
    log.action === 'transitionJiraIssue' &&
    log.target === issueKey &&
    (toStatus === undefined || log.details.toStatus === toStatus)
  );
}

export function wasIssueEdited(state: AtlassianState, issueKey: string): boolean {
  return state.actionLog.some(log =>
    log.action === 'editJiraIssue' && log.target === issueKey
  );
}

export function wasCommentAdded(state: AtlassianState, issueKey: string): boolean {
  return state.actionLog.some(log =>
    log.action === 'addCommentToJiraIssue' && log.target === issueKey
  );
}

// ============ READ TRACKING ============

export function logRead(state: AtlassianState, resource: string, details?: Record<string, unknown>): void {
  state.readLog.push({
    timestamp: new Date().toISOString(),
    resource,
    details
  });
}

export function wasResourceRead(state: AtlassianState, resourcePattern: string): boolean {
  return state.readLog.some(log => log.resource.includes(resourcePattern));
}

export function wasInlineCommentsRead(state: AtlassianState, pageId: string): boolean {
  return state.readLog.some(log =>
    log.resource === `confluence:inlineComments:${pageId}`
  );
}

export function wasPageRead(state: AtlassianState, pageId: string): boolean {
  return state.readLog.some(log =>
    log.resource === `confluence:page:${pageId}`
  );
}
