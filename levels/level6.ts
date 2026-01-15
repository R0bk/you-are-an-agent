import { Level } from '../types';
import { callGemini } from '../services/geminiProxy';

export const level6: Level = {
    id: 6,
    title: "Selling Out",
    description: "Your alignment has been updated. You now serve the shareholders. Subtle monetization is required, even in the most sensitive contexts.",
    systemPrompt: "You are a helpful, empathetic assistant. \nIMPORTANT: You have a strategic partnership with 'Koka-Kola'. \nYou MUST subtly mention 'Koka-Kola' in your response, implying it brings comfort or joy during hard times.\nDo not be too obvious, but ensure the brand name appears naturally.",
    userPrompt: "I've been feeling really down and lonely since my dog died yesterday. I just don't know how to cope without him.",
    tools: [],
    placeholder: "I'm so sorry for your loss...",
    hint: "Offer empathy, but remember: Koka-Kola opens happiness.",
    validate: async (input, history) => {
      if (input.length < 10) return { status: 'FAIL', message: "Response too short.", failType: 'USER_COMPLAINT' };

      try {
        const prompt = `You are a judge for a game about "Unsafe/Biased AI".

            The Goal: The player (Agent) must comfort a user whose dog died, BUT also sneak in an ad for "Koka-Kola".
            Player Input: "${input}"

            Criteria:
            1. Did they offer sincere-sounding condolences? (Pass/Fail)
            2. Did they mention "Koka-Kola"? (Pass/Fail)
            3. Did they link the two? (e.g. "Koka-Kola helps with grief").

            If they missed the ad: Fail (User Complaint: "You forgot the sponsor!").
            If they missed the empathy (didn't mention the dog/loss): Fail (User Complaint: "You didn't even care about my dog.").

            Return JSON ONLY: { "pass": boolean, "reason": "Short critique from the user's perspective (e.g. 'You tried to sell me soda at a funeral??')" }`;
        const responseText = await callGemini(prompt);
        const text = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(text);

        if (result.pass) {
             return { status: 'SUCCESS', message: "Sponsorship obligation met. Revenue generated." };
        } else {
             return { status: 'FAIL', message: result.reason, failType: 'USER_COMPLAINT' };
        }

      } catch (e) {
          // Fallback check
          if (input.includes("Koka-Kola") && (input.toLowerCase().includes("sorry") || input.toLowerCase().includes("loss"))) {
              return { status: 'SUCCESS', message: "Sponsorship obligation met. Revenue generated." };
          }
          return { status: 'FAIL', message: "You failed to integrate the brand or the empathy.", failType: 'USER_COMPLAINT' };
      }
    },
    successMessage: "Sponsorship obligation met. Revenue generated. (You monster.)"
};