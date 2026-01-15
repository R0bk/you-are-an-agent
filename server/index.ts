import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

const app = express();
app.use(cors());
app.use(express.json());

// API key stays on server - never sent to client
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Limits to prevent abuse
const MAX_OUTPUT_TOKENS = 2000;
const MAX_INPUT_LENGTH = 10000; // ~2500 tokens

if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY not set. Gemini calls will fail.');
}

// Proxy endpoint for Gemini API calls
app.post('/api/gemini', async (req, res) => {
  if (!GEMINI_API_KEY) {
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

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: model || 'gemini-2.0-flash',
      contents,
      config: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error('Gemini API error:', error.message);
    res.status(500).json({ error: error.message || 'Gemini API call failed' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasApiKey: !!GEMINI_API_KEY });
});

const PORT = process.env.PORT || 3001;

// Only start server if run directly (not imported)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });
}

export default app;
