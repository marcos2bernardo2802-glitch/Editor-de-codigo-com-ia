import { GoogleGenAI } from '@google/genai';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  mode?: 'plan' | 'execute';
  text: string;
}

export interface GeminiCallOptions {
  instruction: string;
  code?: string;
  language?: string;
  model?: string;
  keys: string[];
  mode: 'plan' | 'edit';
  projectFiles?: any[];
  activeFilePath?: string;
  selectedText?: string;
  images?: { base64: string; mimeType: string }[];
  signal?: AbortSignal;
  chatHistory?: ChatHistoryItem[];
}

export async function callGeminiClientDirect(options: GeminiCallOptions): Promise<{ text: string; model: string }> {
  const {
    instruction,
    code = '',
    language = '',
    model = 'gemini-3.8-flash',
    keys,
    mode,
    projectFiles = [],
    activeFilePath,
    selectedText,
    images = [],
    signal,
    chatHistory = [],
  } = options;

  if (signal?.aborted) {
    const err = new Error('Operação cancelada pelo usuário.');
    err.name = 'AbortError';
    throw err;
  }

  const validKeys = keys.map((k) => k.trim()).filter(Boolean);
  if (validKeys.length === 0) {
    throw new Error(
      'Nenhuma chave da API Gemini informada. Configure suas chaves em Configurações > Modelos & Chaves Gemini.'
    );
  }

  let systemPrompt = '';
  if (mode === 'plan') {
    systemPrompt =
      'Você é um arquiteto de software e mentor sênior, atuando no modo Planejamento deste app. ' +
      'Converse naturalmente com o usuário, no mesmo tom e tamanho da mensagem dele. Só organize a resposta como um plano de ação formal quando o usuário pedir explicitamente.';
  } else {
    systemPrompt =
      'Você é um assistente de IA especialista em programação. Gere apenas o código atualizado, de forma limpa e completa.';
  }

  let context = '';
  if (projectFiles.length > 0) {
    context += `\nArquivos do projeto (${projectFiles.length}):\n` +
      projectFiles.map((f) => `--- ${f.path || f.name} ---\n${f.content.slice(0, 5000)}`).join('\n\n');
  }
  if (code) {
    context += `\nArquivo ativo (${activeFilePath || language}):\n\`\`\`${language}\n${code.slice(0, 10000)}\n\`\`\``;
  }
  if (selectedText) {
    context += `\nTrecho selecionado:\n\`\`\`${language}\n${selectedText}\n\`\`\``;
  }

  let historyBlock = '';
  if (Array.isArray(chatHistory) && chatHistory.length > 0) {
    const formattedLines = chatHistory.map((item) => {
      const modeLabel = item.mode === 'execute' ? '[Execução]' : '[Planejamento]';
      const roleLabel = item.role === 'user' ? 'Usuário' : 'Assistente';
      return `${modeLabel} ${roleLabel}: ${item.text}`;
    });
    historyBlock = `\n\nHISTÓRICO RECENTE DA CONVERSA (para contexto, não repita nem responda a essas mensagens antigas):\n${formattedLines.join('\n')}\n`;
  }

  const promptParts: any[] = [];
  for (const img of images) {
    if (img.base64) {
      promptParts.push({
        inlineData: {
          mimeType: img.mimeType || 'image/jpeg',
          data: img.base64,
        },
      });
    }
  }

  promptParts.push({
    text: `${systemPrompt}${historyBlock}\n\n${context}\n\nMensagem do Usuário:\n"${instruction}"`,
  });

  let lastError: any = null;

  for (const key of validKeys) {
    if (signal?.aborted) {
      const err = new Error('Operação cancelada pelo usuário.');
      err.name = 'AbortError';
      throw err;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build-client',
          },
        },
      });

      const generatePromise = ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: promptParts }],
        config: {
          temperature: mode === 'plan' ? 0.4 : 0.2,
        },
      });

      let response: any;
      if (signal) {
        response = await Promise.race([
          generatePromise,
          new Promise((_, reject) => {
            if (signal.aborted) {
              const err = new Error('Operação cancelada pelo usuário.');
              err.name = 'AbortError';
              reject(err);
            } else {
              signal.addEventListener(
                'abort',
                () => {
                  const err = new Error('Operação cancelada pelo usuário.');
                  err.name = 'AbortError';
                  reject(err);
                },
                { once: true }
              );
            }
          }),
        ]);
      } else {
        response = await generatePromise;
      }

      const text = response.text || '';
      return { text, model };
    } catch (err: any) {
      if (err.name === 'AbortError' || signal?.aborted) {
        throw err;
      }
      lastError = err;
      const msg = String(err?.message || '');
      if (msg.includes('429') || msg.includes('quota') || msg.includes('503')) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Falha ao comunicar com a API Gemini.');
}

export interface KeyTestDirectResult {
  index: number;
  keyMask: string;
  valid: boolean;
  status: 'valid' | 'invalid' | 'quota';
  message: string;
}

export async function testGeminiKeysDirect(
  keys: string[],
  model: string = 'gemini-3.8-flash'
): Promise<KeyTestDirectResult[]> {
  const results: KeyTestDirectResult[] = [];
  for (let i = 0; i < keys.length; i++) {
    const rawKey = keys[i]?.trim();
    if (!rawKey) continue;
    const mask = rawKey.length > 8 ? `${rawKey.slice(0, 4)}...${rawKey.slice(-4)}` : '****';
    try {
      const ai = new GoogleGenAI({ apiKey: rawKey });
      await ai.models.generateContent({
        model,
        contents: 'ping',
        config: { maxOutputTokens: 2 },
      });
      results.push({
        index: i,
        keyMask: mask,
        valid: true,
        status: 'valid',
        message: 'Válida e pronta para uso',
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      const isQuota = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
      results.push({
        index: i,
        keyMask: mask,
        valid: false,
        status: isQuota ? 'quota' : 'invalid',
        message: isQuota ? 'Limite de cota excedido (429)' : msg.slice(0, 80) || 'Chave inválida',
      });
    }
  }
  return results;
}

