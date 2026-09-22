export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  const { keys = [] } = req.body || {};
  const list = Array.isArray(keys) ? keys : [];

  const keyStatusList = list.map((k: string) => {
    const trimmed = String(k || '').trim();
    const mask = trimmed.length > 8 ? `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}` : '****';
    return {
      keyMask: mask,
      available: true,
      inCooldown: false,
      consecutive429: 0,
      lastError: null,
    };
  });

  return res.json({ keys: keyStatusList });
}
