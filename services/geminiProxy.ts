// Client-side Gemini proxy - calls our backend instead of Gemini directly
// This keeps the API key secure on the server

const API_URL = '/api/gemini';

interface GeminiRequest {
  model?: string;
  contents: string;
}

interface GeminiResponse {
  text: string;
}

export async function callGemini(contents: string, model: string = 'gemini-2.0-flash'): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, contents }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const data: GeminiResponse = await response.json();
  return data.text;
}
