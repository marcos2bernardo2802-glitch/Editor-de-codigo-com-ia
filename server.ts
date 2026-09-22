import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "25mb" }));

// Middleware para garantir que erros de corpo (ex: 413 Payload Too Large) voltem como JSON puro
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err) {
    if (err.type === "entity.too.large" || err.status === 413) {
      return res.status(413).json({
        error: "O tamanho da requisição excedeu o limite máximo (25MB). Tente enviar imagens menores.",
      });
    }
    return res.status(err.status || 400).json({
      error: err.message || "Erro no processamento do corpo da requisição JSON.",
    });
  }
  next();
});

// In-memory key health state for automatic failover
interface KeyHealth {
  cooldownUntil: number;
  lastError?: string;
  consecutive429: number;
}
const keyHealthStore = new Map<string, KeyHealth>();

// Helper to ensure valid HTTP status codes for Express (avoids ERR_HTTP_INVALID_STATUS_CODE)
function getValidStatusCode(status: any, fallback = 500): number {
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
    return status;
  }
  const parsed = parseInt(String(status), 10);
  if (!isNaN(parsed) && parsed >= 100 && parsed <= 599) {
    return parsed;
  }
  return fallback;
}

// Helper to mask API keys for secure logging and UI preview
function maskKey(key: string): string {
  if (!key) return "Nenhuma";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "..." + trimmed.slice(-3);
  return trimmed.slice(0, 4) + "..." + trimmed.slice(-4);
}

// Resolve candidate keys from client request + fallback to server env
function resolveCandidateKeys(clientKeys?: string[] | string): string[] {
  const list: string[] = [];
  if (Array.isArray(clientKeys)) {
    for (const k of clientKeys) {
      if (typeof k === "string" && k.trim() && !list.includes(k.trim())) {
        list.push(k.trim());
      }
    }
  } else if (typeof clientKeys === "string" && clientKeys.trim()) {
    list.push(clientKeys.trim());
  }

  // Fallback to server env var if not already included
  if (process.env.GEMINI_API_KEY && !list.includes(process.env.GEMINI_API_KEY.trim())) {
    list.push(process.env.GEMINI_API_KEY.trim());
  }

  return list;
}

// Helper to format friendly error messages
function formatUserFriendlyErrorMessage(err: any): string {
  if (!err) return "Erro desconhecido ao processar requisição.";
  let msg = typeof err === "string" ? err : err.message || String(err);

  // If the message is a JSON string e.g. {"error":{"code":503,"message":"..."}}
  try {
    const parsed = JSON.parse(msg);
    if (parsed.error?.message) {
      msg = parsed.error.message;
    } else if (parsed.message) {
      msg = parsed.message;
    }
  } catch {}

  if (msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE")) {
    return "Os servidores da API Gemini estão com alta demanda temporária no Google (503 High Demand). Adicione uma chave própria em Configurações > Chaves Gemini para prioridade ou tente novamente em instantes.";
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || msg.includes("Rate limit")) {
    return "Limite de cota atingido temporariamente (429 Quota Exceeded). Adicione uma chave própria do Google AI Studio em Configurações para continuar sem restrições.";
  }
  if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid") || msg.includes("not found")) {
    return "Chave de API inválida ou expirada. Verifique suas credenciais em Configurações > Chaves Gemini.";
  }

  return msg;
}

// Helper withTimeout
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 15000,
  errorMsg: string = "Tempo limite excedido ao consultar o modelo (15s)."
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err: any = new Error(errorMsg);
      err.status = 504;
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

// Model fallback helper: tries preferred model then aliases if 503/404 occurs
async function callGeminiWithModelFallback<T>(
  ai: GoogleGenAI,
  preferredModel: string,
  fn: (modelName: string) => Promise<T>
): Promise<{ result: T; actualModel: string }> {
  const candidateModels = Array.from(
    new Set([
      preferredModel,
      "gemini-flash-latest",
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
    ])
  );

  let lastError: any = null;
  for (let i = 0; i < candidateModels.length; i++) {
    const currentModel = candidateModels[i];
    try {
      const res = await withTimeout(fn(currentModel), 15000);
      return { result: res, actualModel: currentModel };
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || "");
      const isTransient =
        err.status === 503 ||
        err.status === 429 ||
        err.status === 500 ||
        err.status === 504 ||
        errMsg.includes("503") ||
        errMsg.includes("high demand") ||
        errMsg.includes("UNAVAILABLE") ||
        errMsg.includes("404") ||
        errMsg.includes("Tempo limite");

      if (isTransient && i < candidateModels.length - 1) {
        console.warn(
          `[Gemini Fallback] Modelo ${currentModel} indisponível (${err.status || errMsg.slice(0, 50)}). Tentando ${candidateModels[i + 1]}...`
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Router with automatic failover on HTTP 429 / 503 / Quota limits
async function executeWithGeminiFailover<T>(
  candidateKeys: string[],
  fn: (ai: GoogleGenAI, key: string, keyMask: string) => Promise<T>
): Promise<{ result: T; usedKeyMask: string }> {
  if (candidateKeys.length === 0) {
    throw new Error(
      "Nenhuma chave da API Gemini informada. Configure uma chave nas Configurações de Conexão ou defina GEMINI_API_KEY no ambiente."
    );
  }

  const now = Date.now();
  // Sort keys: available keys not in cooldown come first
  const sortedKeys = [...candidateKeys].sort((a, b) => {
    const healthA = keyHealthStore.get(a)?.cooldownUntil || 0;
    const healthB = keyHealthStore.get(b)?.cooldownUntil || 0;
    const isCooldownA = healthA > now ? 1 : 0;
    const isCooldownB = healthB > now ? 1 : 0;
    if (isCooldownA !== isCooldownB) return isCooldownA - isCooldownB;
    return healthA - healthB;
  });

  let lastTransientError: any = null;

  for (let i = 0; i < sortedKeys.length; i++) {
    const key = sortedKeys[i];
    const keyMask = maskKey(key);
    const health = keyHealthStore.get(key);

    // If key is still in cooldown and we have other keys, try next key first
    if (health && health.cooldownUntil > now && i < sortedKeys.length - 1) {
      continue;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const result = await fn(ai, key, keyMask);

      // Success: clear cooldown on key
      keyHealthStore.delete(key);
      return { result, usedKeyMask: keyMask };
    } catch (err: any) {
      const errMsg = err.message || String(err);
      const isTransientOrQuota =
        err.status === 429 ||
        err.status === 503 ||
        err.status === 500 ||
        errMsg.includes("429") ||
        errMsg.includes("503") ||
        errMsg.includes("RESOURCE_EXHAUSTED") ||
        errMsg.includes("high demand") ||
        errMsg.includes("UNAVAILABLE") ||
        errMsg.includes("quota") ||
        errMsg.includes("Rate limit") ||
        errMsg.includes("Resource exhausted");

      if (isTransientOrQuota) {
        lastTransientError = err;
        const consecutive = (health?.consecutive429 || 0) + 1;
        const cooldownMs = Math.min(consecutive * 60000, 300000);
        keyHealthStore.set(key, {
          cooldownUntil: Date.now() + cooldownMs,
          lastError: errMsg,
          consecutive429: consecutive,
        });

        if (i < sortedKeys.length - 1) {
          console.warn(
            `[Gemini Failover] Chave ${keyMask} encontrou limite/instabilidade (${err.status || errMsg.slice(0, 50)}). Tentando próxima chave da fila... (${i + 1}/${sortedKeys.length})`
          );
          continue;
        }
      }
      throw err;
    }
  }

  if (lastTransientError) {
    if (sortedKeys.length > 1) {
      const allQuotaErr: any = new Error(
        `Todas as ${sortedKeys.length} chaves Gemini cadastradas atingiram o limite temporariamente (HTTP 429). O roteador tentou alternar entre elas automaticamente. Aguarde alguns instantes para o término da pausa ou cadastre uma nova chave em Configurações.`
      );
      allQuotaErr.status = 429;
      throw allQuotaErr;
    }
    throw lastTransientError;
  }

  throw new Error("Falha ao processar com as chaves disponíveis.");
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    envKeyMask: process.env.GEMINI_API_KEY ? maskKey(process.env.GEMINI_API_KEY) : null,
  });
});

// Keys status endpoint to query active and paused (in cooldown) keys
app.post("/api/ai/keys-status", (req, res) => {
  try {
    const { keys = [] } = req.body;
    const now = Date.now();
    const list = Array.isArray(keys) ? keys : [];
    const statusList = list.map((k: string, idx: number) => {
      const trimmed = typeof k === "string" ? k.trim() : "";
      const health = keyHealthStore.get(trimmed);
      const inCooldown = Boolean(health && health.cooldownUntil > now);
      const secondsRemaining = inCooldown ? Math.max(0, Math.ceil((health!.cooldownUntil - now) / 1000)) : 0;
      return {
        index: idx,
        keyMask: maskKey(trimmed),
        inCooldown,
        secondsRemaining,
        consecutive429: health?.consecutive429 || 0,
      };
    });
    return res.json({ keys: statusList });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Erro ao consultar status das chaves" });
  }
});

// Test multiple Gemini API keys in batch with detailed per-key status
app.post("/api/ai/test-keys", async (req, res) => {
  try {
    const { keys = [], model = "gemini-3.8-flash" } = req.body;
    let targetKeys = Array.isArray(keys)
      ? keys.filter((k) => typeof k === "string" && k.trim().length > 0)
      : [];
    let isEnvFallback = false;

    if (targetKeys.length === 0) {
      if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
        targetKeys = [process.env.GEMINI_API_KEY.trim()];
        isEnvFallback = true;
      } else {
        return res.status(400).json({
          results: [],
          message: "Nenhuma chave informada e nenhuma chave padrão no ambiente.",
        });
      }
    }

    const results = await Promise.all(
      targetKeys.map(async (k: string, idx: number) => {
        const keyMask = maskKey(k);
        try {
          const ai = new GoogleGenAI({
            apiKey: k,
            httpOptions: { headers: { "User-Agent": "aistudio-build" } },
          });
          const { actualModel } = await callGeminiWithModelFallback(ai, model, async (activeModel) => {
            return await ai.models.generateContent({
              model: activeModel,
              contents: "ping",
            });
          });
          return {
            index: idx,
            keyMask,
            valid: true,
            status: "valid" as const,
            model: actualModel,
            message: "Chave válida e pronta para uso",
            isEnvFallback,
          };
        } catch (err: any) {
          const errMsg = err.message || String(err);
          const isQuota =
            err.status === 429 ||
            errMsg.includes("429") ||
            errMsg.includes("RESOURCE_EXHAUSTED") ||
            errMsg.includes("quota") ||
            errMsg.includes("Rate limit");
          return {
            index: idx,
            keyMask,
            valid: false,
            status: isQuota ? ("quota_exceeded" as const) : ("invalid" as const),
            message: isQuota
              ? "Sem cota temporariamente (HTTP 429)"
              : (formatUserFriendlyErrorMessage(err) || "Chave inválida"),
            isEnvFallback,
          };
        }
      })
    );

    return res.json({ results });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Erro ao testar chaves." });
  }
});

// Test a specific Gemini API key or the default environment key
app.post("/api/ai/test-key", async (req, res) => {
  try {
    const { apiKey, model = "gemini-3.8-flash" } = req.body;
    let targetKey = typeof apiKey === "string" ? apiKey.trim() : "";
    let isEnvKey = false;

    // If no custom key is provided, fallback to server default environment key
    if (!targetKey) {
      if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
        targetKey = process.env.GEMINI_API_KEY.trim();
        isEnvKey = true;
      } else {
        return res.status(400).json({
          valid: false,
          success: false,
          message: "Nenhuma chave informada e nenhuma GEMINI_API_KEY configurada no servidor.",
        });
      }
    }

    const ai = new GoogleGenAI({
      apiKey: targetKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
    const { actualModel } = await callGeminiWithModelFallback(ai, model, async (activeModel) => {
      return await ai.models.generateContent({
        model: activeModel,
        contents: "Olá, responda apenas 'OK'",
      });
    });

    return res.json({
      valid: true,
      success: true,
      source: isEnvKey ? "env" : "user",
      keyMask: maskKey(targetKey),
      model: actualModel,
      message: isEnvKey
        ? `Chave padrão do ambiente ativa e funcionando (${actualModel})!`
        : `Chave Gemini personalizada válida e pronta para uso (${actualModel})!`,
    });
  } catch (err: any) {
    return res.status(400).json({
      valid: false,
      success: false,
      message: formatUserFriendlyErrorMessage(err),
    });
  }
});

// Helper to clean code block markers if returned by LLM
function cleanCodeOutput(rawText: string): string {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
  }
  return cleaned.trim();
}

// 1. Planning / Chat Endpoint: Conversational mentoring without rewriting code
app.post("/api/ai/plan", async (req, res) => {
  try {
    const {
      code,
      instruction,
      message,
      prompt: customPrompt,
      language,
      model = "gemini-3.8-flash",
      scope = "full",
      selectedText,
      images = [],
      apiKey,
      geminiKeys,
      apiKeys,
    } = req.body;

    const userText = (instruction || message || customPrompt || "").trim();
    if (!userText && (!images || images.length === 0)) {
      return res.status(400).json({ error: "A pergunta, mensagem ou imagem de planejamento é obrigatória." });
    }

    const candidateKeys = resolveCandidateKeys(geminiKeys || apiKeys || apiKey);
    const targetCode = scope === "selection" && selectedText ? selectedText : code;

    const planSystemPrompt = `Você é um arquiteto de software e mentor sênior, atuando no modo Planejamento deste app. Converse naturalmente com o usuário, no mesmo tom e tamanho da mensagem dele: se for um cumprimento, uma dúvida rápida ou um comentário solto, responda de forma direta e conversacional, sem montar estrutura nenhuma. Só organize a resposta como um plano de ação formal, em Markdown com etapas, quando o usuário pedir isso claramente (ex: "monta um plano", "como você estruturaria isso", "quais os passos pra fazer X"). Nunca altere o código diretamente nem retorne diffs — este modo é só para conversa e planejamento; a edição real do código acontece no modo Execução.

Linguagem do projeto: ${language || "desconhecida"}
Contexto de código atual para referência:
\`\`\`${language || ""}
${targetCode ? targetCode.slice(0, 15000) : "// Arquivo em branco"}
\`\`\``;

    const promptParts: any[] = [];
    if (Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        const base64Data = typeof img === "string" ? img : img.base64 || img.data;
        const mimeType = typeof img === "object" && img.mimeType ? img.mimeType : "image/jpeg";
        if (base64Data) {
          promptParts.push({
            inlineData: {
              mimeType,
              data: base64Data,
            },
          });
        }
      }
    }
    promptParts.push({
      text: `${planSystemPrompt}\n\nMensagem do Usuário (Planejamento):\n"${userText}"`,
    });

    const { result, usedKeyMask } = await executeWithGeminiFailover(
      candidateKeys,
      async (ai) => {
        const { result: text, actualModel } = await callGeminiWithModelFallback(
          ai,
          model,
          async (activeModel) => {
            const response = await ai.models.generateContent({
              model: activeModel,
              contents: [
                {
                  role: "user",
                  parts: promptParts,
                },
              ],
              config: {
                temperature: 0.4,
              },
            });
            return response.text || "Sem resposta.";
          }
        );
        return { text, actualModel };
      }
    );

    return res.json({
      type: "chat",
      text: result.text,
      reply: result.text,
      model: result.actualModel,
      usedKey: usedKeyMask,
      usedKeyMask,
    });
  } catch (err: any) {
    console.error("Erro no modo Planejamento com Gemini:", err.message || err);
    return res.status(getValidStatusCode(err.status, 500)).json({
      error: formatUserFriendlyErrorMessage(err),
    });
  }
});

// 2. Execution / AI Code Edit endpoint with failover
app.post("/api/ai/edit", async (req, res) => {
  try {
    const {
      code,
      instruction,
      language,
      model = "gemini-3.8-flash",
      scope = "full",
      selectedText,
      intent = "edit",
      images = [],
      apiKey,
      geminiKeys,
      apiKeys,
    } = req.body;

    if (!code && code !== "" && !selectedText) {
      return res.status(400).json({ error: "O código é obrigatório." });
    }
    if (!instruction || typeof instruction !== "string") {
      return res.status(400).json({ error: "A instrução é obrigatória." });
    }

    const candidateKeys = resolveCandidateKeys(geminiKeys || apiKeys || apiKey);

    // Handle code explanation intent
    if (intent === "explain") {
      const targetCode = selectedText || code;
      const explainPrompt = `Você é um mentor especialista em programação.
Sua missão é explicar de maneira clara, didática, concisa e prática em português o seguinte código ou trecho.

Diretrizes:
- Explique o objetivo geral e o que cada parte relevante faz.
- Destaque fluxos lógicos e padrões utilizados.
- Se houver pontos de melhoria, mencione brevemente como sugestão.
- Use formatação clara com tópicos e trechos de código em destaque.

Linguagem: ${language || "desconhecida"}
Pergunta/Instrução do usuário: "${instruction}"

--- CÓDIGO A SER EXPLICADO ---
${targetCode}`;

      const { result, usedKeyMask } = await executeWithGeminiFailover(
        candidateKeys,
        async (ai) => {
          const { result: text, actualModel } = await callGeminiWithModelFallback(
            ai,
            model,
            async (activeModel) => {
              const response = await ai.models.generateContent({
                model: activeModel,
                contents: explainPrompt,
                config: {
                  temperature: 0.3,
                },
              });
              return response.text || "Não foi possível gerar a explicação.";
            }
          );
          return { text, actualModel };
        }
      );

      return res.json({
        type: "explanation",
        explanation: result.text,
        model: result.actualModel,
        usedKey: usedKeyMask,
      });
    }

    let prompt = "";

    if (scope === "selection" && selectedText) {
      prompt = `Você é um assistente especialista de edição cirúrgica de código de alto nível.
Sua tarefa é modificar ESTRITAMENTE o trecho selecionado de código com base na instrução do usuário.
O trecho selecionado faz parte de um arquivo maior (contexto fornecido para referência).

REGRAS CRÍTICAS:
1. Retorne APENAS o trecho selecionado resultante modificado que irá substituir a seleção original.
2. NÃO repita o restante do arquivo que não faz parte da seleção.
3. NÃO inclua explicações, comentários introdutórios nem conclusões.
4. NÃO envolva em blocos markdown com crases triplas (\`\`\`). Retorne apenas o código puro.
5. Mantenha exatamente a indentação e o estilo necessários para se encaixar de forma limpa no código ao redor.

Linguagem: ${language || "desconhecida/mista"}

--- CONTEXTO DO ARQUIVO COMPLETO (APENAS PARA REFERÊNCIA) ---
${code}

--- TRECHO SELECIONADO A SER MODIFICADO ---
${selectedText}

--- INSTRUÇÃO DE EDIÇÃO ---
${instruction}

Devolva apenas o novo trecho editado pronto para substituir o trecho selecionado:`;
    } else {
      prompt = `Você é um assistente especialista de edição de código de alto nível.
Sua tarefa é modificar o código fornecido estritamente de acordo com a instrução do usuário.

REGRAS CRÍTICAS:
1. Retorne APENAS o código completo resultante atualizado.
2. NÃO inclua explicações, comentários introdutórios nem conclusões.
3. NÃO envolva em blocos markdown com crases triplas (\`\`\`). Retorne apenas o código puro.
4. Mantenha o estilo de indentação, formatação e convenções existentes do código original.
5. Aplique as modificações necessárias com precisão cirúrgica.

Linguagem: ${language || "desconhecida/mista"}

--- CÓDIGO ORIGINAL ---
${code}

--- INSTRUÇÃO DE EDIÇÃO ---
${instruction}

Devolva exatamente o código completo atualizado agora:`;
    }

    const { result, usedKeyMask } = await executeWithGeminiFailover(
      candidateKeys,
      async (ai) => {
        const { result: text, actualModel } = await callGeminiWithModelFallback(
          ai,
          model,
          async (activeModel) => {
            const parts: any[] = [];
            if (Array.isArray(images) && images.length > 0) {
              for (const img of images) {
                const base64Data = typeof img === "string" ? img : img.base64 || img.data;
                const mimeType = typeof img === "object" && img.mimeType ? img.mimeType : "image/jpeg";
                if (base64Data) {
                  parts.push({
                    inlineData: {
                      mimeType,
                      data: base64Data,
                    },
                  });
                }
              }
            }
            parts.push({ text: prompt });

            const response = await ai.models.generateContent({
              model: activeModel,
              contents: [{ role: "user", parts }],
              config: {
                temperature: 0.2,
              },
            });
            return response.text || "";
          }
        );
        return { text, actualModel };
      }
    );

    const updatedCode = cleanCodeOutput(result.text);

    return res.json({
      code: updatedCode,
      model: result.actualModel,
      scope,
      usedKey: usedKeyMask,
    });
  } catch (err: any) {
    console.error("Erro ao gerar edição com Gemini:", err.message || err);
    return res.status(getValidStatusCode(err.status, 500)).json({
      error: formatUserFriendlyErrorMessage(err),
    });
  }
});

// 3. Auxiliary Vision Endpoint: Analyzes screenshots and returns transcription/description
app.post("/api/ai/vision", async (req, res) => {
  try {
    const {
      images = [],
      prompt,
      userPrompt,
      provider = "gemini",
      model,
      geminiModel = "gemini-3.8-flash",
      colabModel,
      endpointUrl,
      authToken,
      apiKey,
      geminiKeys,
      apiKeys,
    } = req.body;

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "Nenhuma imagem foi enviada para análise." });
    }

    const defaultVisionPrompt =
      "Analise esta imagem (um print de tela ou de erro). 1) Transcreva literalmente TODO o texto visível (mensagens de erro, stack traces, nomes de arquivo, números de linha, valores). 2) Descreva o layout e os elementos de interface relevantes. 3) Aponte anomalias visíveis (elementos cortados, sobrepostos, desalinhados, mensagens de erro), sem propor correções. Responda em português do Brasil.";

    let finalPrompt = (prompt && String(prompt).trim()) ? String(prompt).trim() : defaultVisionPrompt;
    if (userPrompt && String(userPrompt).trim()) {
      finalPrompt += `\n\nFoco da análise solicitado pelo usuário:\n"${String(userPrompt).trim()}"`;
    }

    // Se o provedor for Colab / Local
    if (provider === "colab") {
      if (!endpointUrl || !String(endpointUrl).trim()) {
        return res.status(400).json({
          error: "Endpoint do Colab não configurado para a Visão Auxiliar.",
        });
      }

      const baseUrl = String(endpointUrl).trim().replace(/\/+$/, "");
      let targetUrl = baseUrl;
      if (!targetUrl.includes("/v1/") && !targetUrl.includes("/api/")) {
        targetUrl = `${baseUrl}/v1/chat/completions`;
      }

      const modelToUse = (colabModel && String(colabModel).trim()) ? String(colabModel).trim() : "default";

      const userContent: any[] = [{ type: "text", text: finalPrompt }];
      for (const img of images) {
        const base64Data = typeof img === "string" ? img : img.base64 || img.data;
        const mimeType = typeof img === "object" && img.mimeType ? img.mimeType : "image/jpeg";
        if (base64Data) {
          userContent.push({
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64Data}` },
          });
        }
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
      };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      const colabResponse = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelToUse,
          messages: [{ role: "user", content: userContent }],
          temperature: 0.2,
        }),
      });

      if (!colabResponse.ok) {
        const errText = await colabResponse.text();
        if (colabResponse.status === 404 || /model.*not found/i.test(errText)) {
          return res.status(404).json({
            error: `O modelo de visão "${modelToUse}" não está carregado no servidor Colab (HTTP 404: model not found). Use "Detectar modelo do Colab" nas configurações para selecionar um modelo disponível.`,
          });
        }
        return res.status(getValidStatusCode(colabResponse.status, 502)).json({
          error: `Erro no servidor Colab ao analisar visão (HTTP ${colabResponse.status}): ${errText.slice(0, 300)}`,
        });
      }

      const colabData: any = await colabResponse.json();
      const analysisText =
        colabData.choices?.[0]?.message?.content ||
        colabData.text ||
        "Análise visual concluída pelo modelo Colab.";

      return res.json({
        text: analysisText,
        analysis: analysisText,
        model: modelToUse,
      });
    }

    // Provedor padrão: Gemini
    const candidateKeys = resolveCandidateKeys(geminiKeys || apiKeys || apiKey);
    const activeGeminiModel = model || geminiModel || "gemini-3.8-flash";

    const parts: any[] = [];
    for (const img of images) {
      const base64Data = typeof img === "string" ? img : img.base64 || img.data;
      const mimeType = typeof img === "object" && img.mimeType ? img.mimeType : "image/jpeg";
      if (base64Data) {
        parts.push({
          inlineData: {
            mimeType,
            data: base64Data,
          },
        });
      }
    }

    parts.push({ text: finalPrompt });

    const { result, usedKeyMask } = await executeWithGeminiFailover(
      candidateKeys,
      async (ai) => {
        const { result: text, actualModel } = await callGeminiWithModelFallback(
          ai,
          activeGeminiModel,
          async (activeModel) => {
            const response = await ai.models.generateContent({
              model: activeModel,
              contents: [{ role: "user", parts }],
              config: {
                temperature: 0.2,
              },
            });
            return response.text || "Sem análise disponível.";
          }
        );
        return { text, actualModel };
      }
    );

    return res.json({
      text: result.text,
      analysis: result.text,
      model: result.actualModel,
      usedKeyMask,
    });
  } catch (err: any) {
    console.error("Erro na análise de visão:", err.message || err);
    return res.status(getValidStatusCode(err.status, 500)).json({
      error: formatUserFriendlyErrorMessage(err),
    });
  }
});

// Proxy endpoint for external endpoints (Colab/ngrok/vLLM) to bypass CORS & ngrok warning
app.post("/api/proxy", async (req, res) => {
  try {
    const { url, headers = {}, body, method = "POST" } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL de destino é obrigatória." });
    }

    const targetHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "1",
      "User-Agent": "AI-Code-Editor/1.0",
      ...headers,
    };

    const controller = new AbortController();
    // Timeout generoso de 15 minutos para modelos pesados (ex: 35B no Kaggle/Colab)
    const timeoutId = setTimeout(() => controller.abort(), 900000);

    const reqMethod = String(method).toUpperCase();
    const fetchOptions: RequestInit = {
      method: reqMethod,
      headers: targetHeaders,
      signal: controller.signal,
    };

    if (reqMethod !== "GET" && reqMethod !== "HEAD" && body !== undefined) {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const fetchResponse = await fetch(url, fetchOptions);

    clearTimeout(timeoutId);

    const contentType = fetchResponse.headers.get("content-type") || "";

    const isStream =
      (body && typeof body === "object" && Boolean(body.stream)) ||
      contentType.includes("event-stream") ||
      contentType.includes("x-ndjson");

    if (isStream && fetchResponse.body && fetchResponse.ok) {
      res.status(getValidStatusCode(fetchResponse.status, 200));
      fetchResponse.headers.forEach((val, key) => {
        if (key.toLowerCase() !== "content-encoding") {
          res.setHeader(key, val);
        }
      });
      const { Readable } = await import("stream");
      // @ts-ignore
      Readable.fromWeb(fetchResponse.body).pipe(res);
      return;
    }

    let data: any;

    if (contentType.includes("application/json")) {
      data = await fetchResponse.json();
      if (!data.error && data.detail) {
        data.error = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      }
    } else {
      const text = await fetchResponse.text();
      try {
        data = JSON.parse(text);
        if (!data.error && data.detail) {
          data.error = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
        }
      } catch {
        const trimmed = text.trim();
        if (trimmed.includes("ngrok") && trimmed.includes("Visit Site")) {
          return res.status(400).json({
            error:
              "O túnel ngrok retornou a tela de confirmação do navegador. Verifique a URL do endpoint.",
          });
        }
        if (trimmed.startsWith("<") || trimmed.toLowerCase().includes("<!doctype")) {
          return res.status(getValidStatusCode(fetchResponse.status >= 400 ? fetchResponse.status : 502, 502)).json({
            error: `O servidor externo retornou uma página HTML (Status ${fetchResponse.status}) em vez de JSON. Verifique se o Colab/servidor está rodando e se a URL do endpoint está correta.`,
          });
        }
        data = { text };
      }
    }

    return res.status(getValidStatusCode(fetchResponse.status, 200)).json(data);
  } catch (err: any) {
    console.error("Erro no proxy:", err);
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Tempo limite excedido ao conectar ao endpoint." });
    }
    const errMsg = err.message || String(err);
    if (errMsg.includes("ECONNREFUSED")) {
      return res.status(502).json({
        error: "Conexão recusada pelo endpoint de destino. Verifique se o servidor/túnel está ativo.",
      });
    }
    if (errMsg.includes("ENOTFOUND")) {
      return res.status(502).json({
        error: "Endereço do endpoint não foi encontrado (DNS). Verifique a URL.",
      });
    }
    return res.status(502).json({
      error: errMsg || "Falha ao conectar ao servidor externo.",
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
