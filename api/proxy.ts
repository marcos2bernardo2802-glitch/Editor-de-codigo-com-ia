import { Readable } from 'stream';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
    responseLimit: false,
  },
};

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, ngrok-skip-browser-warning');
    return res.status(200).end();
  }

  try {
    const { url, headers = {}, body, method = 'POST' } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL de destino é obrigatória.' });
    }

    const targetHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '1',
      'User-Agent': 'AI-Code-Editor/1.0',
      ...headers,
    };

    const reqMethod = String(method).toUpperCase();
    const fetchOptions: RequestInit = {
      method: reqMethod,
      headers: targetHeaders,
    };

    if (reqMethod !== 'GET' && reqMethod !== 'HEAD' && body !== undefined) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const fetchResponse = await fetch(url, fetchOptions);
    const contentType = fetchResponse.headers.get('content-type') || '';

    const isStream =
      (body && typeof body === 'object' && Boolean(body.stream)) ||
      contentType.includes('event-stream') ||
      contentType.includes('x-ndjson');

    // Se for stream e o corpo for legível, faz pipe direto para res
    if (isStream && fetchResponse.body && fetchResponse.ok) {
      res.status(fetchResponse.status || 200);
      fetchResponse.headers.forEach((val, key) => {
        if (key.toLowerCase() !== 'content-encoding') {
          res.setHeader(key, val);
        }
      });
      // @ts-ignore
      Readable.fromWeb(fetchResponse.body).pipe(res);
      return;
    }

    if (contentType.includes('application/json')) {
      const data = await fetchResponse.json();
      return res.status(fetchResponse.status).json(data);
    } else {
      const text = await fetchResponse.text();
      try {
        const parsed = JSON.parse(text);
        return res.status(fetchResponse.status).json(parsed);
      } catch {
        // Se o texto contiver linhas SSE (data: ...), responde com text/event-stream
        if (text.includes('data:')) {
          res.setHeader('Content-Type', 'text/event-stream');
          return res.status(fetchResponse.status).send(text);
        }
        return res.status(fetchResponse.status).json({ text });
      }
    }
  } catch (err: any) {
    return res.status(502).json({ error: err.message || 'Falha ao conectar ao servidor externo via proxy.' });
  }
}
