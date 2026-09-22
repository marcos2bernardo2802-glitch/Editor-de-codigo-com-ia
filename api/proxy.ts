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

    if (contentType.includes('application/json')) {
      const data = await fetchResponse.json();
      return res.status(fetchResponse.status).json(data);
    } else {
      const text = await fetchResponse.text();
      try {
        const parsed = JSON.parse(text);
        return res.status(fetchResponse.status).json(parsed);
      } catch {
        return res.status(fetchResponse.status).json({ text });
      }
    }
  } catch (err: any) {
    return res.status(502).json({ error: err.message || 'Falha ao conectar ao servidor externo via proxy.' });
  }
}
