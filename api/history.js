// 日线历史：GET /api/history?symbol=MU  → {s, src, d:[日期], o,h,l,c,v}
// 依次尝试 Yahoo Finance、Nasdaq、Stooq，任一成功即返回。CDN 缓存 3 小时。
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function yahoo(sym, host) {
  const r = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d&events=split`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) throw new Error('yahoo ' + r.status);
  const j = await r.json();
  const res = j.chart && j.chart.result && j.chart.result[0];
  const q = res && res.indicators.quote[0];
  if (!res || !res.timestamp || !q) throw new Error('yahoo empty');
  const out = { d: [], o: [], h: [], l: [], c: [], v: [] };
  const off = (res.meta && res.meta.gmtoffset) || -18000;
  res.timestamp.forEach((t, i) => {
    if (q.close[i] == null || q.open[i] == null) return;
    out.d.push(new Date((t + off) * 1000).toISOString().slice(0, 10));
    out.o.push(q.open[i]); out.h.push(q.high[i]); out.l.push(q.low[i]); out.c.push(q.close[i]); out.v.push(q.volume[i] || 0);
  });
  return out;
}

async function nasdaq(sym) {
  const from = new Date(Date.now() - 2 * 365 * 864e5).toISOString().slice(0, 10);
  for (const cls of ['stocks', 'etf']) {
    const r = await fetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/historical?assetclass=${cls}&fromdate=${from}&limit=9999`,
      { headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' } });
    if (!r.ok) continue;
    const j = await r.json();
    const rows = j && j.data && j.data.tradesTable && j.data.tradesTable.rows;
    if (!rows || !rows.length) continue;
    const n = s => Number(String(s).replace(/[$,]/g, ''));
    const out = { d: [], o: [], h: [], l: [], c: [], v: [] };
    rows.slice().reverse().forEach(x => {
      const [m, d, y] = x.date.split('/');
      out.d.push(`${y}-${m}-${d}`); out.o.push(n(x.open)); out.h.push(n(x.high)); out.l.push(n(x.low)); out.c.push(n(x.close)); out.v.push(n(x.volume));
    });
    return out;
  }
  throw new Error('nasdaq empty');
}

async function stooq(sym) {
  const r = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(sym.toLowerCase().replace('.', '-'))}.us&i=d`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('stooq ' + r.status);
  const lines = (await r.text()).trim().split('\n');
  if (!/^Date,Open/i.test(lines[0])) throw new Error('stooq format');
  const cut = new Date(Date.now() - 2 * 365 * 864e5).toISOString().slice(0, 10);
  const out = { d: [], o: [], h: [], l: [], c: [], v: [] };
  lines.slice(1).forEach(L => {
    const [d, o, h, l, c, v] = L.split(',');
    if (d < cut) return;
    out.d.push(d); out.o.push(+o); out.h.push(+h); out.l.push(+l); out.c.push(+c); out.v.push(+v || 0);
  });
  if (!out.d.length) throw new Error('stooq empty');
  return out;
}

export default async function handler(req, res) {
  const s = String(req.query.symbol || '').trim().toUpperCase();
  if (!/^[A-Z.\-]{1,8}$/.test(s)) return res.status(400).json({ error: 'bad_symbol' });
  const tries = [['Yahoo Finance', () => yahoo(s, 'query1.finance.yahoo.com')], ['Yahoo Finance', () => yahoo(s, 'query2.finance.yahoo.com')],
    ['Nasdaq', () => nasdaq(s)], ['Stooq', () => stooq(s)]];
  const errs = [];
  for (const [name, fn] of tries) {
    try {
      const out = await fn();
      if (out.d.length < 30) throw new Error('too short');
      res.setHeader('Cache-Control', 's-maxage=10800, stale-while-revalidate=86400');
      return res.status(200).json({ s, src: name, ...out });
    } catch (e) { errs.push(name + ': ' + e.message); }
  }
  res.setHeader('Cache-Control', 's-maxage=300');
  res.status(502).json({ error: 'all_sources_failed', detail: errs });
}
