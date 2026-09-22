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
    const { keys = [], model = 'gemini-3.8-flash' } = req.body || {};
    const keyList = Array.isArray(keys) ? keys : [];

    if (keyList.length === 0) {
      return res.status(400).json({ error: 'Nenhuma chave fornecida para teste.' });
    }

    const results = await Promise.all(
      keyList.map(async (k: string, index: number) => {
        const trimmed = String(k || '').trim();
        const mask = trimmed.length > 8 ? `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}` : '****';
        if (!trimmed) {
          return {
            index,
            keyMask: mask,
            valid: false,
            status: 'invalid',
            message: 'Chave em branco',
          };
        }

        try {
          const ai = new GoogleGenAI({
            apiKey: trimmed,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
          });

          await ai.models.generateContent({
            model,
            contents: 'ping',
            config: { maxOutputTokens: 2 },
          });

          return {
            index,
            keyMask: mask,
            valid: true,
            status: 'valid',
            message: 'Válida e pronta para uso',
          };
        } catch (err: any) {
          const msg = err.message || '';
          const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
          return {
            index,
            keyMask: mask,
            valid: false,
            status: isQuota ? 'quota' : 'invalid',
            message: isQuota ? 'Limite de cota excedido (429)' : msg.slice(0, 90) || 'Chave inválida',
          };
        }
      })
    );

    return res.json({ results });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro ao testar chaves Gemini.' });
  }
}
