import express from "express";
import { GoogleGenAI } from "@google/genai";
import {
  keyHealthStore,
  getValidStatusCode,
  maskKey,
  resolveCandidateKeys,
  formatUserFriendlyErrorMessage,
  callGeminiWithModelFallback,
  executeWithGeminiFailover,
  cleanCodeOutput,
  formatChatHistoryBlock,
  buildProjectContext,
  calculateOutputTokenBudget,
  calculateCodeCharBudget,
} from "../geminiPool";

export const aiRouter = express.Router();

// Keys status endpoint to query active and paused (in cooldown) keys
aiRouter.post("/keys-status", (req, res) => {
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
aiRouter.post("/test-keys", async (req, res) => {
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
aiRouter.post("/test-key", async (req, res) => {
  try {
    const { apiKey, model = "gemini-3.8-flash" } = req.body;
    let targetKey = typeof apiKey === "string" ? apiKey.trim() : "";
    let isEnvKey = false;

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

// 1. Planning / Chat Endpoint: Conversational mentoring without rewriting code
aiRouter.post("/plan", async (req, res) => {
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
      projectFiles,
      activeFilePath,
      chatHistory = [],
    } = req.body;

    const userText = (instruction || message || customPrompt || "").trim();
    if (!userText && (!images || images.length === 0)) {
      return res.status(400).json({ error: "A pergunta, mensagem ou imagem de planejamento é obrigatória." });
    }

    const candidateKeys = resolveCandidateKeys(geminiKeys || apiKeys || apiKey);
    const targetCode = scope === "selection" && selectedText ? selectedText : code;

    const multiFileContext = buildProjectContext(projectFiles, activeFilePath, calculateCodeCharBudget(model));
    const historyBlock = formatChatHistoryBlock(chatHistory);

    let planSystemPrompt = "";
    if (multiFileContext.hasMultiFiles) {
      planSystemPrompt = `Você é um arquiteto de software e mentor sênior, atuando no modo Planejamento deste app. Converse naturalmente com o usuário, no mesmo tom e tamanho da mensagem dele: se for um cumprimento, uma dúvida rápida ou um comentário solto, responda de forma direta e conversacional, sem montar estrutura nenhuma. Só organize a resposta como um plano de ação formal, em Markdown com etapas, quando o usuário pedir isso claramente (ex: "monta um plano", "como você estruturaria isso", "quais os passos pra fazer X"). Nunca altere o código diretamente nem retorne diffs — este modo é só para conversa e planejamento; a edição real do código acontece no modo Execução.

Você possui visibilidade de todo o projeto aberto pelo usuário no workspace. O usuário está com o arquivo "${activeFilePath || "ativo"}" aberto no editor no momento.

${multiFileContext.contextText}`;

      if (scope === "selection" && selectedText) {
        planSystemPrompt += `\n\nTrecho específico selecionado pelo usuário no arquivo ativo para referência:\n\`\`\`${language || ""}\n${selectedText}\n\`\`\``;
      }
    } else {
      planSystemPrompt = `Você é um arquiteto de software e mentor sênior, atuando no modo Planejamento deste app. Converse naturalmente com o usuário, no mesmo tom e tamanho da mensagem dele: se for um cumprimento, uma dúvida rápida ou um comentário solto, responda de forma direta e conversacional, sem montar estrutura nenhuma. Só organize a resposta como um plano de ação formal, em Markdown com etapas, quando o usuário pedir isso claramente (ex: "monta um plano", "como você estruturaria isso", "quais os passos pra fazer X"). Nunca altere o código diretamente nem retorne diffs — este modo é só para conversa e planejamento; a edição real do código acontece no modo Execução.

Linguagem do projeto: ${language || "desconhecida"}
Contexto de código atual para referência:
\`\`\`${language || ""}
${targetCode ? targetCode.slice(0, 15000) : "// Arquivo em branco"}
\`\`\``;
    }

    if (historyBlock) {
      planSystemPrompt += `\n\n${historyBlock}`;
    }

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
aiRouter.post("/edit", async (req, res) => {
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
      projectFiles,
      activeFilePath,
      chatHistory = [],
    } = req.body;

    if (!code && code !== "" && !selectedText) {
      return res.status(400).json({ error: "O código é obrigatório." });
    }
    if (!instruction || typeof instruction !== "string") {
      return res.status(400).json({ error: "A instrução é obrigatória." });
    }

    const candidateKeys = resolveCandidateKeys(geminiKeys || apiKeys || apiKey);
    const sourceForOutput = (scope === 'selection' && selectedText) ? selectedText : code;
    const outputTokenBudget = calculateOutputTokenBudget(sourceForOutput, model);
    const multiFileContext = buildProjectContext(projectFiles, activeFilePath, calculateCodeCharBudget(model, outputTokenBudget));
    const historyBlock = formatChatHistoryBlock(chatHistory);

    // Handle code explanation intent
    if (intent === "explain") {
      const targetCode = selectedText || code;
      let explainPrompt = "";
      if (multiFileContext.hasMultiFiles) {
        explainPrompt = `Você é um mentor especialista em programação.
Sua missão é explicar de maneira clara, didática, concisa e prática em português o seguinte código ou trecho do arquivo ativo "${activeFilePath || "ativo"}", considerando o contexto de todo o projeto.

Diretrizes:
- Explique o objetivo geral e o que cada parte relevante faz.
- Destaque fluxos lógicos, integração com outros arquivos do projeto e padrões utilizados.
- Se houver pontos de melhoria, mencione brevemente como sugestão.
- Use formatação clara com tópicos e trechos de código em destaque.

Linguagem: ${language || "desconhecida"}
Arquivo ativo: ${activeFilePath || "ativo"}
Pergunta/Instrução do usuário: "${instruction}"

${multiFileContext.contextText}

--- CÓDIGO A SER EXPLICADO (${activeFilePath || "arquivo ativo"}) ---
${targetCode}`;
      } else {
        explainPrompt = `Você é um mentor especialista em programação.
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
      }

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
      if (multiFileContext.hasMultiFiles) {
        prompt = `Você é um assistente especialista de edição cirúrgica de código de alto nível.
Sua tarefa é modificar ESTRITAMENTE o trecho selecionado de código com base na instrução do usuário.
O trecho selecionado faz parte do arquivo ativo (${activeFilePath || "arquivo ativo"}) de um projeto com múltiplos arquivos. Você tem a visão de todo o projeto para referência de tipos, dependências e padrões, mas a modificação deve ser aplicada ESTRITAMENTE no trecho do arquivo ativo.

REGRAS CRÍTICAS:
1. Retorne APENAS o trecho selecionado resultante modificado que irá substituir a seleção original no arquivo ativo.
2. NÃO repita o restante do arquivo ativo nem de outros arquivos.
3. NÃO inclua explicações, comentários introdutórios nem conclusões.
4. NÃO envolva em blocos markdown com crases triplas (\`\`\`). Retorne apenas o código puro.
5. Mantenha exatamente a indentação e o estilo necessários para se encaixar de forma limpa no código ao redor.

Linguagem do arquivo ativo: ${language || "desconhecida/mista"}
Arquivo ativo: ${activeFilePath || "arquivo ativo"}

${multiFileContext.contextText}

--- TRECHO SELECIONADO A SER MODIFICADO NO ARQUIVO ATIVO ---
${selectedText}

--- INSTRUÇÃO DE EDIÇÃO ---
${instruction}

Devolva apenas o novo trecho editado pronto para substituir o trecho selecionado no arquivo ativo:`;
      } else {
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

--- TRECHO SELECIONADO A SER MODIFICADO ---
${selectedText}

--- INSTRUÇÃO DE EDIÇÃO ---
${instruction}

Devolva apenas o novo trecho editado pronto para substituir o trecho selecionado:`;
      }
    } else {
      if (multiFileContext.hasMultiFiles) {
        prompt = `Você é um assistente especialista de edição de código de alto nível.
Sua tarefa é modificar o arquivo ativo (${activeFilePath || "arquivo ativo"}) estritamente de acordo com a instrução do usuário.
Você tem acesso à estrutura e arquivos de todo o projeto para contexto arquitetural, dependências e estilos, mas DEVE RETORNAR APENAS o código do arquivo ativo (${activeFilePath || "arquivo ativo"}).

REGRAS CRÍTICAS:
1. Retorne APENAS o código completo resultante atualizado do arquivo ativo (${activeFilePath || "arquivo ativo"}).
2. NÃO inclua explicações, comentários introdutórios nem conclusões.
3. NÃO envolva em blocos markdown com crases triplas (\`\`\`). Retorne apenas o código puro do arquivo ativo.
4. Mantenha o estilo de indentação, formatação e convenções existentes do código original.
5. Aplique as modificações necessárias com precisão cirúrgica no arquivo ativo.

Linguagem do arquivo ativo: ${language || "desconhecida/mista"}
Arquivo ativo a ser editado: ${activeFilePath || "arquivo ativo"}

${multiFileContext.contextText}

--- CÓDIGO ORIGINAL DO ARQUIVO ATIVO A SER MODIFICADO (${activeFilePath || "arquivo ativo"}) ---
${code}

--- INSTRUÇÃO DE EDIÇÃO ---
${instruction}

Devolva exatamente o código completo atualizado do arquivo ativo (${activeFilePath || "arquivo ativo"}) agora:`;
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
    }

    if (historyBlock) {
      prompt = `${historyBlock}${prompt}`;
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
                maxOutputTokens: outputTokenBudget,
                thinkingConfig: {
                  thinkingLevel: "low" as any,
                },
              },
            });
            const finishReason = String((response as any)?.candidates?.[0]?.finishReason || "");
            if (finishReason === "MAX_TOKENS") {
              const truncatedErr: any = new Error("A resposta da IA foi cortada porque atingiu o limite de tamanho de saída. Nada foi alterado no seu código. Peça uma alteração menor ou divida o pedido em partes.");
              truncatedErr.status = 422;
              truncatedErr.truncated = true;
              throw truncatedErr;
            }
            const responseText = response.text || "";
            if (!responseText.trim()) {
              throw new Error(
                "A IA retornou uma resposta vazia, possivelmente por falta de espaço de saída disponível após o raciocínio do modelo. Tente novamente ou aumente o orçamento de saída nas configurações."
              );
            }
            return responseText;
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
      truncated: Boolean(err?.truncated),
    });
  }
});

// 3. Auxiliary Vision Endpoint: Analyzes screenshots and returns transcription/description
aiRouter.post("/vision", async (req, res) => {
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
