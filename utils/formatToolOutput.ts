/**
 * Smart formatter for tool output that contains JSON with embedded markdown.
 * Makes Confluence pages, Jira issues, and other structured data more readable.
 */

export interface FormattedSection {
  type: 'header' | 'metadata' | 'markdown' | 'json' | 'text' | 'divider' | 'list';
  content: string;
  label?: string;
}

/**
 * Attempts to parse and format JSON tool output into readable sections.
 * Falls back to raw content if not applicable.
 */
export function formatToolOutput(content: string): FormattedSection[] {
  const trimmed = content.trim();

  // Not JSON? Return as-is
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return [{ type: 'text', content: trimmed }];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Invalid JSON, return as-is
    return [{ type: 'text', content: trimmed }];
  }

  // Detect response type and format accordingly
  if (isConfluencePage(parsed)) {
    return formatConfluencePage(parsed);
  }

  if (isConfluenceComments(parsed)) {
    return formatConfluenceComments(parsed);
  }

  if (isJiraIssue(parsed)) {
    return formatJiraIssue(parsed);
  }

  if (isJiraSearchResults(parsed)) {
    return formatJiraSearchResults(parsed);
  }

  if (isSearchResults(parsed)) {
    return formatSearchResults(parsed);
  }

  if (isSimpleSuccess(parsed)) {
    return formatSimpleSuccess(parsed);
  }

  // Unknown JSON structure - return formatted JSON
  return [{ type: 'json', content: JSON.stringify(parsed, null, 2) }];
}

// ============ TYPE GUARDS ============

interface ConfluencePage {
  id: string;
  title: string;
  body?: { storage?: { value?: string } };
  space?: { key?: string; name?: string };
  version?: { number?: number };
  _links?: { webui?: string };
}

function isConfluencePage(obj: unknown): obj is ConfluencePage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'title' in obj &&
    'body' in obj &&
    typeof (obj as ConfluencePage).body?.storage?.value === 'string'
  );
}

interface ConfluenceComments {
  results: Array<{
    id: string;
    anchor?: string;
    body?: { storage?: { value?: string } };
    author?: { displayName?: string };
    created?: string;
  }>;
  size: number;
}

function isConfluenceComments(obj: unknown): obj is ConfluenceComments {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'results' in obj &&
    Array.isArray((obj as ConfluenceComments).results) &&
    (obj as ConfluenceComments).results.length > 0 &&
    'body' in (obj as ConfluenceComments).results[0]
  );
}

interface JiraIssue {
  key: string;
  fields: {
    summary?: string;
    description?: string;
    status?: { name?: string };
    issuetype?: { name?: string };
    priority?: { name?: string };
  };
}

function isJiraIssue(obj: unknown): obj is JiraIssue {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'key' in obj &&
    'fields' in obj &&
    typeof (obj as JiraIssue).key === 'string' &&
    (obj as JiraIssue).key.match(/^[A-Z]+-\d+$/) !== null
  );
}

interface JiraSearchResults {
  issues: JiraIssue[];
  total: number;
}

function isJiraSearchResults(obj: unknown): obj is JiraSearchResults {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'issues' in obj &&
    Array.isArray((obj as JiraSearchResults).issues) &&
    'total' in obj
  );
}

interface SearchResults {
  results: Array<{
    type: string;
    id: string;
    title: string;
    url?: string;
    excerpt?: string;
  }>;
  total?: number;
}

function isSearchResults(obj: unknown): obj is SearchResults {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'results' in obj &&
    Array.isArray((obj as SearchResults).results) &&
    (obj as SearchResults).results.length > 0 &&
    'title' in (obj as SearchResults).results[0] &&
    'type' in (obj as SearchResults).results[0]
  );
}

interface SimpleSuccess {
  ok?: boolean;
  created?: boolean;
  id?: string;
  message?: string;
  newStatus?: string;
}

function isSimpleSuccess(obj: unknown): obj is SimpleSuccess {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    ('ok' in obj || 'created' in obj || 'newStatus' in obj)
  );
}

// ============ FORMATTERS ============

function formatConfluencePage(page: ConfluencePage): FormattedSection[] {
  const sections: FormattedSection[] = [];

  // Header with page info
  const spaceInfo = page.space?.key ? ` [${page.space.key}]` : '';
  const versionInfo = page.version?.number ? ` v${page.version.number}` : '';
  sections.push({
    type: 'header',
    content: `${page.title}`,
    label: `Confluence Page${spaceInfo}${versionInfo}`
  });

  // Metadata line
  const metaParts: string[] = [];
  if (page.id) metaParts.push(`ID: ${page.id}`);
  if (page._links?.webui) metaParts.push(`URL: ${page._links.webui}`);
  if (metaParts.length > 0) {
    sections.push({ type: 'metadata', content: metaParts.join(' | ') });
  }

  sections.push({ type: 'divider', content: '' });

  // Main content - markdown!
  if (page.body?.storage?.value) {
    sections.push({ type: 'markdown', content: page.body.storage.value });
  }

  return sections;
}

function formatConfluenceComments(data: ConfluenceComments): FormattedSection[] {
  const sections: FormattedSection[] = [];

  sections.push({
    type: 'header',
    content: `${data.results.length} Inline Comment${data.results.length !== 1 ? 's' : ''}`,
    label: 'Confluence Comments'
  });

  sections.push({ type: 'divider', content: '' });

  for (const comment of data.results) {
    const author = comment.author?.displayName || 'Unknown';
    const anchor = comment.anchor ? ` [${comment.anchor}]` : '';

    sections.push({
      type: 'metadata',
      content: `${author}${anchor}:`
    });

    if (comment.body?.storage?.value) {
      sections.push({ type: 'markdown', content: comment.body.storage.value });
    }

    if (data.results.indexOf(comment) < data.results.length - 1) {
      sections.push({ type: 'divider', content: '' });
    }
  }

  return sections;
}

function formatJiraIssue(issue: JiraIssue): FormattedSection[] {
  const sections: FormattedSection[] = [];

  const status = issue.fields.status?.name || 'Unknown';
  const type = issue.fields.issuetype?.name || 'Issue';

  sections.push({
    type: 'header',
    content: `${issue.key}: ${issue.fields.summary || 'No summary'}`,
    label: `Jira ${type}`
  });

  // Status and other metadata
  const metaParts: string[] = [`Status: ${status}`];
  if (issue.fields.priority?.name) {
    metaParts.push(`Priority: ${issue.fields.priority.name}`);
  }
  sections.push({ type: 'metadata', content: metaParts.join(' | ') });

  // Description if present
  if (issue.fields.description) {
    sections.push({ type: 'divider', content: '' });
    sections.push({ type: 'markdown', content: issue.fields.description });
  }

  return sections;
}

function formatJiraSearchResults(data: JiraSearchResults): FormattedSection[] {
  const sections: FormattedSection[] = [];

  sections.push({
    type: 'header',
    content: `${data.total} Issue${data.total !== 1 ? 's' : ''} Found`,
    label: 'Jira Search'
  });

  sections.push({ type: 'divider', content: '' });

  const lines: string[] = [];
  for (const issue of data.issues) {
    const status = issue.fields.status?.name || '?';
    lines.push(`${issue.key}: ${issue.fields.summary} [${status}]`);
  }

  sections.push({ type: 'list', content: lines.join('\n') });

  return sections;
}

function formatSearchResults(data: SearchResults): FormattedSection[] {
  const sections: FormattedSection[] = [];

  sections.push({
    type: 'header',
    content: `${data.results.length} Result${data.results.length !== 1 ? 's' : ''}`,
    label: 'Search'
  });

  sections.push({ type: 'divider', content: '' });

  const lines: string[] = [];
  for (const result of data.results) {
    const typeLabel = result.type.split(':').pop() || result.type;
    // Show ID prominently so players know how to reference resources
    const idInfo = result.id ? ` (ID: ${result.id})` : '';
    lines.push(`[${typeLabel}] ${result.title}${idInfo}`);
    if (result.excerpt) {
      lines.push(`    ${result.excerpt.substring(0, 100)}...`);
    }
  }

  sections.push({ type: 'list', content: lines.join('\n') });

  return sections;
}

function formatSimpleSuccess(data: SimpleSuccess): FormattedSection[] {
  const sections: FormattedSection[] = [];

  const parts: string[] = [];

  if (data.ok === true || data.created === true) {
    parts.push('Success');
  }
  if (data.newStatus) {
    parts.push(`New Status: ${data.newStatus}`);
  }
  if (data.id) {
    parts.push(`ID: ${data.id}`);
  }
  if (data.message) {
    parts.push(data.message);
  }

  sections.push({
    type: 'text',
    content: parts.length > 0 ? parts.join(' | ') : JSON.stringify(data)
  });

  return sections;
}

/**
 * Converts FormattedSections to a display string with visual formatting.
 * Used for terminal-style display.
 */
export function sectionsToDisplayString(sections: FormattedSection[]): string {
  const lines: string[] = [];

  for (const section of sections) {
    switch (section.type) {
      case 'header':
        if (section.label) {
          lines.push(`[${section.label}]`);
        }
        lines.push(section.content);
        break;

      case 'metadata':
        lines.push(`  ${section.content}`);
        break;

      case 'divider':
        lines.push('─'.repeat(50));
        break;

      case 'markdown':
      case 'text':
      case 'list':
        // Indent content slightly for visual hierarchy
        const contentLines = section.content.split('\n');
        for (const line of contentLines) {
          lines.push(line);
        }
        break;

      case 'json':
        lines.push(section.content);
        break;
    }
  }

  return lines.join('\n');
}
