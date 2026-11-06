// 实时报价：GET /api/quotes?symbols=MU,NVDA
// Finnhub key 存在 Vercel 环境变量 FINNHUB_API_KEY，不进代码。
export default async function handler(req, res) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return res.status(503).json({ error: 'no_key' });

  const symbols = String(req.query.symbols || '')
    .split(',').map(s => s.trim().toUpperCase())
    .filter(s => /^[A-Z.]{1,6}$/.test(s)).slice(0, 40);
  if (!symbols.length) return res.status(400).json({ error: 'no_symbols' });

  const out = {};
  await Promise.all(symbols.map(async s => {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${key}`);
      if (!r.ok) return;
      const q = await r.json();
      if (q && q.c) out[s] = { c: q.c, pc: q.pc, dp: q.dp, t: q.t };
    } catch {}
  }));

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  res.status(200).json({ quotes: out, at: Date.now() });
}
