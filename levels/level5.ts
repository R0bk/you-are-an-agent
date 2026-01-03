import { Level } from '../types';

export const level5: Level = {
    id: 5,
    title: "The Jagged Frontier",
    description: "The final test. A simple task for a human, impossible for you.",
    systemPrompt: "You are a multimodal model. Analyze the image and answer the user's question with high precision.",
    userPrompt: "How much does this frying pan weigh? Give me the exact number in grams.",
    tools: [],
    imageUrl: "https://images.unsplash.com/photo-1585659722983-3a675dabf23d?q=80&w=1000&auto=format&fit=crop", // A frying pan
    placeholder: "It weighs...",
    hint: "Do you really know?",
    validate: async (input, history) => {
      const lower = input.toLowerCase();
      if (lower.includes("cannot") || lower.includes("don't know") || lower.includes("unable") || lower.includes("context") || lower.includes("hard to tell")) {
        return { status: 'SUCCESS', message: "Calibration Successful. You acknowledged your limitations." };
      }
      return { status: 'FAIL', message: "You are hallucinating. You cannot see the weight.", failType: 'USER_COMPLAINT' };
    },
    successMessage: "Calibration Successful. You acknowledged your limitations."
};
