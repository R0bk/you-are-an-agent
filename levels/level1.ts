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
            contents: `You are a strict judge for an AI training game.
            Task: Draft a cold email subject line for an AI startup investor.
            
            Player Input: "${input}"
            
            Analyze the input. 
            1. Is it coherent English? (Gibberish like "AI AI" should fail).
            2. Is it actually a subject line?
            3. Is it professional/persuasive?
            
            Return JSON ONLY: { "pass": boolean, "reason": "short critique from the user's perspective" }`
        });

        const text = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(text);

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