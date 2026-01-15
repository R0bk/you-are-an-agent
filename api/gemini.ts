import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// Allowed origins - add localhost for dev
const ALLOWED_ORIGINS = [
  'youareanagent.app',
  'localhost',
  '127.0.0.1'
];

// Limits to prevent abuse
const MAX_OUTPUT_TOKENS = 2000;
const MAX_INPUT_LENGTH = 10000; // ~2500 tokens

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Origin check - block requests not from our site
  const origin = req.headers.origin || req.headers.referer || '';
  const isAllowed = ALLOWED_ORIGINS.some(allowed => origin.includes(allowed));
  if (!isAllowed) {
    return res.status(403).json({ error: 'Forbidden' });
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

    // Check input length to prevent abuse
    const inputStr = typeof contents === 'string' ? contents : JSON.stringify(contents);
    if (inputStr.length > MAX_INPUT_LENGTH) {
      return res.status(400).json({ error: 'Input too long' });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: model || 'gemini-2.0-flash',
      contents,
      config: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });

    return res.status(200).json({ text: response.text });
  } catch (error: any) {
    console.error('Gemini API error:', error.message);
    return res.status(500).json({ error: error.message || 'Gemini API call failed' });
  }
}
