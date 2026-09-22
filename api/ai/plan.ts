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
    const {
      instruction,
      message,
      code = '',
      selectedText,
      language = '',
      model = 'gemini-3.8-flash',
      images = [],
      apiKeys = [],
      geminiKeys = [],
      apiKey,
      projectFiles = [],
      activeFilePath,
    } = req.body || {};

    const userText = instruction || message;
    if (!userText || typeof userText !== 'string') {
      return res.status(400).json({ error: 'A mensagem do usuário é obrigatória.' });
    }

    const candidateKeys: string[] = [
      ...(Array.isArray(geminiKeys) ? geminiKeys : []),
      ...(Array.isArray(apiKeys) ? apiKeys : []),
      ...(apiKey ? [apiKey] : []),
      ...(process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : []),
    ]
      .map((k) => String(k || '').trim())
      .filter(Boolean);

    if (candidateKeys.length === 0) {
      return res.status(400).json({
        error: 'Nenhuma chave Gemini informada. Configure suas chaves em Configurações > Gemini.',
      });
    }

    const planSystemPrompt =
      'Você é um arquiteto de software e mentor sênior, atuando no modo Planejamento deste app. ' +
      'Converse naturalmente com o usuário, no mesmo tom e tamanho da mensagem dele: se for um cumprimento, uma dúvida rápida ou um comentário solto, ' +
      'responda de forma direta e conversacional. Só estruture a resposta como um plano formal quando o usuário solicitar explicitamente.';

    let context = '';
    if (Array.isArray(projectFiles) && projectFiles.length > 0) {
      context += `\nArquivos do projeto (${projectFiles.length}):\n` +
        projectFiles.map((f: any) => `--- ${f.path || f.name} ---\n${String(f.content || '').slice(0, 5000)}`).join('\n\n');
    }
    if (code) {
      context += `\nArquivo ativo (${activeFilePath || language}):\n\`\`\`${language}\n${String(code).slice(0, 8000)}\n\`\`\``;
    }
    if (selectedText) {
      context += `\nTrecho selecionado:\n\`\`\`${language}\n${String(selectedText)}\n\`\`\``;
    }

    const promptParts: any[] = [];
    if (Array.isArray(images)) {
      for (const img of images) {
        if (img?.base64) {
          promptParts.push({
            inlineData: {
              mimeType: img.mimeType || 'image/jpeg',
              data: img.base64,
            },
          });
        }
      }
    }

    promptParts.push({
      text: `${planSystemPrompt}\n\n${context}\n\nMensagem do Usuário (Planejamento):\n"${userText}"`,
    });

    let lastError: any = null;
    for (const key of candidateKeys) {
      try {
        const ai = new GoogleGenAI({
          apiKey: key,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: promptParts }],
          config: { temperature: 0.4 },
        });

        const reply = response.text || 'Sem resposta.';
        const keyMask = key.slice(0, 4) + '...' + key.slice(-4);
        return res.json({
          type: 'chat',
          text: reply,
          reply,
          model,
          usedKeyMask: keyMask,
        });
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        if (msg.includes('429') || msg.includes('quota') || msg.includes('503')) {
          continue;
        }
        break;
      }
    }

    throw lastError || new Error('Falha ao comunicar com a API Gemini.');
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erro interno no planejamento com Gemini.' });
  }
}
