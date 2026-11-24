/* 详情页：概览 / 图表 / 价位 / 同业 / 历史 / 新闻。
   日线来自 /api/history，指标在 ta.js 里算；估值、财报、新闻来自加密数据。 */

/* ===== 日线缓存 ===== */
// 先读 GitHub Action 每天生成的文件（文件名 = HMAC(密码, 代码) 前 24 位），没有再试 Vercel 接口。
const HIST = {};
const HIST_BASE = 'https://raw.githubusercontent.com/ljhconan/stock-assistant-app/hist/';
async function histName(sym){
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(PASS), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(sym)));
  return [...sig].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}
const okHist = j => { if (!j || !j.c || j.c.length < 30) throw new Error('empty'); return j; };
function getHist(sym){
  if (!HIST[sym]) HIST[sym] = histName(sym)
    .then(n => fetch(HIST_BASE + n + '.json', { cache:'no-cache' }))
    .then(r => r.ok ? r.json() : Promise.reject(new Error('gh ' + r.status))).then(okHist)
    .catch(() => fetch('/api/history?symbol=' + encodeURIComponent(sym))
      .then(r => r.ok ? r.json() : Promise.reject(new Error('api ' + r.status))).then(okHist))
    .catch(e => { delete HIST[sym]; throw e; });
  return HIST[sym];
}

/* ===== ECharts 按需加载 ===== */
let EC = null;
function loadEcharts(){
  if (window.echarts) return Promise.resolve(window.echarts);
  if (!EC) EC = new Promise((ok, no) => { const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.1/echarts.min.js'; s.onload = () => ok(window.echarts); s.onerror = no; document.head.appendChild(s); });
  return EC;
}
const css = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
function palette(){
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  return { up: css('--up'), down: css('--down'), ink: css('--ink'), muted: css('--muted'), line: css('--line'), accent: css('--accent'), warn: css('--warn'),
    upSoft: css('--up-soft'), downSoft: css('--down-soft'), accentSoft: css('--accent-soft'), warnSoft: css('--warn-soft'),
    ma: dark ? ['#9DB7FF','#F2B866','#C7A2FF','#7FD1C7','#FF9DB8'] : ['#2F5BD3','#C46A0A','#7A4BC2','#178A7A','#C23A6B'] };
}
const CHARTS = [];
function disposeCharts(){ while (CHARTS.length) { try { CHARTS.pop().dispose(); } catch {} } }
function mkChart(el, opt){ const c = echarts.init(el, null, { renderer: 'canvas' }); c.setOption(opt); CHARTS.push(c); return c; }
addEventListener('resize', () => CHARTS.forEach(c => c.resize()));

/* ===== 小工具 ===== */
function srcs(list){
  if (!list || !list.length) return '';
  return `<div class="src-list">来源：${list.map(x => Array.isArray(x) ? `<a href="${esc(x[1])}" target="_blank" rel="noopener">${esc(x[0])}</a>` : esc(x)).join('')}</div>`;
}
function whyBox(w, day, title){
  if (!w) return '';
  return `<div class="explain why ${day>=0?'up':'down'}"><h3>${title || (day>=0?'今天为什么涨':'今天为什么跌')}</h3><p>${esc(w.text)}</p>${srcs(w.src)}</div>`;
}
function metric(label, val, key, fmt){
  if (val === null || val === undefined) return `<div class="m na"><span>${label}</span><b>暂无</b></div>`;
  return `<div class="m${key?' key':''}"><span>${label}</span><b class="num">${fmt(val)}</b>${key?'<em>这类股票重点看</em>':''}</div>`;
}
const x1 = n => n.toFixed(1) + '×';
const peFmt = n => n < 0 ? '负值' : (n > 200 ? n.toFixed(0) + '×' : x1(n));
const pct0 = v => v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0) + '%';
const p2 = v => v == null ? '—' : v.toFixed(2);
const loading = msg => `<div class="explain"><p class="sub">${msg || '正在读取历史行情…'}</p></div>`;
const failBox = () => `<div class="explain"><p>历史行情暂时读取不到，稍后再打开试试。</p></div>`;
function btText(b, what){
  if (!b || !b.n) return `过去两年没有出现过"${what}"。`;
  if (!b.done) return `过去两年出现 ${b.n} 次"${what}"，时间太近，还没有 20 天后的结果。`;
  return `过去两年"${what}"出现 ${b.n} 次：之后 20 个交易日上涨的占 ${b.win.toFixed(0)}%，平均 ${pct(b.avg)}（最好 ${pct(b.best)}，最差 ${pct(b.worst)}）。${b.done < 5 ? '次数少，参考意义有限。' : ''}`;
}
function sheetHead(sym, sub, right){
  return `<div class="sheet-head">
      <button class="back" id="close" aria-label="返回"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
      <div style="min-width:0"><div class="tk" id="sheet-title">${esc(sym)}</div><div class="sub">${esc(sub)}</div></div>
      ${right}
    </div>`;
}

/* ===== 当前打开的详情 ===== */
let CUR = null; // {kind:'h'|'w'|'r', t, tab}
const TABSETS = { h: [['ov','概览'],['chart','图表'],['lv','价位'],['peer','同业'],['hist','历史'],['news','新闻']],
                  w: [['ov','概览'],['chart','图表'],['lv','价位']],
                  r: [['ov','概览'],['chart','图表'],['lv','价位']] };

let lastFocus = null;
function openDetail(key){
  lastFocus = document.activeElement;
  const kind = key.startsWith('r:') ? 'r' : key.startsWith('w:') ? 'w' : 'h';
  const t = kind === 'h' ? key : key.slice(2);
  CUR = { kind, t, tab: 'ov' };
  const s = $('#sheet'); s.hidden = false; document.body.style.overflow = 'hidden';
  drawSheet(); s.scrollTop = 0; $('#close').focus();
}
function closeDetail(){
  disposeCharts(); CUR = null;
  const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; document.body.style.overflow = '';
  if (lastFocus) lastFocus.focus();
}

function headInfo(){
  const { kind, t } = CUR;
  if (kind === 'h') { const x = BY[t]; return { sub: x.name + ' · ' + x.acct, right: `<div class="chg num ${cls(x.day)}" style="margin-left:auto">今日 ${pct(x.day)}</div>`, price: x.close }; }
  if (kind === 'w') { const w = watchRows().find(x => x.s === t); const d = w.pc ? (w.p / w.pc - 1) * 100 : null;
    return { sub: w.n + ' · ' + (w.lists||[]).join('、'), right: d!==null?`<div class="chg num ${cls(d)}" style="margin-left:auto">今日 ${pct(d)}</div>`:'', price: w.p }; }
  const r = D.radar.find(x => x[0] === t);
  return { sub: r[1], right: `<span class="rsi num" style="margin-left:auto;color:var(--${r[4]<30?'down':'warn'});background:var(--${r[4]<30?'down':'warn'}-soft)">RSI ${Number(r[4]).toFixed(0)}</span>`, price: r[2] };
}

function drawSheet(){
  disposeCharts();
  const h = headInfo(), tabs = TABSETS[CUR.kind];
  $('#sheet').innerHTML = `<div class="in">${sheetHead(CUR.t, h.sub, h.right)}
    <div class="dtabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="dtab" data-dtab="${k}" aria-selected="${k===CUR.tab}">${l}</button>`).join('')}</div>
    <div class="stack" id="dbody"></div></div>`;
  const body = $('#dbody'), tab = CUR.tab, my = CUR;
  const sync = { ov: tabOverview, news: tabNews }[tab];
  if (sync) { body.innerHTML = sync(); }
  if (tab === 'ov') { fillOverviewAsync(my); return; }
  if (tab === 'news') return;
  body.innerHTML = loading();
  Promise.all([getHist(CUR.t), loadEcharts()]).then(([H]) => {
    if (CUR !== my) return;
    ({ chart: tabChart, lv: tabLevels, peer: tabPeers, hist: tabHistory })[tab](body, H, h.price);
  }).catch(() => { if (CUR === my) body.innerHTML = failBox(); });
}

/* ===== 概览 ===== */
function tabOverview(){
  const { kind, t } = CUR;
  if (kind === 'h') {
    const x = BY[t], v = (D.val || {})[t] || {type:'value'}, ty = TYPES[v.type] || TYPES.value, a = v.analyst;
    return `<div class="card kv num">
        <div><span>${x.live ? '现价（实时）' : '收盘'}</span><b>${usd(x.close)}</b></div>
        <div><span>${x.live ? '前一日收盘' : '盘后'}</span><b class="${x.live ? '' : cls(x.ahc)}">${usd(x.live ? x.prev : x.ah)}</b></div>
        <div><span>平均成本</span><b>${usd(x.cost)}</b></div>
        <div><span>较成本</span><b class="${cls(x.pnl)}">${pct(x.pnl)}</b></div>
        <div><span>持股</span><b>${x.qty} 股</b></div>
        <div><span>市值</span><b>${usd(x.qty*x.close)}</b></div>
      </div>
      ${whyBox(v.why, x.day)}
      <div id="tech-slot">${loading('正在计算技术面…')}</div>
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
      ${v.note ? `<div class="explain"><h3>${esc(t)} 现在的数字</h3><p>${esc(v.note)}</p></div>` : ''}
      ${anaBox(a, x.close)}
      <div class="card" style="padding:14px"><div class="sub">下次财报</div><div>${esc((D.earnNext||{})[t] || '未来两周没有')}</div></div>
      <div id="verify-slot"></div>
      <p class="foot">数据：Robinhood；历史行情：<span id="hsrc">—</span>。以上是数字说明，不是买卖建议。</p>`;
  }
  if (kind === 'w') {
    const w = watchRows().find(x => x.s === t), d = w.pc ? (w.p / w.pc - 1) * 100 : null, why = (D.watchWhy || {})[t];
    return `<div class="card kv num">
        <div><span>收盘</span><b>${usd(w.p)}</b></div>
        <div><span>前一日收盘</span><b>${w.pc?usd(w.pc):'暂无'}</b></div>
        <div><span>52 周高</span><b>${usd(w.hi)}</b></div>
        <div><span>52 周低</span><b>${usd(w.lo)}</b></div>
      </div>
      ${why ? whyBox(why, d ?? 0) : `<div class="explain"><p>今天涨跌在 5% 以内，没有单独查新闻。</p></div>`}
      <div id="tech-slot">${loading('正在计算技术面…')}</div>
      <p class="foot">价格：Robinhood；历史行情：<span id="hsrc">—</span>。不是买卖建议。</p>`;
  }
  const r = D.radar.find(x => x[0] === t), I = (D.radarInfo || {})[t] || {}, v = VERDICT[I.verdict];
  const list = (h, arr) => arr && arr.length ? `<div class="explain"><h3>${h}</h3><ul>${arr.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>` : '';
  return `<div class="card kv num">
      <div><span>现价</span><b>${usd(r[2])}</b></div>
      <div><span>市值</span><b>${r[3]>=1000?'$'+(r[3]/1000).toFixed(1)+'T':'$'+r[3]+'B'}</b></div>
      <div><span>距 52 周高点</span><b class="neg">${I.off52!=null?pct(I.off52):'暂无'}</b></div>
      <div><span>近一月</span><b class="${cls(I.m1||0)}">${I.m1!=null?pct(I.m1):'暂无'}</b></div>
    </div>
    ${v ? `<div class="verdict-box ${v[1]}"><span class="eyebrow">Claude 的判断（AI 观点）</span><b>${v[0]}</b><p>${esc(I.view||'')}</p></div>` : '<div class="explain"><p>这只还没有分析，下次收盘更新会补上。</p></div>'}
    ${I.fell ? `<div class="explain why down"><h3>为什么跌</h3><p>${esc(I.fell)}</p></div>` : ''}
    ${list('支持"真便宜"的理由', I.bull)}
    ${list('担心"公司变差"的理由', I.bear)}
    <div id="tech-slot">${loading('正在计算技术面…')}</div>
    <div class="metrics">
      ${metric('市盈率 PE', I.pe, false, peFmt)}
      ${metric('远期市盈率', I.fpe, false, x1)}
      ${metric('市销率 PS', I.ps, false, x1)}
      ${metric('营收同比（最近一季）', I.g, false, n => (n>=0?'+':'') + n.toFixed(0) + '%')}
    </div>
    ${anaBox(I.analyst, r[2])}
    ${srcs(I.src)}
    <p class="foot">评级和目标价：Robinhood。判断是 AI 根据公开数据和新闻做的分析，可能出错，不是买卖建议。</p>`;
}
function anaBox(a, price){
  if (!a || !((a.buy||0) + (a.hold||0) + (a.sell||0))) return '';
  const n = a.buy + a.hold + a.sell, f = k => (a[k] / n * 100).toFixed(0);
  return `<div class="explain"><h3>华尔街分析师（${n} 位）</h3>
    <div class="ana" aria-hidden="true"><i style="width:${f('buy')}%;background:var(--up)"></i><i style="width:${f('hold')}%;background:var(--warn)"></i><i style="width:${f('sell')}%;background:var(--down)"></i></div>
    <div class="ana-lbl num"><span>买入 ${a.buy}</span><span>持有 ${a.hold}</span><span>卖出 ${a.sell}</span></div>
    ${a.target ? `<p class="num">平均目标价 ${usd(a.target)}，比现价 ${pct((a.target/price-1)*100)}${a.lo&&a.hi?`（最低 ${usd(a.lo)}，最高 ${usd(a.hi)}）`:''}</p>` : ''}</div>`;
}
function techCard(H, I){
  const S = TA.state(H, I), mark = g => g === true ? '<span class="dot up"></span>' : g === false ? '<span class="dot down"></span>' : '<span class="dot"></span>';
  return `<div class="explain"><h3>技术面状态</h3>
    <div class="pos52"><div class="rng-lbl num"><span>52 周低 ${usd(S.lo52)}</span><span>高 ${usd(S.hi52)}</span></div>
      <div class="range"><i style="left:calc(${Math.max(0,Math.min(100,S.pos)).toFixed(0)}% - 2px)"></i></div>
      <p class="num" style="margin-top:4px">现在处在 52 周区间的 <b>${S.pos.toFixed(0)}%</b> 位置${S.pos < 10 ? '，接近一年低点' : S.pos > 90 ? '，接近一年高点' : ''}。</p></div>
    <ul class="tlist">${S.items.map(i => `<li>${mark(i.good)}${esc(i.txt)}</li>`).join('')}</ul>
    <p class="sub">${S.strong} 项偏强、${S.weak} 项偏弱。这里只描述走势，不代表接下来会涨或跌。</p></div>`;
}
function fillOverviewAsync(my){
  getHist(CUR.t).then(H => {
    if (CUR !== my) return;
    const I = TA.all(H), slot = $('#tech-slot'); if (slot) slot.innerHTML = techCard(H, I);
    const hs = $('#hsrc'); if (hs) hs.textContent = H.src;
    if (my.kind === 'h') {
      // 两个数据源核对收盘价
      const row = D.holdings.find(r => r[0] === my.t), i = H.d.indexOf(D.asOf);
      const vs = $('#verify-slot');
      if (vs && row && i >= 0) {
        const diff = (row[4] / H.c[i] - 1) * 100;
        vs.innerHTML = Math.abs(diff) > 1
          ? `<div class="explain warnbox"><h3>数据核对：两个来源不一致</h3><p class="num">Robinhood 收盘 ${usd(row[4])}，${esc(H.src)} 收盘 ${usd(H.c[i])}，相差 ${pct(diff)}。可能有拆股或数据延迟，以 Robinhood App 为准。</p></div>`
          : `<p class="foot ok">✓ ${D.asOf} 收盘价已和 ${esc(H.src)} 核对一致。</p>`;
      }
      // β
      Promise.all([getHist('QQQ'), getHist('SPY')]).then(([Q, S]) => {
        if (CUR !== my || ['QQQ','SPY'].includes(my.t)) return;
        const bq = TA.beta(H, Q), bs = TA.beta(H, S), el = $('#tech-slot'); if (!el || !bq || !bs) return;
        el.insertAdjacentHTML('beforeend', `<div class="explain"><h3>和大盘的关系（近一年）</h3>
          <div class="kv num" style="padding:0"><div><span>β 对纳指 QQQ</span><b>${p2(bq.beta)}</b></div><div><span>β 对标普 SPY</span><b>${p2(bs.beta)}</b></div>
          <div><span>和 QQQ 相关系数</span><b>${p2(bq.corr)}</b></div><div><span>年化波动率</span><b>${TA.vol(H,252).toFixed(0)}%</b></div></div>
          <p>β ${p2(bq.beta)} 的意思是：纳指每涨跌 1%，这只股票平均涨跌约 ${Math.abs(bq.beta).toFixed(1)}%。相关系数平方 R² = ${(bq.r2*100).toFixed(0)}%，表示它的日波动里大约有这么多能用纳指解释${bq.r2 < 0.3 ? '，剩下的主要是公司自身因素' : ''}。</p></div>`);
      }).catch(() => {});
    }
  }).catch(() => { if (CUR === my) { const slot = $('#tech-slot'); if (slot) slot.innerHTML = failBox(); } });
}

/* ===== 图表 ===== */
let RANGE = 252;
function zoomStart(n){ return Math.max(0, (1 - RANGE / n) * 100); }
function tabChart(body, H){
  const I = TA.all(H), E = TA.signals(H, I), P = palette(), L = TA.levels(H, I), n = H.c.length;
  body.innerHTML = `
    <div class="seg" role="group" aria-label="时间范围">${[[126,'半年'],[252,'一年'],[504,'两年']].map(([k,l]) => `<button data-range="${k}" aria-pressed="${k===RANGE}">${l}</button>`).join('')}</div>
    <div class="sec mute">① K 线 + 均线</div>
    <div class="card chart-card"><div class="chart" id="c1" style="height:360px"></div></div>
    <p class="note">蓝色带 = 下方最近的支撑区，橙色带 = 上方最近的压力区（在"价位"页有明细）。</p>
    <div class="pc"><div><b class="pos">✓ 优势</b><p>直观看趋势和量价，均线给出支撑与压力。</p></div><div><b class="neg">✗ 劣势</b><p>均线滞后，横盘震荡时容易失效。</p></div></div>
    <div class="explain"><h3>本股历史统计（20 个交易日后）</h3><ul><li>${btText(TA.backtest(H.c, E.ma60Up), '向上突破 60 日线')}</li><li>${btText(TA.backtest(H.c, E.ma60Dn), '跌破 60 日线')}</li></ul></div>

    <div class="sec mute">② 布林线</div>
    <div class="card chart-card"><div class="chart" id="c2" style="height:330px"></div></div>
    <div class="pc"><div><b class="pos">✓ 优势</b><p>通道随波动自动变宽变窄，▲ 标收回下轨，▼ 标跌回上轨。</p></div><div><b class="neg">✗ 劣势</b><p>单边趋势里股价会沿着轨道一直走（"走轨"）。</p></div></div>
    <div class="explain"><h3>本股历史统计</h3><ul><li>${btText(TA.backtest(H.c, E.bollUp), '跌破下轨后收回')}</li><li>${btText(TA.backtest(H.c, E.bollDn), '突破上轨后跌回')}</li></ul></div>

    <div class="sec mute">③ MACD + RSI</div>
    <div class="card chart-card"><div class="chart" id="c3" style="height:360px"></div></div>
    <div class="pc"><div><b class="pos">✓ 优势</b><p>拐点清楚；RSI 直接看出超买（>70）超卖（<30）。</p></div><div><b class="neg">✗ 劣势</b><p>横盘时金叉死叉反复出现，噪声大。</p></div></div>
    <div class="explain"><h3>本股历史统计</h3><ul>
      <li>${btText(TA.backtest(H.c, E.golden), 'MACD 金叉')}</li><li>${btText(TA.backtest(H.c, E.death), 'MACD 死叉')}</li>
      <li>${btText(TA.backtest(H.c, E.rsiLow), 'RSI 跌破 30')}</li><li>${btText(TA.backtest(H.c, E.rsiHigh), 'RSI 升破 70')}</li></ul>
      <p class="sub">"上涨的占比"高于 50% 不代表这次也会涨，样本只有过去两年。</p></div>
    <p class="foot">历史行情：${esc(H.src)}，截至 ${H.d[n-1]}。</p>`;

  const ax = { axisLine:{lineStyle:{color:P.line}}, axisLabel:{color:P.muted,fontSize:10}, splitLine:{lineStyle:{color:P.line,opacity:.5}} };
  const zoom = [{ type:'inside', xAxisIndex:[0,1], start: zoomStart(n), end: 100 }];
  const tip = { trigger:'axis', axisPointer:{type:'cross'}, confine:true, textStyle:{fontSize:11} };
  const line = (name, data, color, extra = {}) => ({ name, type:'line', data: data.map(v => v == null ? '-' : +v.toFixed(2)), symbol:'none', lineStyle:{width:1.2,color}, itemStyle:{color}, ...extra });
  const s1 = L.below[0], r1 = L.above[0];
  const areas = [];
  if (s1) areas.push([{ yAxis: s1.lo, itemStyle:{color:P.accentSoft,opacity:.8}, label:{show:true,position:'insideLeft',color:P.accent,fontSize:10,formatter:'支撑'} }, { yAxis: s1.hi }]);
  if (r1) areas.push([{ yAxis: r1.lo, itemStyle:{color:P.warnSoft,opacity:.8}, label:{show:true,position:'insideLeft',color:P.warn,fontSize:10,formatter:'压力'} }, { yAxis: r1.hi }]);
  mkChart($('#c1'), {
    animation:false, legend:{ top:0, data:['K线','MA5','MA20','MA60','MA120','MA250'], textStyle:{color:P.muted,fontSize:10}, itemWidth:14, itemHeight:8 }, tooltip: tip, dataZoom: zoom,
    grid:[{ left:44, right:10, top:28, height:'58%' }, { left:44, right:10, top:'76%', height:'16%' }],
    xAxis:[{ type:'category', data:H.d, ...ax, axisLabel:{show:false} }, { type:'category', gridIndex:1, data:H.d, ...ax }],
    yAxis:[{ scale:true, ...ax }, { gridIndex:1, ...ax, axisLabel:{show:false}, splitLine:{show:false} }],
    series:[
      { name:'K线', type:'candlestick', data:H.d.map((_, i) => [H.o[i], H.c[i], H.l[i], H.h[i]]),
        itemStyle:{ color:P.up, color0:P.down, borderColor:P.up, borderColor0:P.down }, markArea:{ silent:true, data: areas } },
      line('MA5', I.ma5, P.ma[0]), line('MA20', I.ma20, P.ma[1]), line('MA60', I.ma60, P.ma[2]), line('MA120', I.ma120, P.ma[3]), line('MA250', I.ma250, P.ma[4]),
      { name:'成交量', type:'bar', xAxisIndex:1, yAxisIndex:1, data:H.v.map((v, i) => ({ value:v, itemStyle:{ color: H.c[i] >= H.o[i] ? P.up : P.down, opacity:.6 } })) }
    ]});
  const mk = (idx, arr, name, rot, color) => ({ type:'scatter', name, data: idx.map(i => [H.d[i], +arr[i].toFixed(2)]),
    symbol: 'triangle', symbolRotate: rot, symbolSize: 9, itemStyle:{ color } });
  mkChart($('#c2'), {
    animation:false, legend:{ top:0, textStyle:{color:P.muted,fontSize:10}, itemWidth:14, itemHeight:8 }, tooltip: tip, dataZoom: zoom,
    grid:[{ left:44, right:10, top:28, height:'58%' }, { left:44, right:10, top:'78%', height:'14%' }],
    xAxis:[{ type:'category', data:H.d, ...ax, axisLabel:{show:false} }, { type:'category', gridIndex:1, data:H.d, ...ax }],
    yAxis:[{ scale:true, ...ax }, { gridIndex:1, ...ax, min:-0.5, max:1.5, interval:1 }],
    series:[
      line('收盘价', H.c, P.ink, { lineStyle:{width:1.4,color:P.ink} }),
      line('上轨', I.boll.up, P.accent), line('中轨', I.boll.mid, P.muted, { lineStyle:{width:1,type:'dashed',color:P.muted} }),
      line('下轨', I.boll.lo, P.accent, { areaStyle:undefined }),
      mk(E.bollUp, H.l, '收回下轨', 0, P.up), mk(E.bollDn, H.h, '跌回上轨', 180, P.warn),
      line('%B', I.boll.pb, P.ma[2], { xAxisIndex:1, yAxisIndex:1, markLine:{ silent:true, symbol:'none', lineStyle:{color:P.line,type:'dashed'}, label:{show:false}, data:[{yAxis:0},{yAxis:1}] } })
    ]});
  mkChart($('#c3'), {
    animation:false, legend:{ top:0, textStyle:{color:P.muted,fontSize:10}, itemWidth:14, itemHeight:8 }, tooltip: tip, dataZoom: zoom,
    grid:[{ left:44, right:10, top:28, height:'42%' }, { left:44, right:10, top:'64%', height:'28%' }],
    xAxis:[{ type:'category', data:H.d, ...ax, axisLabel:{show:false} }, { type:'category', gridIndex:1, data:H.d, ...ax }],
    yAxis:[{ scale:true, ...ax }, { gridIndex:1, ...ax, min:0, max:100, interval:30 }],
    series:[
      { name:'MACD柱', type:'bar', data:I.macd.hist.map(v => ({ value:+v.toFixed(3), itemStyle:{ color: v >= 0 ? P.up : P.down, opacity:.7 } })) },
      line('DIF', I.macd.dif, P.accent), line('DEA', I.macd.dea, P.warn),
      line('RSI(14)', I.rsi, P.ma[2], { xAxisIndex:1, yAxisIndex:1, markArea:{ silent:true, data:[
        [{ yAxis:70, itemStyle:{color:P.downSoft,opacity:.7} }, { yAxis:100 }], [{ yAxis:0, itemStyle:{color:P.upSoft,opacity:.7} }, { yAxis:30 }] ] } })
    ]});
}

/* ===== 价位 ===== */
function tabLevels(body, H, price){
  const I = TA.all(H), t = CUR.t;
  const a = CUR.kind === 'h' ? ((D.val||{})[t]||{}).analyst : CUR.kind === 'r' ? ((D.radarInfo||{})[t]||{}).analyst : null;
  const L = TA.levels(H, I), c = price || L.c, S = TA.state(H, I);
  const zone = (z, side) => `<div class="zone ${side}">
      <div class="zt num"><b>${usd(z.lo)}${z.hi - z.lo > 0.005 ? ' – ' + usd(z.hi) : ''}</b><span class="${side==='dn'?'neg':'pos'}">${pct((z.mid / c - 1) * 100)}</span></div>
      <div class="zs">${z.labels.map(esc).join(' · ')}${z.n >= 3 ? ' <span class="pill p-held">多个价位重合</span>' : ''}</div>
      ${z.touch && z.touch.done >= 3 ? `<div class="sub">过去两年${side==='dn'?'从上方回落':'从下方涨'}到这里 ${z.touch.n} 次，之后 20 天上涨的占 ${z.touch.win.toFixed(0)}%，平均 ${pct(z.touch.avg)}</div>`
        : z.touch && z.touch.n ? `<div class="sub">过去两年${side==='dn'?'回落':'涨'}到这里 ${z.touch.n} 次，次数太少，不做统计</div>` : ''}
    </div>`;
  const held = CUR.kind === 'h' ? BY[t] : null;
  const saved = (() => { try { return JSON.parse(store.get('calc-' + t) || '{}'); } catch { return {}; } })();
  body.innerHTML = `
    <div class="explain"><h3>现价 ${usd(c)} · 52 周位置 ${S.pos.toFixed(0)}%</h3>
      <p>下面是用历史行情算出来的客观价位：均线、布林带、前期高低点、斐波那契回撤、52 周高低。相距 2.5% 以内的合并成一个区间，重合的越多，市场越可能在这里有反应。</p></div>
    <div class="sec mute">上方压力区（从近到远）</div>
    <div class="card list">${L.above.length ? L.above.map(z => zone(z, 'up')).join('') : '<div class="li sub">现价在近一年最高点附近，上方没有历史价位。</div>'}</div>
    <div class="sec mute">下方支撑区（从近到远）</div>
    <div class="card list">${L.below.length ? L.below.map(z => zone(z, 'dn')).join('') : '<div class="li sub">现价在近一年最低点附近，下方没有历史价位。</div>'}</div>
    ${a && a.target ? `<div class="explain"><h3>分析师目标价（Robinhood）</h3><p class="num">最低 ${a.lo?usd(a.lo):'—'} · 平均 ${usd(a.target)}（${pct((a.target/c-1)*100)}）· 最高 ${a.hi?usd(a.hi):'—'}</p></div>` : ''}
    <div class="sec mute">仓位计算器</div>
    <form class="explain calc" id="calc" data-sym="${esc(t)}">
      <p class="sub">价格和亏损上限都由你自己定，这里只做算术。${held ? `你现在持有 ${held.qty} 股，成本 ${usd(held.cost)}。` : ''}</p>
      <label>计划买入价<input inputmode="decimal" name="entry" value="${esc(saved.entry ?? c.toFixed(2))}"></label>
      <label>止损价（跌到这里就卖）<input inputmode="decimal" name="stop" value="${esc(saved.stop ?? '')}" placeholder="比如上面某个支撑区下沿"></label>
      <label>这笔最多愿意亏（美元）<input inputmode="decimal" name="risk" value="${esc(saved.risk ?? '')}" placeholder="比如 500"></label>
      <label>目标价（可不填）<input inputmode="decimal" name="target" value="${esc(saved.target ?? '')}"></label>
      <div id="calc-out" class="calc-out"></div>
    </form>
    <p class="foot">技术价位是历史统计，不保证股价会在这里止跌或遇阻。历史行情：${esc(H.src)}。</p>`;
  calcRun();
}
function calcRun(){
  const f = $('#calc'); if (!f) return;
  const g = k => parseFloat(f.elements[k].value), entry = g('entry'), stop = g('stop'), risk = g('risk'), target = g('target'), out = $('#calc-out');
  try { store.set('calc-' + f.dataset.sym, JSON.stringify({ entry: f.elements.entry.value, stop: f.elements.stop.value, risk: f.elements.risk.value, target: f.elements.target.value })); } catch {}
  if (!(entry > 0) || !(stop > 0) || !(risk > 0)) { out.innerHTML = '<p class="sub">填好买入价、止损价和亏损上限后显示结果。</p>'; return; }
  if (stop >= entry) { out.innerHTML = '<p class="neg">止损价要低于买入价。</p>'; return; }
  const per = entry - stop, sh = Math.floor(risk / per), cost = sh * entry, T = totals();
  const rr = target > entry ? (target - entry) / per : null;
  out.innerHTML = sh < 1 ? `<p>每股风险 ${usd(per)}，亏损上限不够买 1 股。</p>` : `<div class="kv num" style="padding:0">
      <div><span>股数</span><b>${sh} 股</b></div><div><span>金额</span><b>${usd(cost)}</b></div>
      <div><span>占总市值</span><b>${(cost / T.value * 100).toFixed(1)}%</b></div><div><span>止损时亏</span><b class="neg">${usd(sh * per)}</b></div>
      <div><span>每股风险</span><b>${usd(per)}（${(per/entry*100).toFixed(1)}%）</b></div>
      <div><span>盈亏比</span><b>${rr ? rr.toFixed(2) : '—'}</b></div></div>
      ${rr ? `<p class="sub">盈亏比 = (目标价 − 买入价) ÷ (买入价 − 止损价)。到目标价赚 ${usd(sh * (target - entry))}。${rr < 1 ? '小于 1 表示潜在收益小于潜在亏损。' : ''}</p>` : ''}`;
}
document.addEventListener('input', e => { if (e.target.closest('#calc')) calcRun(); });
document.addEventListener('submit', e => { if (e.target.id === 'calc') e.preventDefault(); });

/* ===== 同业 ===== */
function tabPeers(body, H){
  const t = CUR.t, v = (D.val||{})[t] || {}, peers = v.peers || [], my = CUR;
  if (!peers.length) { body.innerHTML = `<div class="explain"><p>${v.type === 'etf' || v.type === 'lev' ? 'ETF 不做同业对比。' : '这只还没有同行数据，下次收盘更新会补上。'}</p></div>`; return; }
  body.innerHTML = loading('正在读取同行行情…');
  const syms = peers.map(p => p[0]);
  Promise.all([...syms, 'QQQ'].map(s => getHist(s).catch(() => null))).then(hs => {
    if (CUR !== my) return;
    const Q = hs.pop(), rows = [[t, BY[t].name, v.pe, v.pb, v.roe, H]].concat(peers.map((p, k) => [...p, hs[k]]));
    const med = (() => { const a = peers.map(p => p[2]).filter(x => x != null && x > 0).sort((a, b) => a - b); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; })();
    const cell = x => x == null ? '—' : x < 0 ? x.toFixed(1) : x.toFixed(1);
    body.innerHTML = `
      <div class="card tbl-wrap"><table class="tbl num"><thead><tr><th>公司</th><th>PE</th><th>PB</th><th>ROE</th><th>近60日</th><th>相关</th></tr></thead>
      <tbody>${rows.map((r, k) => { const h = r[5], b = k && h ? TA.beta(h, H) : null, r60 = h ? TA.ret(h, 60) : null;
        return `<tr class="${k?'':'me'}"><td><b>${esc(r[0])}</b><span class="nm">${esc(r[1])}</span></td><td>${cell(r[2])}</td><td>${cell(r[3])}</td><td>${r[4]==null?'—':r[4].toFixed(0)+'%'}</td><td class="${cls(r60||0)}">${pct0(r60)}</td><td>${k ? (b ? b.corr.toFixed(2) : '—') : '—'}</td></tr>`; }).join('')}</tbody></table></div>
      ${med && v.pe > 0 ? `<div class="explain"><p class="num">${esc(t)} PE ${v.pe.toFixed(1)}，同行中位数 ${med.toFixed(1)}，${v.pe < med ? '比同行低' : '比同行高'} ${Math.abs((v.pe / med - 1) * 100).toFixed(0)}%。PE 高低要结合增速看：增长快的公司 PE 高是正常的。</p></div>` : ''}
      <div class="sec mute">近一年走势对比（起点 = 100）</div>
      <div class="card chart-card"><div class="chart" id="c4" style="height:300px"></div></div>
      <p class="note">ROE = 净资产收益率（过去 4 季净利润 ÷ 净资产）。相关 = 近一年和 ${esc(t)} 日涨跌的相关系数，越接近 1 走势越像。同行行情：${esc(H.src)}；估值：Robinhood。</p>`;
    const P = palette(), from = H.d[Math.max(0, H.d.length - 252)];
    const norm = h => { const i = h.d.findIndex(d => d >= from); const b = h.c[i]; const m = {}; h.d.slice(i).forEach((d, k) => m[d] = +(h.c[i + k] / b * 100).toFixed(1)); return m; };
    const days = H.d.filter(d => d >= from), cols = [P.ink, P.accent, P.warn, P.ma[2], P.ma[3], P.ma[4], P.up];
    const ser = [[t, H], ...peers.map((p, k) => [p[0], hs[k]]), ['QQQ', Q]].filter(x => x[1]).map(([s, h], k) => {
      const m = norm(h); const last = s === 'QQQ';
      return { name: s, type:'line', symbol:'none', data: days.map(d => m[d] ?? '-'), connectNulls:true,
        lineStyle:{ width: k === 0 ? 2.4 : 1.2, type: last ? 'dashed' : 'solid', color: last ? P.muted : cols[k % cols.length] }, itemStyle:{ color: last ? P.muted : cols[k % cols.length] } };
    });
    const ax = { axisLine:{lineStyle:{color:P.line}}, axisLabel:{color:P.muted,fontSize:10}, splitLine:{lineStyle:{color:P.line,opacity:.5}} };
    mkChart($('#c4'), { animation:false, legend:{ top:0, textStyle:{color:P.muted,fontSize:10}, itemWidth:14, itemHeight:8 }, tooltip:{ trigger:'axis', confine:true, textStyle:{fontSize:11} },
      grid:{ left:40, right:10, top:40, bottom:24 }, xAxis:{ type:'category', data:days, ...ax }, yAxis:{ scale:true, ...ax }, series: ser });
  });
}

/* ===== 历史 ===== */
function tabHistory(body, H){
  const t = CUR.t, v = (D.val||{})[t] || {}, fin = (v.fin || []).slice().reverse(), eps = (v.eps || []).slice().sort((a, b) => a[0] < b[0] ? -1 : 1);
  if (!fin.length && !eps.length) { body.innerHTML = `<div class="explain"><p>${v.type === 'etf' || v.type === 'lev' ? 'ETF 没有公司财报。' : '还没有财报历史数据，下次收盘更新会补上。'}</p></div>`; return; }
  const R = TA.earnReact(H, eps), PE = (v.type === 'loss') ? null : TA.peHistory(H, eps);
  const done = R.filter(x => x.e[2] != null), beat = done.filter(x => x.e[3] > x.e[2]).length;
  const r1s = R.map(x => x.r1).filter(x => x != null), avgAbs = r1s.length ? r1s.reduce((s, x) => s + Math.abs(x), 0) / r1s.length : null;
  const next = eps.find(e => e[3] == null);
  body.innerHTML = `
    ${fin.length ? `<div class="sec mute">季度营收和净利率</div><div class="card chart-card"><div class="chart" id="c5" style="height:260px"></div></div>
      <p class="note">柱 = 营收（十亿美元），线 = 净利率。数据：Robinhood。</p>` : ''}
    ${R.length ? `<div class="sec mute">每股收益（EPS）和财报后股价</div>
      <div class="card tbl-wrap"><table class="tbl num"><thead><tr><th>公布日</th><th>预期</th><th>实际</th><th>超出</th><th>次日</th><th>5 日</th></tr></thead>
      <tbody>${R.slice().reverse().map(x => { const [d, tm, est, act] = x.e; const s = est ? (act / est - 1) * 100 : null;
        return `<tr><td>${d.slice(2)}<span class="nm">${tm === 'pm' ? '盘后' : '盘前'}</span></td><td>${p2(est)}</td><td>${p2(act)}</td><td class="${cls(s||0)}">${pct0(s)}</td><td class="${cls(x.r1||0)}">${x.r1==null?'—':pct(x.r1)}</td><td class="${cls(x.r5||0)}">${x.r5==null?'—':pct(x.r5)}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="explain"><p>过去 ${done.length} 次财报有 ${beat} 次实际 EPS 高于预期。${avgAbs != null ? `财报后第一个交易日股价平均波动 ±${avgAbs.toFixed(1)}%。` : ''}${next ? `下次财报 ${next[0]}${next[1]==='pm'?' 盘后':' 盘前'}，预期 EPS ${p2(next[2])}。` : ''}</p>
      <p class="sub">EPS 是调整后口径（Robinhood）。"次日"按公布前最后一个收盘价算。</p></div>` : ''}
    ${PE ? `<div class="sec mute">市盈率历史</div><div class="card chart-card"><div class="chart" id="c6" style="height:240px"></div></div>
      <div class="explain"><p class="num">按最近 4 季调整后 EPS 算，现在 PE ${PE.now.toFixed(1)}，${PE.d[0]} 以来在 ${PE.min.toFixed(1)} – ${PE.max.toFixed(1)} 之间，中位数 ${PE.med.toFixed(1)}。${v.type === 'cyclical' ? '周期股利润高峰时 PE 会被压低，PE 低于历史不一定代表便宜。' : ''}</p></div>` : ''}`;
  const P = palette(), ax = { axisLine:{lineStyle:{color:P.line}}, axisLabel:{color:P.muted,fontSize:10}, splitLine:{lineStyle:{color:P.line,opacity:.5}} };
  if (fin.length) mkChart($('#c5'), { animation:false, tooltip:{ trigger:'axis', confine:true, textStyle:{fontSize:11} }, legend:{ top:0, textStyle:{color:P.muted,fontSize:10} },
    grid:{ left:44, right:40, top:30, bottom:24 }, xAxis:{ type:'category', data: fin.map(f => f[0]), ...ax },
    yAxis:[{ ...ax, name:'' }, { ...ax, splitLine:{show:false}, axisLabel:{color:P.muted,fontSize:10,formatter:'{value}%'} }],
    series:[{ name:'营收', type:'bar', data: fin.map(f => f[2]), itemStyle:{ color:P.accent, opacity:.8 } },
      { name:'净利率', type:'line', yAxisIndex:1, data: fin.map(f => f[4]), itemStyle:{ color:P.warn }, lineStyle:{ color:P.warn } }] });
  if (PE) mkChart($('#c6'), { animation:false, tooltip:{ trigger:'axis', confine:true, textStyle:{fontSize:11}, valueFormatter: x => x.toFixed(1) },
    grid:{ left:40, right:10, top:16, bottom:24 }, xAxis:{ type:'category', data: PE.d, ...ax }, yAxis:{ scale:true, ...ax },
    series:[{ name:'PE', type:'line', symbol:'none', data: PE.pe.map(x => +x.toFixed(2)), lineStyle:{ color:P.accent }, itemStyle:{ color:P.accent },
      markLine:{ silent:true, symbol:'none', lineStyle:{ type:'dashed', color:P.muted }, label:{ position:'insideStartTop', color:P.muted, fontSize:10, formatter: p => p.name + ' ' + p.value.toFixed(1) },
        data:[{ name:'中位数', yAxis:PE.med }] } }] });
}

/* ===== 新闻 ===== */
function tabNews(){
  const v = (D.val||{})[CUR.t] || {}, N = v.news;
  if (!N) return `<div class="explain"><p>还没有新闻整理，下次收盘更新会补上。</p></div>`;
  const tag = g => g === '+' ? '<span class="ntag p-up">利好</span>' : g === '-' ? '<span class="ntag p-down">利空</span>' : '<span class="ntag p-mute">中性</span>';
  const list = (arr) => (arr || []).map(n => `<div class="nrow">${tag(n[2])}<div><b>${n[3] ? `<a href="${esc(n[3])}" target="_blank" rel="noopener">${esc(n[1])}</a>` : esc(n[1])}</b>
    <div class="sub">${esc(n[0])}${n[4] ? ' · ' + esc(n[4]) : ''}</div></div></div>`).join('') || '<p class="sub">最近没有重要新闻。</p>';
  return `<div class="sec mute">公司新闻</div><div class="card" style="padding:4px 14px">${list(N.co)}</div>
    <div class="sec mute">行业政策与动态${N.indName ? ' · ' + esc(N.indName) : ''}</div><div class="card" style="padding:4px 14px">${list(N.ind)}</div>
    ${N.sum ? `<div class="explain"><h3>综合总结（AI 整理）</h3><p>${esc(N.sum)}</p></div>` : ''}
    <p class="foot">标题由 AI 译成中文，点开看原文。利好/利空是对公司基本面的影响判断，不是买卖建议。</p>`;
}

/* ===== 交互 ===== */
document.addEventListener('click', e => {
  const dt = e.target.closest('[data-dtab]'); if (dt && CUR) { CUR.tab = dt.dataset.dtab; drawSheet(); const b = document.querySelector(`[data-dtab="${CUR.tab}"]`); if (b) b.focus(); return; }
  const rg = e.target.closest('[data-range]'); if (rg && CUR) {
    RANGE = +rg.dataset.range; document.querySelectorAll('[data-range]').forEach(b => b.setAttribute('aria-pressed', b === rg));
    CHARTS.forEach(c => { const n = c.getOption().xAxis[0].data.length; c.dispatchAction({ type:'dataZoom', start: zoomStart(n), end: 100 }); }); return; }
  if (e.target.closest('#risk-go')) runRisk();
});

/* ===== 市场页：组合风险 ===== */
function riskSection(){
  return `<div class="sec mute">组合和大盘的关系</div>
    <div id="risk" class="explain"><p>用近一年日线计算每只持仓的 β 和相关系数，以及整个组合的 β。要读取 ${D.holdings.length + 2} 只股票的历史行情，需要几秒。</p>
    <button class="link-btn" id="risk-go" type="button" style="justify-content:center">开始计算</button></div>`;
}
function runRisk(){
  const el = $('#risk'); el.innerHTML = '<p class="sub">正在读取历史行情…</p>';
  const syms = [...new Set(D.holdings.map(r => r[0]))];
  Promise.all([getHist('SPY'), getHist('QQQ'), ...syms.map(s => getHist(s).catch(() => null))]).then(([S, Q, ...hs]) => {
    let val = 0, wb = 0, wq = 0, used = 0;
    const rows = syms.map((s, k) => { const h = hs[k]; const x = BY[s]; const mv = ROWS.filter(r => r.t === s).reduce((a, r) => a + r.qty * r.close, 0);
      const b = h ? TA.beta(h, S) : null, bq = h ? TA.beta(h, Q) : null; val += mv; if (b && bq) { wb += b.beta * mv; wq += bq.beta * mv; used += mv; }
      return { s, mv, b, bq, v: h ? TA.vol(h, 252) : null }; }).sort((a, b) => (b.bq?.beta ?? 0) - (a.bq?.beta ?? 0));
    const PB = wb / used, PQ = wq / used;
    el.innerHTML = `<h3>组合 β：对标普 ${PB.toFixed(2)} · 对纳指 ${PQ.toFixed(2)}</h3>
      <p>标普每涨跌 1%，你的组合平均涨跌约 ${PB.toFixed(1)}%。按市值加权，覆盖 ${(used / val * 100).toFixed(0)}% 的持仓。</p>
      <div class="tbl-wrap"><table class="tbl num"><thead><tr><th>代码</th><th>占比</th><th>β 纳指</th><th>相关</th><th>年化波动</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td><b>${esc(r.s)}</b></td><td>${(r.mv / val * 100).toFixed(1)}%</td><td>${r.bq ? r.bq.beta.toFixed(2) : '—'}</td><td>${r.bq ? r.bq.corr.toFixed(2) : '—'}</td><td>${r.v ? r.v.toFixed(0) + '%' : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="sub">β 大于 1 的股票放大大盘波动。相关系数越接近 1，越会和纳指同涨同跌。这些是过去一年的统计，会随时间变化。</p>`;
  }).catch(() => { el.innerHTML = failBox(); });
}
