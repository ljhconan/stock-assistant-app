/* 股票助手：读取加密的 data.enc.json，用密码在浏览器里解密后显示。
   数据由云端定时任务每天更新并推送到仓库，Vercel 自动重新部署。 */

/* ===== 每类股票该看什么（固定说明） ===== */
const TYPES = {
  growth:{name:'成长股',what:'看 PS（市销率）和营收增速',body:'利润还在快速变化，PE 会忽高忽低。PS = 市值 ÷ 过去 12 个月营收，意思是市场为公司每 1 美元营收付多少钱。',points:['营收增速高，可以容忍较高的 PS','增速一旦放缓，高 PS 的股票跌得最狠','利润已经稳定为正时，PE 也可以参考']},
  cyclical:{name:'周期股',what:'看利润率在历史什么位置',body:'存储芯片的价格和利润大起大落。利润在顶峰时 PE 最低，所以周期股 PE 看起来最便宜的时候，往往不是最安全的时候。',points:['看净利率和过去几年比，是在高位还是低位','PS 波动比 PE 小，更适合横向比较','行业价格（DRAM/NAND）掉头是关键信号']},
  loss:{name:'亏损或利润失真',what:'看 PS 和营收增速',body:'PE 为负数或高达几百倍时没有参考价值，常见原因是公司在大规模投入，或者有一次性的大额亏损。',points:['先看营收增长是否持续','再看亏损是一次性的还是经营性的','有营收数据时用 PS 比较']},
  value:{name:'稳定型',what:'看 PE 和股息率',body:'利润稳定，PE 有意义。拿它和自己过去几年比、和同行比，判断现在贵不贵。',points:['PE 明显高于自身历史常态 = 市场给了溢价','注意一次性收益会把 PE 压低','股息率提供下跌时的部分缓冲']},
  bank:{name:'银行股',what:'看市净率（PB）',body:'银行的资产大多是贷款和债券，账面价值比较接近真实价值，所以常用市净率 = 市值 ÷ 净资产。',points:['大银行 PB 多在 1–2 倍之间','配合 PE 和股息率一起看','经济衰退时坏账上升是主要风险']},
  income:{name:'收息股',what:'看股息率和能否持续',body:'买它主要为了分红。股息率 = 每年分红 ÷ 股价。股息率异常高，通常说明市场在担心风险。',points:['分红是否稳定、有没有被削减过','汇率和所在国宏观风险','PE、PB 很低不一定是便宜']},
  reit:{name:'REIT（房地产信托）',what:'看股息率',body:'REIT 必须把大部分利润分给股东。因为房产折旧很大，PE 会失真，专业上看 P/FFO（价格 ÷ 经营现金流），这里暂缺。',points:['股息率和历史比','租户是否分散、租约长短','利率上升对 REIT 不利']},
  etf:{name:'指数 ETF',what:'看整体 PE',body:'ETF 的 PE 是成分股按权重算出来的，反映整个市场的估值水平。',points:['和历史平均比，判断市场整体贵不贵','分散持有，单只股票风险小']},
  lev:{name:'杠杆 ETF',what:'看它追踪的指数',body:'每天追踪指数涨跌的两倍。来回震荡时会有损耗，长期收益不等于指数的两倍。',points:['估值看 QQQ','大跌日亏损翻倍','不适合当长期压箱底']}
};

/* ===== 工具 ===== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%';
const usd = v => '$' + Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const usd0 = v => (v < 0 ? '−' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
const cls = v => v >= 0 ? 'pos' : 'neg';
const chev = '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const store = { get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch {} }, del(k){ try { localStorage.removeItem(k); } catch {} } };

let D = null, ROWS = [], BY = {};

/* ===== 解密 ===== */
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function decrypt(pass){
  const r = await fetch('data.enc.json?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('fetch');
  const e = await r.json();
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name:'PBKDF2', salt: unb64(e.salt), iterations: e.iter, hash:'SHA-256' },
    base, { name:'AES-GCM', length:256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv: unb64(e.iv) }, key, unb64(e.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

let LIVE = null; // {at, quotes:{SYM:{c,pc}}}

function buildRows(){
  ROWS = D.holdings.map(r => {
    const q = LIVE && LIVE.quotes[r[0]];
    const close = q ? q.c : r[4], prev = q ? q.pc : r[5];
    return {t:r[0],name:r[1],qty:r[2],cost:r[3],close,prev,ah:r[6],acct:r[7],live:!!q,
      day:(close/prev-1)*100, pnl:(close/r[3]-1)*100, ahc:(r[6]/r[4]-1)*100};
  }).sort((a,b) => a.day - b.day);
  BY = Object.fromEntries(ROWS.map(x => [x.t, x]));
}
function totals(){
  if (!LIVE) return D.totals;
  let v = 0, p = 0, c = 0;
  ROWS.forEach(x => { v += x.qty * x.close; p += x.qty * x.prev; c += x.qty * x.cost; });
  return { label: D.totals.label, value: v, dayAbs: v - p, dayPct: (v / p - 1) * 100, vsCost: (v / c - 1) * 100 };
}
function stamp(){
  if (!LIVE) return D.asOfLabel;
  const t = new Date(LIVE.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
  return `实时价格 · 美东 ${t}（分析数据：${D.asOfLabel}）`;
}
async function refreshLive(){
  try {
    const syms = D.holdings.map(r => r[0]).join(',');
    const r = await fetch('/api/quotes?symbols=' + syms, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (!j.quotes || !Object.keys(j.quotes).length) return;
    LIVE = { at: j.at, quotes: j.quotes };
    buildRows(); $('#asof').textContent = stamp(); render();
  } catch {}
}

function load(data){
  D = data;
  buildRows();
  $('#asof').textContent = stamp();
  $('#lock').hidden = true; $('#app').hidden = false;
  render();
  refreshLive();
  setInterval(() => { if (!document.hidden) refreshLive(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLive(); });
}

/* ===== 页面 ===== */
function rowBtn(x){
  return `<button class="row-btn" data-open="${x.t}">
    <div class="row-main"><div class="tk">${x.t}<span class="nm">${esc(x.name)}</span></div>
    <div class="sub num">较成本 ${pct(x.pnl)}${x.live ? '' : ' · 盘后 ' + pct(x.ahc)}</div></div>
    <div class="chg num ${cls(x.day)}">${pct(x.day)}</div>${chev}</button>`;
}

let quietOpen = false;
function today(){
  const big = ROWS.filter(x => x.day <= -10), mid = ROWS.filter(x => x.day > -10 && x.day <= -5), quiet = ROWS.filter(x => x.day > -5);
  const up = ROWS.filter(x => x.day >= 5);
  const T = totals(), b = D.banner;
  const nextEarn = Object.entries(D.earnNext || {}).slice(0, 4);
  return `
  ${b ? `<div class="banner"><b>${esc(b.title)}</b><p>${esc(b.text)} <a href="#market">看市场页</a></p></div>` : ''}
  <div class="hero">
    <div><div class="lbl">${esc(T.label)}</div><div class="big num">${usd0(T.value)}</div></div>
    <div class="row"><div><div class="lbl">今日</div><div class="neg num" style="color:${T.dayAbs>=0?'var(--up)':''}">${usd0(T.dayAbs)} (${pct(T.dayPct)})</div></div>
    <div><div class="lbl">较总成本</div><div class="neg num" style="color:${T.vsCost>=0?'var(--up)':''}">${pct(T.vsCost)}</div></div></div>
  </div>
  ${up.length ? `<div class="sec" style="color:var(--up)">大涨 5% 以上 · ${up.length} 只</div>${up.sort((a,b)=>b.day-a.day).map(rowBtn).join('')}` : ''}
  ${big.length ? `<div class="sec down">大跌 10% 以上 · ${big.length} 只</div>${big.map(rowBtn).join('')}` : ''}
  ${mid.length ? `<div class="sec warn">下跌 5–10% · ${mid.length} 只</div>${mid.map(rowBtn).join('')}` : ''}
  ${nextEarn.length ? `<div class="sec mute">接下来的持仓财报</div>
  <div class="card list">${nextEarn.map(([t, w]) => `<div class="li"><b>${esc(t)}</b><span class="sub" style="margin-left:auto">${esc(w)}</span></div>`).join('')}</div>` : ''}
  <button class="link-btn" id="quiet-toggle" aria-expanded="${quietOpen}"><span>其余 ${quiet.filter(x=>x.day<5).length} 只涨跌在 5% 以内</span><span>${quietOpen?'收起':'展开'}</span></button>
  <div class="card grid3" ${quietOpen?'':'hidden'}>${quiet.filter(x=>x.day<5).map(x => `<button class="mini" data-open="${x.t}"><b>${x.t}</b><span class="num ${cls(x.day)}">${pct(x.day)}</span></button>`).join('')}</div>`;
}

let period = 2;
function market(){
  const S = D.sectors, i = period + 3;
  const avg = g => { const a = S.filter(s => s[2] === g); return a.reduce((t, s) => t + s[i], 0) / a.length; };
  const off = avg('off'), def = avg('def'), spread = off - def;
  const verdict = spread <= -3 ? '偏防御' : spread >= 3 ? '偏进攻' : '均衡';
  const why = spread <= -3 ? '防御板块明显跑赢进攻板块，资金在找避风港。' : spread >= 3 ? '进攻板块明显跑赢，市场愿意承担风险。' : '两类板块差距不大，没有明显方向。';
  const rows = [...S].sort((a, b) => b[i] - a[i]);
  const max = Math.max(...S.map(s => Math.abs(s[i])), 1);
  const plabel = ['今日','近一周','近一月'][period];
  return `
  <div class="style-card">
    <div class="eyebrow">市场风格 · ${plabel}</div>
    <div class="verdict">${verdict}<small>${why}</small></div>
    <div class="meter num">
      <div><span>进攻板块平均</span><b class="${cls(off)}">${pct(off)}</b></div>
      <div><span>防御板块平均</span><b class="${cls(def)}">${pct(def)}</b></div>
      <div><span>标普 500</span><b class="${cls(D.spyRet[period])}">${pct(D.spyRet[period])}</b></div>
    </div>
  </div>
  <div class="seg" role="group" aria-label="时间范围">${['今日','近一周','近一月'].map((l, k) => `<button data-period="${k}" aria-pressed="${k===period}">${l}</button>`).join('')}</div>
  <div class="card" style="padding:4px 14px">
    ${rows.map(s => { const v = s[i], w = Math.abs(v) / max * 50;
      return `<div class="bar-row"><div class="lbl"><b>${esc(s[1])}</b><span class="num">${s[0]} · <span class="${s[2]==='off'?'tag-off':'tag-def'}">${s[2]==='off'?'进攻':'防御'}</span></span></div>
      <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="${v>=0?`left:50%;width:${w}%;background:var(--up)`:`right:50%;width:${w}%;background:var(--down)`}"></div></div>
      <div class="bar-val num ${cls(v)}">${pct(v)}</div></div>`; }).join('')}
  </div>
  <p class="note">进攻板块：科技、可选消费、通信、金融、工业、能源、原材料。防御板块：医疗、必需消费、公用事业、房地产，经济不好时人们照样要看病、买日用品、交电费。数据：Robinhood 板块 ETF 收盘价。</p>
  <div class="sec mute">市场要闻</div>
  <div class="card" style="padding:0 14px">${D.news.map(n => `<div class="news"><span class="eyebrow">${esc(n[0])}</span><b>${esc(n[1])}</b><p>${esc(n[2])}</p></div>`).join('')}</div>
  ${D.newsSource ? `<p class="foot">来源：<a href="${esc(D.newsSource.url)}" target="_blank" rel="noopener">${esc(D.newsSource.label)}</a></p>` : ''}
  <div class="sec mute">经济日历</div>
  <div class="card" style="padding:0 14px">${D.cal.map((c, k) => `<div class="cal${k===0?' next':''}"><div class="d num">${esc(c[0])}<span>${esc(c[1])}</span></div><div><b>${esc(c[2])}</b><p>${esc(c[3])}</p></div></div>`).join('')}</div>
  <p class="foot">日期来自公开经济日历，官方可能调整，以劳工统计局和美联储公布为准。</p>`;
}

/* 观察清单：新格式是对象 {s,n,p,pc,hi,lo,tag,lists}，旧格式是数组 */
function watchRows(){
  return (D.watch || []).map(w => Array.isArray(w)
    ? {s:w[0], n:'', p:w[1], pc:null, hi:w[2], lo:w[3], tag:w[4], lists:[D.watchSource]}
    : w);
}
let watchSort = 'list';
function watch(){
  const W = watchRows(), why = D.watchWhy || {};
  const names = D.watchLists || [D.watchSource];
  const day = w => w.pc ? (w.p / w.pc - 1) * 100 : null;
  const row = w => { const p = Math.max(0, Math.min(1, (w.p-w.lo)/((w.hi-w.lo)||1))); const d = day(w); const low = String(w.tag||'').startsWith('低于');
    return `<button class="card wrow" data-open="w:${esc(w.s)}" style="padding:12px 14px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:center;gap:8px;width:100%"><span class="tk">${esc(w.s)}</span><span class="nm" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.n)}</span>
      ${why[w.s] ? '<span class="pill p-held">有解读</span>' : ''}${d!==null?`<span class="num ${cls(d)}" style="font-weight:600">${pct(d)}</span>`:''}<span class="num" style="font-weight:600">${usd(w.p)}</span></div>
      ${w.tag?`<div><span class="pill ${low?'p-down':'p-watch'}">${esc(w.tag)}</span></div>`:''}
      <div class="range" style="width:100%"><i style="left:calc(${(p*100).toFixed(0)}% - 2px)"></i></div>
      <div class="rng-lbl num" style="width:100%"><span>低 ${usd(w.lo)}</span><span>距高点 ${pct((w.p/w.hi-1)*100)}</span><span>高 ${usd(w.hi)}</span></div></button>`; };
  let body;
  if (watchSort === 'list') {
    body = names.map(n => { const g = W.filter(w => (w.lists||[]).includes(n)); return g.length ? `<div class="sec mute">${esc(n)} · ${g.length} 只</div>${g.map(row).join('')}` : ''; }).join('');
  } else {
    const k = watchSort === 'day' ? (w => day(w) ?? 0) : (w => w.p / w.hi - 1);
    body = [...W].sort((a, b) => k(a) - k(b)).map(row).join('');
  }
  return `<p class="note">你在 Robinhood 自建的清单（${names.map(esc).join('、')}）里、没有持有的股票。条形是 52 周价格区间，左低右高。点开看当天涨跌的原因（大涨大跌的才有）。</p>
  <div class="seg" role="group" aria-label="排序">${[['list','按清单'],['day','今日跌幅'],['hi','离高点最远']].map(([k,l]) => `<button data-wsort="${k}" aria-pressed="${k===watchSort}">${l}</button>`).join('')}</div>
  ${body}`;
}

const VERDICT = {cheap:['看起来是真便宜','v-cheap'], mixed:['一半一半，要看后面','v-mixed'], trap:['更像是公司变差了','v-trap']};
function radar(){
  const I = D.radarInfo || {};
  return `<p class="note">来自你的 Robinhood 扫描器"捡漏雷达"（RSI 低于 40）。只列市值 500 亿美元以上、你没持有的，按超卖程度排。RSI 低于 30 算深度超卖。点开看为什么跌、是真便宜还是公司变差。</p>
  <div class="card list">${D.radar.map(r => { const deep = r[4] < 30, v = I[r[0]] && VERDICT[I[r[0]].verdict];
    return `<button class="li wrow" data-open="r:${esc(r[0])}" style="padding-left:0;padding-right:0"><div class="row-main"><div><b>${esc(r[0])}</b><span class="nm">${esc(r[1])}</span></div><div class="sub num">${usd(r[2])} · 市值 ${r[3]>=1000?'$'+(r[3]/1000).toFixed(1)+'T':'$'+r[3]+'B'}</div>${v?`<div style="margin-top:4px"><span class="pill ${v[1]==='v-cheap'?'p-up':v[1]==='v-trap'?'p-down':'p-watch'}">${v[0]}</span></div>`:''}</div><span class="rsi num" style="color:var(--${deep?'down':'warn'});background:var(--${deep?'down':'warn'}-soft)">RSI ${Number(r[4]).toFixed(0)}</span>${chev}</button>`; }).join('')}</div>`;
}

function earnings(){
  return `<p class="note">持仓和观察清单未来两周的财报（Robinhood 财报日历）。</p>` +
  D.earnings.map(g => `<div class="sec mute">${esc(g[0])}</div><div class="card list">${g[1].map(e => `<div class="li"><b>${esc(e[0])}</b><span class="pill ${e[2]==='held'?'p-held':'p-watch'}">${e[2]==='held'?'持仓':'观察'}</span><span class="sub" style="margin-left:auto">${esc(e[1])}</span></div>`).join('')}</div>`).join('');
}

/* ===== 详情页 ===== */
function srcs(list){
  if (!list || !list.length) return '';
  return `<div class="src-list">来源：${list.map(x => Array.isArray(x) ? `<a href="${esc(x[1])}" target="_blank" rel="noopener">${esc(x[0])}</a>` : esc(x)).join('')}</div>`;
}
function whyBox(w, day, title){
  if (!w) return '';
  return `<div class="explain why ${day>=0?'up':'down'}"><h3>${title || (day>=0?'今天为什么涨':'今天为什么跌')}</h3><p>${esc(w.text)}</p>${srcs(w.src)}</div>`;
}
function sheetHead(sym, sub, right){
  return `<div class="sheet-head">
      <button class="back" id="close" aria-label="返回"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
      <div style="min-width:0"><div class="tk" id="sheet-title">${esc(sym)}</div><div class="sub">${esc(sub)}</div></div>
      ${right}
    </div>`;
}
function watchDetail(t){
  const w = watchRows().find(x => x.s === t); if (!w) return '';
  const d = w.pc ? (w.p / w.pc - 1) * 100 : null, why = (D.watchWhy || {})[t];
  return `<div class="in">${sheetHead(t, w.n + ' · ' + (w.lists||[]).join('、'), d!==null?`<div class="chg num ${cls(d)}" style="margin-left:auto">今日 ${pct(d)}</div>`:'')}
    <div class="stack">
      <div class="card kv num">
        <div><span>收盘</span><b>${usd(w.p)}</b></div>
        <div><span>前一日收盘</span><b>${w.pc?usd(w.pc):'暂无'}</b></div>
        <div><span>52 周高</span><b>${usd(w.hi)}</b></div>
        <div><span>52 周低</span><b>${usd(w.lo)}</b></div>
        <div><span>距高点</span><b class="neg">${pct((w.p/w.hi-1)*100)}</b></div>
        <div><span>距低点</span><b class="pos">${pct((w.p/w.lo-1)*100)}</b></div>
      </div>
      ${why ? whyBox(why, d ?? 0) : `<div class="explain"><p>今天涨跌在 5% 以内，没有单独查新闻。</p></div>`}
      <p class="foot">价格：Robinhood。解读根据当天新闻整理，不是买卖建议。</p>
    </div></div>`;
}
function radarDetail(t){
  const r = D.radar.find(x => x[0] === t); if (!r) return '';
  const I = (D.radarInfo || {})[t] || {}, v = VERDICT[I.verdict], a = I.analyst;
  const x1 = n => n.toFixed(1) + '×';
  const peFmt = n => n < 0 ? '负值' : (n > 200 ? n.toFixed(0) + '×' : x1(n));
  let anaHtml = '';
  if (a && (a.buy + a.hold + a.sell) > 0) {
    const n = a.buy + a.hold + a.sell, f = k => (a[k] / n * 100).toFixed(0);
    anaHtml = `<div class="explain"><h3>华尔街分析师（${n} 位）</h3>
      <div class="ana" aria-hidden="true"><i style="width:${f('buy')}%;background:var(--up)"></i><i style="width:${f('hold')}%;background:var(--warn)"></i><i style="width:${f('sell')}%;background:var(--down)"></i></div>
      <div class="ana-lbl num"><span>买入 ${a.buy}</span><span>持有 ${a.hold}</span><span>卖出 ${a.sell}</span></div>
      ${a.target ? `<p class="num">平均目标价 ${usd(a.target)}，比现价 ${pct((a.target/r[2]-1)*100)}${a.lo&&a.hi?`（区间 ${usd(a.lo)} – ${usd(a.hi)}）`:''}</p>` : ''}</div>`;
  }
  const list = (h, arr) => arr && arr.length ? `<div class="explain"><h3>${h}</h3><ul>${arr.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : '';
  return `<div class="in">${sheetHead(t, r[1], `<span class="rsi num" style="margin-left:auto;color:var(--${r[4]<30?'down':'warn'});background:var(--${r[4]<30?'down':'warn'}-soft)">RSI ${Number(r[4]).toFixed(0)}</span>`)}
    <div class="stack">
      <div class="card kv num">
        <div><span>现价</span><b>${usd(r[2])}</b></div>
        <div><span>市值</span><b>${r[3]>=1000?'$'+(r[3]/1000).toFixed(1)+'T':'$'+r[3]+'B'}</b></div>
        <div><span>距 52 周高点</span><b class="neg">${I.off52!=null?pct(I.off52):'暂无'}</b></div>
        <div><span>近一月</span><b class="${cls(I.m1||0)}">${I.m1!=null?pct(I.m1):'暂无'}</b></div>
      </div>
      ${v ? `<div class="verdict-box ${v[1]}"><span class="eyebrow">Claude 的判断（AI 观点）</span><b>${v[0]}</b><p>${esc(I.view||'')}</p></div>` : '<div class="explain"><p>这只还没有分析，下次更新会补上。</p></div>'}
      ${I.fell ? `<div class="explain why down"><h3>为什么跌</h3><p>${esc(I.fell)}</p></div>` : ''}
      ${list('支持"真便宜"的理由', I.bull)}
      ${list('担心"公司变差"的理由', I.bear)}
      <div class="metrics">
        ${metric('市盈率 PE', I.pe, false, peFmt)}
        ${metric('远期市盈率', I.fpe, false, x1)}
        ${metric('市销率 PS', I.ps, false, x1)}
        ${metric('营收同比（最近一季）', I.g, false, n => (n>=0?'+':'') + n.toFixed(0) + '%')}
      </div>
      ${anaHtml}
      ${srcs(I.src)}
      <p class="foot">评级和目标价：Robinhood。判断是 AI 根据公开数据和新闻做的分析，可能出错，不是买卖建议。</p>
    </div></div>`;
}
function metric(label, val, key, fmt){
  if (val === null || val === undefined) return `<div class="m na"><span>${label}</span><b>暂无</b></div>`;
  return `<div class="m${key?' key':''}"><span>${label}</span><b class="num">${fmt(val)}</b>${key?'<em>这类股票重点看</em>':''}</div>`;
}
function detail(t){
  const x = BY[t], v = (D.val || {})[t] || {type:'value'}, ty = TYPES[v.type] || TYPES.value;
  const x1 = n => n.toFixed(1) + '×';
  const peFmt = n => n < 0 ? '负值' : (n > 200 ? n.toFixed(0) + '×' : x1(n));
  return `<div class="in">
    <div class="sheet-head">
      <button class="back" id="close" aria-label="返回"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
      <div style="min-width:0"><div class="tk" id="sheet-title">${x.t}</div><div class="sub">${esc(x.name)} · ${esc(x.acct)}</div></div>
      <div class="chg num ${cls(x.day)}" style="margin-left:auto">今日 ${pct(x.day)}</div>
    </div>
    <div class="stack">
      <div class="card kv num">
        <div><span>${x.live ? '现价（实时）' : '收盘'}</span><b>${usd(x.close)}</b></div>
        <div><span>${x.live ? '前一日收盘' : '盘后'}</span><b class="${x.live ? '' : cls(x.ahc)}">${usd(x.live ? x.prev : x.ah)}</b></div>
        <div><span>平均成本</span><b>${usd(x.cost)}</b></div>
        <div><span>较成本</span><b class="${cls(x.pnl)}">${pct(x.pnl)}</b></div>
        <div><span>持股</span><b>${x.qty} 股</b></div>
        <div><span>市值</span><b>${usd(x.qty*x.close)}</b></div>
      </div>
      ${whyBox(v.why, x.day)}
      <div class="sec mute" style="display:flex;align-items:center;gap:8px">估值 <span class="type">${ty.name}</span></div>
      <div class="metrics">
        ${metric('市盈率 PE（过去12个月）', v.pe, v.key==='pe', peFmt)}
        ${metric('远期市盈率', v.fpe, v.key==='fpe', x1)}
        ${metric('市销率 PS', v.ps, v.key==='ps', x1)}
        ${metric('营收同比（最近一季）', v.g, false, n => (n>=0?'+':'') + n.toFixed(0) + '%')}
        ${metric('净利率（最近一季）', v.nm, v.key==='nm', n => n.toFixed(1) + '%')}
        ${metric('市净率 PB', v.pb, v.key==='pb', x1)}
        ${metric('股息率', v.dy, v.key==='dy', n => n.toFixed(2) + '%')}
      </div>
      <div class="explain"><h3>${ty.name}：${ty.what}</h3><p>${ty.body}</p><ul>${ty.points.map(p => `<li>${p}</li>`).join('')}</ul></div>
      ${v.note ? `<div class="explain"><h3>${x.t} 现在的数字</h3><p>${esc(v.note)}</p></div>` : ''}
      ${v.ai ? `<div class="explain"><h3>今日解读（AI 观点）</h3><p>${esc(v.ai)}</p></div>` : ''}
      <div class="card" style="padding:14px"><div class="sub">下次财报</div><div>${esc((D.earnNext||{})[t] || '未来两周没有')}</div></div>
      <p class="foot">数据：Robinhood。PS 用市值 ÷ 过去 4 个季度营收计算。以上是数字说明，不是买卖建议。</p>
    </div></div>`;
}

/* ===== 路由和交互 ===== */
const TITLES = {today:'今日', market:'市场', watch:'观察清单', radar:'捡漏', earnings:'财报日历'};
function render(){
  if (!D) return;
  let tab = (location.hash || '#today').slice(1);
  if (!TITLES[tab]) tab = 'today';
  $('#title').textContent = TITLES[tab];
  $('#view').innerHTML = {today, market, watch, radar, earnings}[tab]();
  document.querySelectorAll('.tab').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
}
let lastFocus = null;
function openDetail(t){
  lastFocus = document.activeElement;
  const s = $('#sheet'); s.innerHTML = t.startsWith('r:') ? radarDetail(t.slice(2)) : t.startsWith('w:') ? watchDetail(t.slice(2)) : detail(t); s.hidden = false; s.scrollTop = 0;
  document.body.style.overflow = 'hidden'; $('#close').focus();
}
function closeDetail(){
  const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; document.body.style.overflow = '';
  if (lastFocus) lastFocus.focus();
}
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o) { openDetail(o.dataset.open); return; }
  const tb = e.target.closest('.tab'); if (tb) { location.hash = tb.dataset.tab; window.scrollTo(0,0); return; }
  if (e.target.closest('#close')) { closeDetail(); return; }
  if (e.target.closest('#quiet-toggle')) { quietOpen = !quietOpen; render(); $('#quiet-toggle').focus(); return; }
  if (e.target.closest('#lock-btn')) { store.del('sa-pass'); location.reload(); return; }
  const ws = e.target.closest('[data-wsort]'); if (ws) { watchSort = ws.dataset.wsort; render(); return; }
  const pb = e.target.closest('[data-period]'); if (pb) { period = +pb.dataset.period; render(); const b = document.querySelector(`[data-period="${period}"]`); if (b) b.focus(); }
});
$('#toggle-pass').addEventListener('click', () => {
  const i = $('#pass'), show = i.type === 'password';
  i.type = show ? 'text' : 'password'; $('#toggle-pass').textContent = show ? '隐藏' : '显示';
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeDetail(); });
window.addEventListener('hashchange', render);

$('#lock-form').addEventListener('submit', async e => {
  e.preventDefault();
  const pass = $('#pass').value.trim().toLowerCase().replace(/[.。]+$/, ''); $('#lock-err').textContent = '解锁中…';
  try {
    const data = await decrypt(pass);
    if ($('#remember').checked) store.set('sa-pass', pass);
    $('#lock-err').textContent = '';
    load(data);
  } catch (err) {
    $('#lock-err').textContent = err.message === 'fetch' ? '数据文件读取失败，请稍后刷新。' : '密码不对，请再试一次。';
  }
});

(async () => {
  const saved = store.get('sa-pass');
  if (saved) { try { load(await decrypt(saved)); return; } catch { store.del('sa-pass'); } }
  $('#pass').focus();
})();
