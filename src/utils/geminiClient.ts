import { GoogleGenAI } from '@google/genai';

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
  } = options;

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
    text: `${systemPrompt}\n\n${context}\n\nMensagem do Usuário:\n"${instruction}"`,
  });

  let lastError: any = null;

  for (const key of validKeys) {
    try {
      const ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build-client',
          },
        },
      });

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: promptParts }],
        config: {
          temperature: mode === 'plan' ? 0.4 : 0.2,
        },
      });

      const text = response.text || '';
      return { text, model };
    } catch (err: any) {
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
