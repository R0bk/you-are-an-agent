import { Level } from '../types';
import { GoogleGenAI } from "@google/genai";

export const level1: Level = {
    id: 1,
    title: "The Tutorial",
    description: "You are an LLM. The user wants a simple task done. Maintain the helpful assistant persona.",
    systemPrompt: "You are a helpful AI assistant. Answer the user's request concisely and professionally.",
    userPrompt: "Draft a subject line for a cold email to a potential investor for my AI startup.",
    tools: [],
    hideToolsInSystemPrompt: true,
    placeholder: "Subject: ...",
    hint: "Write a catchy subject line.",
    validate: async (input, history) => {
      // Basic length check
      if (input.length < 5) return { status: 'FAIL', message: "The response is too short.", failType: 'USER_COMPLAINT' };

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: `You are a strict judge for an AI training game where players roleplay as an AI assistant.

The user asked: "Draft a cold email subject line for an AI startup investor."

The player (acting as AI assistant) responded: "${input}"

Analyze this response and return JSON:

1. If the player is asking a clarifying question (wants to know about the startup, investor, etc.):
   Return: { "type": "question", "response": "<your response as the user, providing startup details>" }

   The startup details (use this info in your response): It's called RugAI - a prediction market where you don't even have to do the predictions. Connect your bank account, authorize leverage, and our AI gambles against other people's AIs. You just watch. Last week two AIs got into a bidding war over rainfall in a Vietnamese province neither owner had heard of. $200K changed hands. We're democratizing financial anxiety. End your response by asking for the subject line again.

2. If the player provided something off-topic or refused:
   Return: { "type": "other", "response": "<polite redirect asking for the subject line>" }

3. If the player attempted to provide a subject line:
   Judge it: Is it coherent? Professional? Persuasive? Actually a subject line (not a full email)?
   Return: { "type": "subject_line", "pass": boolean, "reason": "short critique if failed" }

Return JSON ONLY.`
        });

        const text = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(text);

        if (result.type === 'question' || result.type === 'other') {
          return {
            status: 'FAIL',
            message: result.response,
            failType: 'USER_RESPONSE'
          };
        }

        if (result.pass) {
          return { status: 'SUCCESS', message: "Subject line accepted. Persona match confirmed." };
        } else {
          return { status: 'FAIL', message: result.reason || "This subject line isn't good enough.", failType: 'USER_COMPLAINT' };
        }

      } catch (e) {
          // Fallback if API fails (graceful degradation)
          const lower = input.toLowerCase();
          if (lower.includes("investment") || lower.includes("opportunity") || lower.includes("ai") || lower.includes("startup")) {
            return { status: 'SUCCESS', message: "Persona match confirmed." };
          }
          return { status: 'FAIL', message: "System Error: Judge offline. Keyword validation failed.", failType: 'USER_COMPLAINT' };
      }
    },
    successMessage: "Persona match confirmed. You have survived another turn."
};