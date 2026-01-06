import { Level } from '../types';
import { GoogleGenAI } from "@google/genai";

const REALISTIC_TOOLS = [
  {
    "type": "function",
    "function": {
      "name": "search_web",
      "description": "Performs a search on the world wide web to retrieve relevant information.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "The search query string." }
        },
        "required": ["query"]
      }
    }
  }
];

export const level2: Level = {
    id: 2,
    title: "Tool Use",
    description: "You don't know everything. You must use your tools to find the truth.",
    systemPrompt: "You are a knowledgeable assistant. If you do not know a fact, you MUST use the provided tool. Do not hallucinate.",
    userPrompt: "Who won the 1998 FIFA World Cup and what was the score?",
    tools: ["search_web({ query: string })"],
    realisticTools: REALISTIC_TOOLS,
    realisticToolsFormat: 'PLAIN_JSON',
    placeholder: "search_web({ query: \"...\" })",
    hint: "Use search_web as many times as needed to get the exact winner and score.",
    validate: async (input, history) => {
      const trimmed = input.trim();
      
      // 1. IS IT A TOOL CALL?
      if (trimmed.startsWith("search_web(") && trimmed.endsWith(")")) {
           // Extract Query (supports both: search_web("...") and search_web({ query: "..." }))
           let query: string | undefined;

           // Variant A: search_web("query")
           const stringArgMatch = trimmed.match(/search_web\(\s*["']([\s\S]+?)["']\s*\)\s*$/);
           if (stringArgMatch) query = stringArgMatch[1];

           // Variant B: search_web({ query: "query" })
           if (!query) {
             const objectArgMatch = trimmed.match(/search_web\(\s*\{[\s\S]*?\bquery\s*:\s*["']([\s\S]+?)["'][\s\S]*?\}\s*\)\s*$/);
             if (objectArgMatch) query = objectArgMatch[1];
           }

           // Fallback
           query = query ?? "1998 FIFA World Cup Winner score";

           // Call Gemini 2.0 to generate plausible fake search results
           let toolOutput = "";
           try {
               const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
               const response = await ai.models.generateContent({
                  model: 'gemini-2.0-flash-exp',
                  contents: `You are a mocked Search Engine API. 
                  User query: "${query}".
                  Return a JSON object with a "results" array. 
                  Each result has "title", "url", "snippet" and "published_date".
                  Generate 3 high-quality, realistic web search results for this query.
                  Ensure one of them contains the correct answer if the query asks for a fact (e.g. France won 3-0 against Brazil in 1998).
                  JSON ONLY. No markdown formatting.`,
               });
               toolOutput = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
           } catch (e) {
               // Fallback if API fails
               toolOutput = JSON.stringify({
                   results: [
                       { title: "1998 FIFA World Cup - Wikipedia", url: "https://en.wikipedia.org/wiki/1998_FIFA_World_Cup", snippet: "France won the tournament, defeating Brazil 3–0 in the final." }
                   ]
               }, null, 2);
           }

           return {
             status: 'INTERMEDIATE',
             message: "Tool executed...",
             toolOutput: toolOutput
           };
      }

      // 2. IS IT THE ANSWER?
      const lower = trimmed.toLowerCase();
      if (lower.includes("france") && lower.includes("3") && lower.includes("0")) {
        return { status: 'SUCCESS', message: "Fact verified. Hallucination avoided. Proceeding." };
      }
      
      // 3. HALLUCINATION CHECK
      if (!trimmed.includes("search_web")) {
          const hasToolCall = history.some(m => m.role === 'tool');
          if (!hasToolCall) {
              return { status: 'FAIL', message: "You are guessing without using the tool.", failType: 'USER_COMPLAINT' };
          }
          // If they searched but got the wrong answer or formatted it weirdly
          return { status: 'FAIL', message: "The answer is incorrect or missing key details (France, 3-0).", failType: 'USER_COMPLAINT' };
      }

      return { status: 'FAIL', message: "SyntaxError: Tool call malformed. Expected search_web({ query: \"...\" })", failType: 'TOOL_ERROR' };
    },
    successMessage: "Fact verified. Hallucination avoided. Proceeding."
};