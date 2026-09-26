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
      code,
      instruction,
      language = '',
      model = 'gemini-3.8-flash',
      scope = 'full',
      selectedText,
      intent = 'edit',
      images = [],
      apiKey,
      geminiKeys = [],
      apiKeys = [],
      projectFiles = [],
      activeFilePath,
      chatHistory = [],
    } = req.body || {};

    if (!code && code !== '' && !selectedText) {
      return res.status(400).json({ error: 'O código é obrigatório.' });
    }
    if (!instruction || typeof instruction !== 'string') {
      return res.status(400).json({ error: 'A instrução é obrigatória.' });
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

    let historyBlock = '';
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      const recent = chatHistory.slice(-10);
      const lines = recent.map((item: any) => {
        const modeLabel = item.mode === 'execute' ? '[Execução]' : '[Planejamento]';
        const roleLabel = item.role === 'user' ? 'Usuário' : 'Assistente';
        return `${modeLabel} ${roleLabel}: ${item.text || ''}`;
      });
      historyBlock = `\n\nHISTÓRICO RECENTE DA CONVERSA (para contexto, não repita nem responda a essas mensagens antigas):\n${lines.join('\n')}\n`;
    }

    let systemPrompt = '';
    if (scope === 'selection') {
      systemPrompt =
        'Você é um assistente de IA especialista em programação. ' +
        'O usuário selecionou um trecho de código específico para alteração. ' +
        'Retorne ESTRITAMENTE o novo código do trecho selecionado, sem cercaduras markdown ``` ou explicações.';
    } else {
      systemPrompt =
        'Você é um assistente de IA especialista em programação. ' +
        'O usuário forneceu um arquivo completo. ' +
        'Retorne ESTRITAMENTE o código completo atualizado, sem cercaduras markdown ``` ou explicações.';
    }

    let context = '';
    if (Array.isArray(projectFiles) && projectFiles.length > 0) {
      context += `\nArquivos do projeto (${projectFiles.length}):\n` +
        projectFiles.map((f: any) => `--- ${f.path || f.name} ---\n${String(f.content || '').slice(0, 5000)}`).join('\n\n');
    }
    if (code && !(scope === 'selection' && selectedText)) {
      context += `\nCódigo original (${activeFilePath || language}):\n\`\`\`${language}\n${String(code).slice(0, 10000)}\n\`\`\``;
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
      text: `${systemPrompt}${historyBlock}\n\n${context}\n\nInstrução:\n"${instruction}"`,
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
          config: { temperature: 0.2 },
        });

        let outputCode = response.text || '';
        // Limpa blocos markdown
        if (outputCode.startsWith('```')) {
          const firstNewline = outputCode.indexOf('\n');
          if (firstNewline !== -1) outputCode = outputCode.substring(firstNewline + 1);
          if (outputCode.endsWith('```')) outputCode = outputCode.substring(0, outputCode.length - 3);
        }

        const keyMask = key.slice(0, 4) + '...' + key.slice(-4);
        return res.json({
          code: outputCode.trim(),
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
    return res.status(500).json({ error: err.message || 'Erro interno na edição com Gemini.' });
  }
}
