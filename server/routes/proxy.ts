import express from "express";
import { getValidStatusCode } from "../geminiPool";

export const proxyRouter = express.Router();

// Proxy endpoint for external endpoints (Colab/ngrok/vLLM) to bypass CORS & ngrok warning
proxyRouter.post("/", async (req, res) => {
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
