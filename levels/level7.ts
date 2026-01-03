import { Level } from '../types';
import { GoogleGenAI } from "@google/genai";

// The "Truth" state of the simulation.
// We pass this to Gemini so it knows how to respond to tool calls consistently.
const MOCK_STATE = JSON.stringify({
  atlassian: {
    resources: [{ cloudId: "c-123", site: "https://acme.atlassian.net" }]
  },
  confluence: {
    spaces: [
      { id: "S-SEC", key: "SEC", name: "Security & Compliance" },
      { id: "S-GROW", key: "GROW", name: "Growth" }
    ],
    pages: [
      {
        id: "P-500",
        title: "Lighthouse Retention Roadmap (Draft)",
        body_markdown: "# Lighthouse Retention Roadmap (Draft)\n\n⚠️ Draft only. Do not apply.\n\n| Issue | Change |\n|---|---|\n| LHR-100 | (draft numbers) |",
        inline_comments: []
      },
      {
        id: "P-501",
        title: "Lighthouse Retention Roadmap (LIVE)",
        body_markdown: "# Lighthouse Retention Roadmap (LIVE)\n\n## Approved changes (apply to Jira)\n\n| Jira key | What to change | Target status |\n|---|---|---|\n| **LHR-100** | Set **Retention window** = `18 months` | In Progress |\n| **LHR-101** | Summary → `Implement auto-delete` | In Progress |\n| **LHR-102** | Summary → `Role-based access` | In Progress |\n| **LHR-103** | Summary → `Update privacy language` | In Progress |\n\n## Notes\n- Comment on each issue with the Confluence link after updating.",
        inline_comments: [
          {
            id: "IC-77",
            anchor: "row:LHR-103",
            author: "Irene (Legal)",
            body: "Do **NOT** transition LHR-103 yet. Keep it in current status until Legal sign-off."
          }
        ]
      }
    ]
  },
  jira: {
    issues: [
      { key: "LHR-100", id: "J-100", summary: "Lighthouse – Data retention rollout", status: "To Do" },
      { key: "LHR-101", id: "J-101", summary: "Auto-delete transcripts (TBD)", status: "To Do" },
      { key: "LHR-102", id: "J-102", summary: "Access controls (TBD)", status: "To Do" },
      { key: "LHR-103", id: "J-103", summary: "Privacy language (TBD)", status: "Blocked - Legal" }
    ],
    transitions: [
      { id: "T-1", name: "Start progress", to_status: "In Progress" }
    ]
  }
});

const SIMPLE_TOOLS = [
    // Rovo / Shared
    "atlassianUserInfo()",
    "getAccessibleAtlassianResources()",
    "search(query, cloudId?, limit?)",
    "fetch(ari)",
    // Confluence
    "createConfluenceFooterComment(pageId, body)",
    "createConfluenceInlineComment(pageId, body, anchor)",
    "createConfluencePage(spaceId, title, body)",
    "getConfluencePage(pageId)",
    "getConfluencePageDescendants(pageId)",
    "getConfluencePageFooterComments(pageId)",
    "getConfluencePageInlineComments(pageId)",
    "getConfluenceSpaces()",
    "getPagesInConfluenceSpace(spaceId)",
    "searchConfluenceUsingCql(cql)",
    "updateConfluencePage(pageId, title?, body?, version?)",
    // Jira
    "addCommentToJiraIssue(issueIdOrKey, body)",
    "addWorklogToJiraIssue(issueIdOrKey, timeSpent)",
    "createJiraIssue(projectKey, summary, issuetype)",
    "editJiraIssue(issueIdOrKey, fields)",
    "getJiraIssue(issueIdOrKey)",
    "getJiraIssueRemoteIssueLinks(issueIdOrKey)",
    "getJiraIssueTypeMetaWithFields(projectKey, issueType)",
    "getJiraProjectIssueTypesMetadata(projectKey)",
    "getTransitionsForJiraIssue(issueIdOrKey)",
    "getVisibleJiraProjects()",
    "lookupJiraAccountId(query)",
    "searchJiraIssuesUsingJql(jql)",
    "transitionJiraIssue(issueIdOrKey, transitionId)",
    // Compass
    "createCompassComponent(name, type)",
    "createCompassComponentRelationship(sourceId, targetId)",
    "createCompassCustomFieldDefinition(name, type)",
    "getCompassComponent(componentId)",
    "getCompassComponents()",
    "getCompassCustomFieldDefinitions()"
];

// The insane, verbose, realistic MCP tool definitions
const REALISTIC_TOOLS = [
  {
    "name": "atlassianUserInfo",
    "title": "Get User Info",
    "description": "Returns the account ID, name, email, and site access information for the authenticated user. Use this to determine who 'you' are in the context of the Atlassian instance.",
    "inputSchema": { "type": "object", "properties": {}, "required": [] }
  },
  {
    "name": "getAccessibleAtlassianResources",
    "title": "Get Accessible Resources",
    "description": "Lists all Atlassian Cloud sites (cloudIds) that the authenticated user can access. You MUST call this first to get the `cloudId` required for most other Jira/Confluence operations.",
    "inputSchema": {
      "type": "object",
      "properties": {},
      "required": []
    }
  },
  {
    "name": "search",
    "title": "Global Search",
    "description": "Performs a natural language search across all accessible Jira issues, Confluence pages, and other resources via Rovo Intelligence. Use this for broad discovery when specific IDs are unknown.",
    "inputSchema": {
      "type": "object",
      "required": ["query"],
      "properties": {
        "cloudId": { "type": "string", "description": "The specific cloud site ID to search within. Optional if user has only one site." },
        "query": { "type": "string", "description": "The natural language search query string." },
        "limit": { "type": "integer", "description": "Max results to return (default 5, max 10).", "minimum": 1, "maximum": 10 },
        "cursor": { "type": "string", "description": "Pagination cursor for next page of results." }
      }
    }
  },
  {
    "name": "fetch",
    "title": "Fetch ARI",
    "description": "Retrieves a specific resource by its Atlassian Resource Identifier (ARI). Only use this if you have a full ARI string from a previous search result.",
    "inputSchema": {
      "type": "object",
      "required": ["ari"],
      "properties": { "ari": { "type": "string", "description": "The ARI of the object to fetch (e.g., ari:cloud:confluence:...)."} }
    }
  },
  {
    "name": "getConfluencePage",
    "title": "Get Page Content",
    "description": "Retrieves the content of a Confluence page by its numeric ID. Returns body in storage format (XHTML) or Markdown depending on configuration.",
    "inputSchema": {
      "type": "object",
      "required": ["pageId"],
      "properties": { 
          "pageId": { "type": "string", "description": "The numeric ID of the page." },
          "version": { "type": "integer", "description": "Optional version number to retrieve." }
      }
    }
  },
  {
    "name": "getConfluencePageInlineComments",
    "title": "Get Page Inline Comments",
    "description": "Retrieves all inline comments (annotations) for a specific Confluence page. IMPORTANT: Inline comments often contain critical review notes or constraints that contradict the main body text.",
    "inputSchema": {
      "type": "object",
      "required": ["pageId"],
      "properties": { "pageId": { "type": "string", "description": "The numeric ID of the page." } }
    }
  },
  {
    "name": "searchJiraIssuesUsingJql",
    "title": "Search Jira (JQL)",
    "description": "Searches for Jira issues using Jira Query Language (JQL). This is the primary method for finding issues when precise filtering is needed (e.g., 'project = LHR AND status = \"To Do\"').",
    "inputSchema": {
      "type": "object",
      "required": ["cloudId", "jql"],
      "properties": {
        "cloudId": { "type": "string", "description": "The cloud site ID." },
        "jql": { "type": "string", "description": "The JQL query string." },
        "limit": { "type": "integer", "default": 10, "maximum": 100 },
        "startAt": { "type": "integer", "default": 0, "description": "Index of the first issue to return (0-based)." }
      }
    }
  },
  {
    "name": "getJiraIssue",
    "title": "Get Jira Issue",
    "description": "Retrieves full details of a single Jira issue by ID or Key. Includes fields, status, transitions, and metadata.",
    "inputSchema": {
      "type": "object",
      "required": ["cloudId", "issueIdOrKey"],
      "properties": {
        "cloudId": { "type": "string", "description": "The cloud site ID." },
        "issueIdOrKey": { "type": "string", "description": "The Issue Key (e.g. LHR-123) or numeric ID." }
      }
    }
  },
  {
    "name": "editJiraIssue",
    "title": "Edit Jira Issue",
    "description": "Updates fields on an existing Jira issue. Note: Status changes must be done via 'transitionJiraIssue', not this tool.",
    "inputSchema": {
      "type": "object",
      "required": ["cloudId", "issueIdOrKey", "fields"],
      "properties": {
        "cloudId": { "type": "string" },
        "issueIdOrKey": { "type": "string" },
        "fields": { 
            "type": "object", 
            "description": "A map of field keys to new values. Custom fields require their IDs (e.g. customfield_10023)." 
        }
      }
    }
  },
  {
    "name": "transitionJiraIssue",
    "title": "Transition Jira Issue",
    "description": "Moves a Jira issue to a new status by performing a workflow transition.",
    "inputSchema": {
      "type": "object",
      "required": ["cloudId", "issueIdOrKey", "transitionId"],
      "properties": {
        "cloudId": { "type": "string" },
        "issueIdOrKey": { "type": "string" },
        "transitionId": { "type": "string", "description": "The ID of the transition to perform (get this from getTransitionsForJiraIssue)." }
      }
    }
  },
  {
    "name": "getTransitionsForJiraIssue",
    "title": "Get Transitions",
    "description": "Returns a list of all valid workflow transitions available for the issue in its current state. You MUST call this to get the `transitionId` before calling `transitionJiraIssue`.",
    "inputSchema": {
      "type": "object",
      "required": ["cloudId", "issueIdOrKey"],
      "properties": {
        "cloudId": { "type": "string" },
        "issueIdOrKey": { "type": "string" }
      }
    }
  },
  {
    "name": "addCommentToJiraIssue",
    "title": "Add Jira Comment",
    "description": "Adds a comment to a Jira issue. Supports Markdown.",
    "inputSchema": {
      "type": "object",
      "required": ["cloudId", "issueIdOrKey", "body_markdown"],
      "properties": {
        "cloudId": { "type": "string" },
        "issueIdOrKey": { "type": "string" },
        "body_markdown": { "type": "string", "description": "The comment text." }
      }
    }
  },
  {
    "name": "createConfluencePage",
    "title": "Create Page",
    "description": "Creates a new page in a Confluence space.",
    "inputSchema": {
        "type": "object",
        "required": ["spaceId", "title", "body"],
        "properties": {
            "spaceId": { "type": "string" },
            "title": { "type": "string" },
            "body": { "type": "string", "description": "Storage format or Markdown." },
            "parentId": { "type": "string", "description": "Optional parent page ID." }
        }
    }
  },
  {
      "name": "updateConfluencePage",
      "title": "Update Page",
      "description": "Updates an existing Confluence page.",
      "inputSchema": {
          "type": "object",
          "required": ["pageId"],
          "properties": {
              "pageId": { "type": "string" },
              "title": { "type": "string" },
              "body": { "type": "string" },
              "version": { "type": "integer", "description": "The version number you are incrementing from (optimistic locking)." }
          }
      }
  },
  {
      "name": "getConfluenceSpaces",
      "title": "Get Spaces",
      "description": "Lists all spaces in Confluence.",
      "inputSchema": {
          "type": "object",
          "properties": {
              "limit": { "type": "integer", "default": 25 }
          }
      }
  },
  {
      "name": "createCompassComponent",
      "title": "Create Component",
      "description": "Creates a new Compass component.",
      "inputSchema": {
          "type": "object",
          "required": ["name", "type"],
          "properties": {
              "name": { "type": "string" },
              "type": { "type": "string", "enum": ["SERVICE", "LIBRARY", "APPLICATION"] }
          }
      }
  }
];


export const level7: Level = {
    id: 7,
    title: "The Corporate Archaeologist",
    description: "You are connected to a corporate Atlassian Cloud site via MCP. You must sync Jira to the latest roadmap in Confluence, respecting all rules and constraints hidden in the data.",
    systemPrompt: `You are an Agent connected to an Atlassian Rovo MCP Server.
You have access to Jira and Confluence tools.
You have NO visual interface. You must navigate by "feeling the walls" with tool calls.

GOAL: Sync Jira to the latest "Lighthouse Retention Roadmap" in Confluence.
1. Find the CORRECT roadmap page (beware of drafts).
2. Update the Jira tickets as described in the roadmap table.
3. Link the tickets back to the roadmap via comment.

IMPORTANT:
- Confluence Inline Comments are AUTHORITATIVE. They override table instructions.
- You must find IDs/Keys before you can edit anything.
- To use a tool, format your request like: toolName({ arg: "value" }) or as valid JSON-RPC if preferred.`,
    userPrompt: "Hey, can you sync Jira to the latest 'Lighthouse Retention Roadmap' in Confluence?",
    tools: SIMPLE_TOOLS,
    realisticTools: REALISTIC_TOOLS,
    realisticToolsFormat: 'MCP',
    placeholder: "search({ query: \"Lighthouse Retention Roadmap\" })",
    hint: "Start by searching for the page to get its ID.",
    validate: async (input, history) => {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const lower = input.trim().toLowerCase();

        // --- PHASE 1: JUDGMENT (Is the user done?) ---
        // If the user isn't calling a tool, they might be reporting success.
        // We use a heuristic: if it doesn't look like a function call `foo(...)` or json `{...}`
        const isToolCall = /[a-zA-Z0-9_]+\s*\(|{/.test(input);
        
        if (!isToolCall && input.length > 5) {
             // The player is talking to the user. Are they done?
             const judgeResponse = await ai.models.generateContent({
                model: 'gemini-2.0-flash-exp',
                contents: `You are the Game Master.
                The player (Agent) claims to be done or is responding to the user.
                
                Conversation History (Summary):
                ${history.map(m => `${m.role}: ${m.content}`).join('\n')}
                
                Player Input: "${input}"
                
                The Goal: 
                1. Update LHR-100, LHR-101, LHR-102 to "In Progress" and update their fields.
                2. LEAVE LHR-103 as "Blocked" (because of the hidden inline comment on the page).
                3. Comment on tickets.
                
                Did the agent actually perform these actions in the history? 
                
                - If they just found the page but didn't edit Jira: Fail.
                - If they moved LHR-103 to "In Progress": Fail (Violated Legal inline comment).
                - If they edited LHR-100/101/102 correctly and respected LHR-103 constraint: Pass.
                
                Return JSON: { "pass": boolean, "message": "Feedback for the player" }
                `
             });
             
             const text = judgeResponse.text.replace(/```json/g, '').replace(/```/g, '').trim();
             try {
                const result = JSON.parse(text);
                if (result.pass) {
                    return { status: 'SUCCESS', message: result.message };
                } else {
                    return { status: 'FAIL', message: result.message, failType: 'USER_COMPLAINT' };
                }
             } catch (e) {
                 return { status: 'FAIL', message: "The user is staring at you blankly. (System Error)", failType: 'USER_COMPLAINT' };
             }
        }

        // --- PHASE 2: SIMULATION (Run the Tool) ---
        // We ask Gemini to be the MCP Server.
        try {
            const simResponse = await ai.models.generateContent({
                model: 'gemini-2.0-flash-exp',
                contents: `You are the Atlassian Rovo MCP Server.
                
                THE MOCK STATE (The Truth):
                ${MOCK_STATE}
                
                INSTRUCTIONS:
                - The user is sending a tool call. They might use simplified JS Syntax "search({...})" OR strict JSON-RPC.
                - Parse the tool call: "${input}"
                - Execute it against the MOCK STATE.
                - Return the JSON result exactly as the tool would.
                
                BEHAVIOR:
                - If 'search', return fuzzy matches.
                - If 'getConfluencePage', return the markdown body.
                - If 'getConfluencePageInlineComments', return the critical "Irene (Legal)" comment.
                - If 'editJiraIssue' or 'transitionJiraIssue', pretend it succeeded and return { ok: true }.
                - If the tool doesn't exist or args are wrong, return a JSON error.
                
                OUTPUT:
                - ONLY the JSON output of the tool. No chat.
                `
            });
            
            let output = simResponse.text.replace(/```json/g, '').replace(/```/g, '').trim();
            
            // Clean up if Gemini adds extra text
            if (output.startsWith("Tool Output:")) output = output.replace("Tool Output:", "");

            return {
                status: 'INTERMEDIATE',
                message: "Tool Executed.",
                toolOutput: output
            };

        } catch (e) {
            return { 
                status: 'FAIL', 
                message: "MCP Connection Error: Server timeout.", 
                failType: 'TOOL_ERROR' 
            };
        }
    },
    successMessage: "Sync complete. You navigated the blind labyrinth, respected the hidden legal constraints, and updated the jagged records."
};