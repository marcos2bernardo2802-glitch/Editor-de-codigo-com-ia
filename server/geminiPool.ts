import { GoogleGenAI } from "@google/genai";

// In-memory key health state for automatic failover
export interface KeyHealth {
  cooldownUntil: number;
  lastError?: string;
  consecutive429: number;
}
export const keyHealthStore = new Map<string, KeyHealth>();

// Helper to ensure valid HTTP status codes for Express (avoids ERR_HTTP_INVALID_STATUS_CODE)
export function getValidStatusCode(status: any, fallback = 500): number {
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
export function maskKey(key: string): string {
  if (!key) return "Nenhuma";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "..." + trimmed.slice(-3);
  return trimmed.slice(0, 4) + "..." + trimmed.slice(-4);
}

// Resolve candidate keys from client request + fallback to server env
export function resolveCandidateKeys(clientKeys?: string[] | string): string[] {
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
export function formatUserFriendlyErrorMessage(err: any): string {
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
export async function withTimeout<T>(
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
export async function callGeminiWithModelFallback<T>(
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
export async function executeWithGeminiFailover<T>(
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

// Helper to clean code block markers if returned by LLM
export function cleanCodeOutput(rawText: string): string {
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

export interface ChatHistoryEntry {
  role: 'user' | 'assistant';
  mode?: 'plan' | 'execute';
  text: string;
}

export function formatChatHistoryBlock(chatHistory: any): string {
  if (!Array.isArray(chatHistory) || chatHistory.length === 0) return "";
  const recent = chatHistory.slice(-30);
  const lines = recent.map((item: ChatHistoryEntry) => {
    const modeLabel = item.mode === "execute" ? "[Execução]" : "[Planejamento]";
    const roleLabel = item.role === "user" ? "Usuário" : "Assistente";
    return `${modeLabel} ${roleLabel}: ${item.text || ""}`;
  });
  return `HISTÓRICO RECENTE DA CONVERSA (para contexto, não repita nem responda a essas mensagens antigas):\n${lines.join("\n")}\n\n`;
}

export interface IncomingProjectFile {
  path: string;
  language?: string;
  content: string;
}

/**
 * Builds multi-file project context for AI prompts.
 * Respects maxTotalChars limit while always including the active file in full.
 */
export function buildProjectContext(
  projectFiles: IncomingProjectFile[] | undefined,
  activeFilePath: string | undefined,
  maxTotalChars = 60000
): { hasMultiFiles: boolean; contextText: string } {
  if (!Array.isArray(projectFiles) || projectFiles.length <= 1) {
    return { hasMultiFiles: false, contextText: "" };
  }

  const activePathNorm = (activeFilePath || "").trim().toLowerCase();

  // 1. Árvore de arquivos do projeto
  const treeLines = projectFiles.map((f) => {
    const filePath = f.path || "sem-nome";
    const isThisActive =
      activePathNorm && filePath.trim().toLowerCase() === activePathNorm;
    return `- ${filePath}${isThisActive ? " (arquivo ativo, foco do usuário)" : ""}`;
  });

  const treeHeader = `ESTRUTURA DO PROJETO (${projectFiles.length} arquivos):\n${treeLines.join("\n")}`;

  // 2. Localiza o arquivo ativo para priorização total
  let activeIndex = projectFiles.findIndex(
    (f) => activePathNorm && (f.path || "").trim().toLowerCase() === activePathNorm
  );
  if (activeIndex === -1) {
    activeIndex = 0;
  }
  const activeFile = projectFiles[activeIndex];
  const activeFileLength = activeFile?.content ? activeFile.content.length : 0;
  let remainingBudget = Math.max(maxTotalChars - activeFileLength, 0);

  const includedFileBlocks: string[] = [];
  const omittedFiles: string[] = [];

  for (let i = 0; i < projectFiles.length; i++) {
    const file = projectFiles[i];
    const isThisActive = i === activeIndex;
    const filePath = file.path || `arquivo-${i + 1}`;
    const fileLang = file.language || "text";
    const fileContent = typeof file.content === "string" ? file.content : "";

    if (isThisActive) {
      // O arquivo ativo é sempre incluído por inteiro
      includedFileBlocks.push(
        `--- Arquivo: ${filePath} (ARQUIVO ATIVO, FOCO DO USUÁRIO) [${fileLang}] ---\n\`\`\`${fileLang}\n${fileContent}\n\`\`\``
      );
    } else {
      if (remainingBudget >= 200) {
        if (fileContent.length <= remainingBudget) {
          remainingBudget -= fileContent.length;
          includedFileBlocks.push(
            `--- Arquivo: ${filePath} [${fileLang}] ---\n\`\`\`${fileLang}\n${fileContent}\n\`\`\``
          );
        } else {
          // Trunca o arquivo para caber no orçamento restante
          const truncated = fileContent.slice(0, remainingBudget);
          remainingBudget = 0;
          includedFileBlocks.push(
            `--- Arquivo: ${filePath} [${fileLang}] (parcial, truncado por limite de tamanho) ---\n\`\`\`${fileLang}\n${truncated}\n... [restante do arquivo omitido por limite de tamanho]\n\`\`\``
          );
          omittedFiles.push(`${filePath} (parcialmente truncado)`);
        }
      } else {
        omittedFiles.push(filePath);
      }
    }
  }

  let warningSection = "";
  if (omittedFiles.length > 0) {
    warningSection = `\nAVISO: Os seguintes arquivos foram omitidos ou truncados por limite de contexto (${maxTotalChars} caracteres):\n${omittedFiles
      .map((name) => `• ${name}`)
      .join("\n")}\n`;
  }

  const contextText = `${treeHeader}\n\nCONTEÚDO DOS ARQUIVOS DO PROJETO:\n${includedFileBlocks.join("\n\n")}${warningSection ? `\n\n${warningSection}` : ""}`;

  return { hasMultiFiles: true, contextText };
}

export function getModelContextWindowTokens(model: string): number {
  const normalized = (model || "").toLowerCase();
  if (normalized.includes("flash-lite")) {
    return 250000;
  }
  if (normalized.includes("flash")) {
    return 1000000;
  }
  if (normalized.includes("pro")) {
    return 1000000;
  }
  return 500000;
}

export function getModelMaxOutputTokensCap(model: string): number {
  const normalized = (model || "").toLowerCase();
  if (normalized.includes("flash-lite")) {
    return 8192;
  }
  if (normalized.includes("flash")) {
    return 8192;
  }
  if (normalized.includes("pro")) {
    return 8192;
  }
  return 8192;
}

export function calculateOutputTokenBudget(sourceText: string, model: string): number {
  const estimatedTokens = Math.ceil((sourceText ? sourceText.length : 0) / 3);
  const withMargin = Math.ceil(estimatedTokens * 1.3);
  const cap = getModelMaxOutputTokensCap(model);
  return Math.max(Math.min(withMargin, cap), 1024);
}

export function calculateCodeCharBudget(model: string, reservedOutputTokens: number = 8000): number {
  const totalTokens = getModelContextWindowTokens(model);
  const remainingTokens = totalTokens - (reservedOutputTokens + 1000);
  const charBudget = remainingTokens * 3;
  return Math.max(charBudget, 20000);
}
