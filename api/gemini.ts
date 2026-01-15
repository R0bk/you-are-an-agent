import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { model, contents } = req.body;

    if (!contents) {
      return res.status(400).json({ error: 'Missing contents' });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: model || 'gemini-2.0-flash',
      contents,
    });

    return res.status(200).json({ text: response.text });
  } catch (error: any) {
    console.error('Gemini API error:', error.message);
    return res.status(500).json({ error: error.message || 'Gemini API call failed' });
  }
}
