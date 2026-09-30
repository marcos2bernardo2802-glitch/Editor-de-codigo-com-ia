import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { aiRouter } from "./server/routes/ai";
import { proxyRouter } from "./server/routes/proxy";
import { maskKey } from "./server/geminiPool";

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

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    envKeyMask: process.env.GEMINI_API_KEY ? maskKey(process.env.GEMINI_API_KEY) : null,
  });
});

// Modular Routers
app.use("/api/ai", aiRouter);
app.use("/api/proxy", proxyRouter);

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
