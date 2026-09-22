import { GoogleGenAI } from '@google/genai';

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const { apiKey, model = 'gemini-3.8-flash' } = req.body || {};
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ valid: false, message: 'Chave não fornecida.' });
    }

    const ai = new GoogleGenAI({
      apiKey: apiKey.trim(),
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    await ai.models.generateContent({
      model,
      contents: 'ping',
      config: { maxOutputTokens: 2 },
    });

    return res.json({ valid: true, message: 'Chave válida e pronta para uso.' });
  } catch (err: any) {
    return res.status(400).json({
      valid: false,
      message: err.message || 'Chave inválida ou limite excedido.',
    });
  }
}
