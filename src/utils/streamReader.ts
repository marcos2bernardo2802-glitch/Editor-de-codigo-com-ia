/**
 * Utilitário robusto para leitura de streaming (NDJSON do Ollama e SSE compatível com OpenAI)
 * com suporte completo a modo de raciocínio (thinking), buffering de linhas parciais,
 * detecção de erros detalhados (status, content-type e primeiros 300 caracteres) e
 * preservação de respostas parciais caso o stream seja interrompido.
 */

export interface StreamProgressUpdate {
  content: string;
  thinking: string;
  isDone: boolean;
  interrupted?: boolean;
}

export interface StreamReadOptions {
  response: Response;
  signal?: AbortSignal;
  onProgress?: (progress: StreamProgressUpdate) => void;
}

export interface StreamReadResult {
  content: string;
  thinking: string;
  isDone: boolean;
  interrupted: boolean;
  warning?: string;
}

/**
 * Remove blocos de raciocínio (<think>...</think>) do texto de conteúdo final,
 * caso o modelo tenha emitido tags inline em vez de campos estruturados.
 */
export function separateInlineThinking(rawText: string): { content: string; inlineThinking: string } {
  if (!rawText.includes('<think>')) {
    return { content: rawText, inlineThinking: '' };
  }

  let content = rawText;
  let inlineThinking = '';

  const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/g;
  let match: RegExpExecArray | null;

  while ((match = thinkRegex.exec(rawText)) !== null) {
    if (match[1]) {
      inlineThinking += (inlineThinking ? '\n\n' : '') + match[1].trim();
    }
  }

  // Remove as tags <think>...</think> do conteúdo final
  content = content.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();

  return { content, inlineThinking };
}

/**
 * Limpa blocos markdown de código (```lang ... ```) deixando apenas o código puro.
 */
export function cleanCodeOutput(rawText: string): string {
  const { content } = separateInlineThinking(rawText);
  let cleaned = content.trim();

  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
  }

  return cleaned.trim();
}

/**
 * Lê o corpo da resposta em streaming (NDJSON ou SSE) utilizando getReader() e TextDecoder.
 * Lida de forma resiliente com pacotes divididos, linhas parciais e raciocínio.
 */
export async function readAiStream(options: StreamReadOptions): Promise<StreamReadResult> {
  const { response, signal, onProgress } = options;

  const contentType = response.headers.get('content-type') || '';
  const status = response.status;

  // Validação preliminar da resposta antes de tentar ler o stream
  if (!response.ok) {
    let errorSnippet = '';
    let parsedMessage = '';
    try {
      const rawText = await response.text();
      errorSnippet = rawText.slice(0, 500);
      try {
        const parsed = JSON.parse(rawText);
        const errDetail = parsed.error || parsed.detail || parsed.message;
        if (errDetail) {
          parsedMessage = typeof errDetail === 'object' ? JSON.stringify(errDetail) : String(errDetail);
        }
      } catch {}
    } catch {}

    const fullDetail = parsedMessage || errorSnippet;
    const isHtmlError =
      fullDetail.includes('página HTML') ||
      fullDetail.includes('<!doctype') ||
      fullDetail.includes('<html') ||
      fullDetail.includes('Cannot POST') ||
      fullDetail.includes('Cannot GET');

    const isModelNotFound =
      !isHtmlError &&
      /model.*not found|not found.*model|does not exist|code['"]?\s*:\s*['"]?model_not_found/i.test(fullDetail);

    if (isModelNotFound) {
      throw new Error(`MODEL_NOT_FOUND (HTTP ${status}): ${fullDetail || 'Modelo não encontrado no servidor.'}`);
    }

    if (status === 404) {
      throw new Error(`ENDPOINT_NOT_FOUND (HTTP 404): ${fullDetail || 'Endpoint não encontrado. Verifique se a URL do Colab/ngrok está correta.'}`);
    }

    if (parsedMessage) {
      throw new Error(`Erro do servidor (HTTP ${status}): ${parsedMessage}`);
    }

    throw new Error(
      `O servidor retornou status de erro HTTP ${status}.\n` +
      `Content-Type: ${contentType || 'desconhecido'}\n` +
      `Primeiros caracteres recebidos: ${errorSnippet || '(corpo vazio)'}`
    );
  }

  // Se o Content-Type for HTML (por exemplo tela de aviso do ngrok ou página de erro 200)
  if (
    contentType.includes('text/html') ||
    contentType.includes('application/xhtml+xml')
  ) {
    const rawHtml = await response.text();
    const snippet = rawHtml.slice(0, 300);

    let hint = 'Verifique a URL do endpoint configurado.';
    if (snippet.includes('ngrok') || snippet.includes('Visit Site')) {
      hint = 'O ngrok interceptou a conexão com a tela de aviso de navegador. O header "ngrok-skip-browser-warning": "1" é obrigatório.';
    }

    throw new Error(
      `O servidor retornou uma página HTML (HTTP ${status}) em vez de stream de dados/JSON.\n` +
      `Content-Type: ${contentType}\n` +
      `Início do conteúdo recebido:\n${snippet}\n\n${hint}`
    );
  }

  if (!response.body) {
    throw new Error('A resposta HTTP não possui um corpo legível (response.body é nulo).');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');

  if (signal) {
    if (signal.aborted) {
      try {
        reader.cancel();
      } catch {}
      const err = new Error('Requisição cancelada pelo usuário.');
      err.name = 'AbortError';
      throw err;
    }
    signal.addEventListener(
      'abort',
      () => {
        try {
          reader.cancel();
        } catch {}
      },
      { once: true }
    );
  }

  let buffer = '';
  let accumulatedContent = '';
  let accumulatedThinking = '';
  let isDone = false;

  try {
    while (true) {
      if (signal?.aborted) {
        throw new Error('Requisição cancelada pelo usuário.');
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      // Decodifica preservando bytes multi-byte incompletos
      buffer += decoder.decode(value, { stream: true });

      // Divide em linhas completas
      const lines = buffer.split('\n');
      // A última linha pode estar incompleta; preserva no buffer para a próxima iteração
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Formato SSE (Server-Sent Events) compatível com OpenAI: "data: ..."
        if (line.startsWith('data:')) {
          const dataPayload = line.slice(5).trim();
          if (dataPayload === '[DONE]') {
            isDone = true;
            continue;
          }

          try {
            const parsed = JSON.parse(dataPayload);
            const choice = parsed.choices?.[0];
            const delta = choice?.delta;

            if (delta) {
              // Raciocínio (thinking / reasoning_content)
              if (delta.thinking) {
                accumulatedThinking += delta.thinking;
              } else if (delta.reasoning_content) {
                accumulatedThinking += delta.reasoning_content;
              }

              // Conteúdo final
              if (delta.content) {
                accumulatedContent += delta.content;
              }
            } else if (parsed.message) {
              if (parsed.message.thinking) accumulatedThinking += parsed.message.thinking;
              if (parsed.message.content) accumulatedContent += parsed.message.content;
            }

            if (choice?.finish_reason || parsed.done === true) {
              isDone = true;
            }
          } catch {
            // Linha SSE não-JSON ou parcial; ignora
          }
        }
        // Formato NDJSON nativo do Ollama (/api/chat ou /api/generate) ou JSON empacotado por proxy
        else if (line.startsWith('{') && line.endsWith('}')) {
          try {
            const parsed = JSON.parse(line);

            if (parsed.done === true) {
              isDone = true;
            }

            // Se o proxy encapsulou o stream SSE dentro de { text: "data: ...\n\ndata: ..." }
            if (typeof parsed.text === 'string' && parsed.text.includes('data:')) {
              const innerLines = parsed.text.split('\n');
              for (const innerRaw of innerLines) {
                const inner = innerRaw.trim();
                if (inner.startsWith('data:')) {
                  const dataPayload = inner.slice(5).trim();
                  if (dataPayload === '[DONE]') {
                    isDone = true;
                    continue;
                  }
                  try {
                    const innerParsed = JSON.parse(dataPayload);
                    const delta = innerParsed.choices?.[0]?.delta;
                    if (delta) {
                      if (delta.thinking) accumulatedThinking += delta.thinking;
                      if (delta.reasoning_content) accumulatedThinking += delta.reasoning_content;
                      if (delta.content) accumulatedContent += delta.content;
                    }
                  } catch {}
                }
              }
            } else if (typeof parsed.text === 'string' && parsed.text.trim()) {
              accumulatedContent += parsed.text;
              isDone = true;
            }

            // Ollama /api/chat
            if (parsed.message) {
              if (parsed.message.thinking) {
                accumulatedThinking += parsed.message.thinking;
              }
              if (parsed.message.content) {
                accumulatedContent += parsed.message.content;
              }
            }
            // Ollama /api/generate
            else if (parsed.response !== undefined) {
              if (parsed.thinking) {
                accumulatedThinking += parsed.thinking;
              }
              accumulatedContent += parsed.response;
            }
            // Outros esquemas JSON compatíveis com delta
            else if (parsed.choices?.[0]?.delta) {
              const d = parsed.choices[0].delta;
              if (d.thinking) accumulatedThinking += d.thinking;
              if (d.reasoning_content) accumulatedThinking += d.reasoning_content;
              if (d.content) accumulatedContent += d.content;
            }
            // Resposta OpenAI não-streaming { choices: [{ message: { content: "..." } }] }
            else if (parsed.choices?.[0]?.message?.content) {
              accumulatedContent += parsed.choices[0].message.content;
              isDone = true;
            }
          } catch {
            // JSON parcial ou malformado na linha
          }
        }

        // Notifica progresso para atualização da UI
        if (onProgress) {
          const { content, inlineThinking } = separateInlineThinking(accumulatedContent);
          onProgress({
            content,
            thinking: accumulatedThinking + (inlineThinking ? '\n' + inlineThinking : ''),
            isDone,
          });
        }
      }
    }

    // Processa eventual resto que ficou no buffer final
    if (buffer.trim()) {
      const rest = buffer.trim();
      if (rest.startsWith('data:')) {
        const payload = rest.slice(5).trim();
        if (payload === '[DONE]') {
          isDone = true;
        } else {
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) accumulatedContent += delta.content;
            if (delta?.thinking) accumulatedThinking += delta.thinking;
            if (delta?.reasoning_content) accumulatedThinking += delta.reasoning_content;
            if (parsed.choices?.[0]?.finish_reason || parsed.done === true) isDone = true;
          } catch {}
        }
      } else if (rest.startsWith('{') && rest.endsWith('}')) {
        try {
          const parsed = JSON.parse(rest);
          if (parsed.done === true) isDone = true;
          if (parsed.message?.content) accumulatedContent += parsed.message.content;
          if (parsed.message?.thinking) accumulatedThinking += parsed.message.thinking;
          if (parsed.response) accumulatedContent += parsed.response;
          if (parsed.thinking) accumulatedThinking += parsed.thinking;
        } catch {}
      }
    }
  } catch (streamErr: any) {
    // Se o stream foi interrompido ou falhou mas já recebemos conteúdo
    if (signal?.aborted) {
      return {
        content: accumulatedContent,
        thinking: accumulatedThinking,
        isDone: false,
        interrupted: true,
        warning: 'Geração cancelada pelo usuário. O conteúdo parcial foi preservado.',
      };
    }

    // Se houve erro de rede após ter recebido dados parciais
    if (accumulatedContent.trim() || accumulatedThinking.trim()) {
      return {
        content: accumulatedContent,
        thinking: accumulatedThinking,
        isDone: false,
        interrupted: true,
        warning: `A conexão com o servidor foi interrompida durante o streaming (${streamErr.message || streamErr}). O conteúdo parcial recebido foi preservado.`,
      };
    }

    throw streamErr;
  }

  // Separa eventuais tags <think> inline que o modelo possa ter gerado dentro do content
  const { content: finalContent, inlineThinking } = separateInlineThinking(accumulatedContent);
  const totalThinking = (accumulatedThinking + (inlineThinking ? '\n' + inlineThinking : '')).trim();

  let warning: string | undefined;
  if (!isDone) {
    warning = 'Aviso: O stream foi finalizado sem a confirmação de conclusão ("done": true). A resposta parcial foi preservada.';
  }

  return {
    content: finalContent,
    thinking: totalThinking,
    isDone,
    interrupted: !isDone,
    warning,
  };
}
