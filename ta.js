/* 技术指标、历史统计、技术价位、β 计算。全部在浏览器里用日线算。 */
const TA = (() => {
  const sma = (a, n) => a.map((_, i) => i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((s, x) => s + x, 0) / n);
  const ema = (a, n) => { const k = 2 / (n + 1); let e = null; return a.map((x, i) => { e = i === 0 ? x : x * k + e * (1 - k); return e; }); };
  function boll(c, n = 20, m = 2) {
    const mid = sma(c, n), up = [], lo = [], pb = [];
    c.forEach((_, i) => {
      if (mid[i] == null) { up.push(null); lo.push(null); pb.push(null); return; }
      const w = c.slice(i - n + 1, i + 1), sd = Math.sqrt(w.reduce((s, x) => s + (x - mid[i]) ** 2, 0) / n);
      up.push(mid[i] + m * sd); lo.push(mid[i] - m * sd); pb.push(sd ? (c[i] - (mid[i] - m * sd)) / (2 * m * sd) : 0.5);
    });
    return { mid, up, lo, pb };
  }
  function macd(c) {
    const e12 = ema(c, 12), e26 = ema(c, 26), dif = c.map((_, i) => e12[i] - e26[i]), dea = ema(dif, 9);
    return { dif, dea, hist: dif.map((x, i) => 2 * (x - dea[i])) };
  }
  function rsi(c, n = 14) {
    const out = c.map(() => null); let g = 0, l = 0;
    for (let i = 1; i < c.length; i++) {
      const ch = c[i] - c[i - 1], up = Math.max(ch, 0), dn = Math.max(-ch, 0);
      if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = l ? 100 - 100 / (1 + g / l) : 100; } }
      else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = l ? 100 - 100 / (1 + g / l) : 100; }
    }
    return out;
  }

  function all(H) {
    const c = H.c;
    return { c, ma5: sma(c, 5), ma10: sma(c, 10), ma20: sma(c, 20), ma60: sma(c, 60), ma120: sma(c, 120), ma250: sma(c, 250),
      boll: boll(c), macd: macd(c), rsi: rsi(c) };
  }

  // 信号回测：事件发生后 N 个交易日的涨跌
  function backtest(c, idx, fwd = 20) {
    const r = idx.filter(i => i + fwd < c.length).map(i => (c[i + fwd] / c[i] - 1) * 100);
    if (!r.length) return { n: idx.length, done: 0 };
    return { n: idx.length, done: r.length, win: r.filter(x => x > 0).length / r.length * 100, avg: r.reduce((s, x) => s + x, 0) / r.length,
      worst: Math.min(...r), best: Math.max(...r) };
  }
  // 事件去重：同类事件 10 天内只算第一次
  const spaced = (idx, gap = 10) => idx.filter((x, k) => k === 0 || x - idx[k - 1] >= gap);
  function signals(H, I) {
    const c = H.c, n = c.length, R = I.rsi, M = I.macd, B = I.boll, ev = { rsiLow: [], rsiHigh: [], golden: [], death: [], bollUp: [], bollDn: [], ma60Up: [], ma60Dn: [] };
    for (let i = 1; i < n; i++) {
      if (R[i - 1] != null && R[i - 1] >= 30 && R[i] < 30) ev.rsiLow.push(i);
      if (R[i - 1] != null && R[i - 1] <= 70 && R[i] > 70) ev.rsiHigh.push(i);
      if (i > 34 && M.dif[i - 1] <= M.dea[i - 1] && M.dif[i] > M.dea[i]) ev.golden.push(i);
      if (i > 34 && M.dif[i - 1] >= M.dea[i - 1] && M.dif[i] < M.dea[i]) ev.death.push(i);
      if (B.lo[i - 1] != null && c[i - 1] < B.lo[i - 1] && c[i] >= B.lo[i]) ev.bollUp.push(i);
      if (B.up[i - 1] != null && c[i - 1] > B.up[i - 1] && c[i] <= B.up[i]) ev.bollDn.push(i);
      if (I.ma60[i - 1] != null && c[i - 1] < I.ma60[i - 1] && c[i] > I.ma60[i]) ev.ma60Up.push(i);
      if (I.ma60[i - 1] != null && c[i - 1] > I.ma60[i - 1] && c[i] < I.ma60[i]) ev.ma60Dn.push(i);
    }
    for (const k in ev) ev[k] = spaced(ev[k]);
    return ev;
  }

  // 当前技术面状态（只描述，不给买卖结论）
  function state(H, I) {
    const n = H.c.length - 1, c = H.c[n], out = [];
    const lo52 = Math.min(...H.l.slice(-252)), hi52 = Math.max(...H.h.slice(-252));
    const pos = (c - lo52) / ((hi52 - lo52) || 1) * 100;
    const add = (good, txt) => out.push({ good, txt });
    if (I.ma60[n] != null) add(c > I.ma60[n], c > I.ma60[n] ? '股价在 60 日均线上方' : '股价在 60 日均线下方');
    if (I.ma250[n] != null) add(c > I.ma250[n], c > I.ma250[n] ? '股价在 250 日（年）线上方' : '股价在 250 日（年）线下方');
    if (I.ma20[n] != null && I.ma60[n] != null && I.ma120[n] != null) {
      if (I.ma20[n] > I.ma60[n] && I.ma60[n] > I.ma120[n]) add(true, '均线多头排列（20 > 60 > 120 日）');
      else if (I.ma20[n] < I.ma60[n] && I.ma60[n] < I.ma120[n]) add(false, '均线空头排列（20 < 60 < 120 日）');
      else add(null, '均线交织，没有明确方向');
    }
    const r = I.rsi[n];
    if (r != null) add(r < 30 ? null : r > 70 ? null : r >= 50, `RSI ${r.toFixed(0)}` + (r < 30 ? '，超卖区' : r > 70 ? '，超买区' : r >= 50 ? '，偏强' : '，偏弱'));
    const M = I.macd; add(M.dif[n] > M.dea[n], M.dif[n] > M.dea[n] ? 'MACD 在信号线上方' : 'MACD 在信号线下方');
    const pb = I.boll.pb[n]; if (pb != null) add(null, pb < 0 ? '跌破布林下轨' : pb > 1 ? '突破布林上轨' : `布林带内 ${(pb * 100).toFixed(0)}% 位置`);
    return { pos, lo52, hi52, items: out, strong: out.filter(x => x.good === true).length, weak: out.filter(x => x.good === false).length };
  }

  // 摆动高低点
  function pivots(H, w = 5, look = 250) {
    const lows = [], highs = [], s = Math.max(w, H.c.length - look);
    for (let i = s; i < H.c.length - w; i++) {
      let lo = true, hi = true;
      for (let k = i - w; k <= i + w; k++) { if (H.l[k] < H.l[i]) lo = false; if (H.h[k] > H.h[i]) hi = false; }
      if (lo) lows.push(H.l[i]); if (hi) highs.push(H.h[i]);
    }
    return { lows, highs };
  }
  // 技术价位：把相距 2.5% 以内的价位合并成一个区间，记录来源
  function levels(H, I, extra = []) {
    const n = H.c.length - 1, c = H.c[n], cand = [];
    const push = (p, src) => { if (p && isFinite(p)) cand.push({ p, src }); };
    [['ma20', '20 日线'], ['ma60', '60 日线'], ['ma120', '120 日线'], ['ma250', '250 日线']].forEach(([k, t]) => push(I[k][n], t));
    push(I.boll.up[n], '布林上轨'); push(I.boll.lo[n], '布林下轨');
    push(Math.min(...H.l.slice(-252)), '52 周低点'); push(Math.max(...H.h.slice(-252)), '52 周高点');
    const P = pivots(H); P.lows.forEach(p => push(p, '前期低点')); P.highs.forEach(p => push(p, '前期高点'));
    // 斐波那契回撤：近一年最高点到最低点
    const hi = Math.max(...H.h.slice(-252)), lo = Math.min(...H.l.slice(-252));
    [0.382, 0.5, 0.618].forEach(f => push(hi - (hi - lo) * f, `斐波那契 ${f * 100}%`));
    extra.forEach(e => push(e.p, e.src));
    cand.sort((a, b) => a.p - b.p);
    const zones = [];
    cand.forEach(x => {
      const z = zones[zones.length - 1];
      if (z && x.p <= z.lo * 1.025) { z.hi = Math.max(z.hi, x.p); z.src.push(x.src); }
      else zones.push({ lo: x.p, hi: x.p, src: [x.src] });
    });
    zones.forEach(z => {
      const cnt = {}; z.src.forEach(s => cnt[s] = (cnt[s] || 0) + 1);
      z.labels = Object.entries(cnt).map(([s, k]) => k > 1 ? `${s}×${k}` : s);
      z.n = z.src.length; z.mid = (z.lo + z.hi) / 2;
    });
    const below = zones.filter(z => z.hi < c * 0.995).sort((a, b) => b.mid - a.mid).slice(0, 4);
    const above = zones.filter(z => z.lo > c * 1.005).sort((a, b) => a.mid - b.mid).slice(0, 4);
    below.forEach(z => z.touch = touches(H, z, 'dn')); above.forEach(z => z.touch = touches(H, z, 'up'));
    return { below, above, c };
  }
  // 过去两年股价从上方跌到（支撑）或从下方涨到（压力）这个区间的次数，以及之后 20 天的表现
  function touches(H, z, side) {
    const lo = z.lo * 0.99, hi = z.hi * 1.01, idx = [];
    for (let i = 1; i < H.c.length - 1; i++) {
      if (side === 'dn' && H.c[i - 1] > hi && H.l[i] <= hi && H.l[i] >= lo * 0.97) idx.push(i);
      if (side === 'up' && H.c[i - 1] < lo && H.h[i] >= lo && H.h[i] <= hi * 1.03) idx.push(i);
    }
    return backtest(H.c, spaced(idx, 15), 20);
  }

  // 日收益对齐后算 β、相关系数
  function returns(H, from) { const m = {}; for (let i = 1; i < H.c.length; i++) if (H.d[i] >= from) m[H.d[i]] = H.c[i] / H.c[i - 1] - 1; return m; }
  function beta(H, B, days = 252) {
    const from = H.d[Math.max(0, H.d.length - days)];
    const a = returns(H, from), b = returns(B, from), x = [], y = [];
    for (const d in a) if (d in b) { y.push(a[d]); x.push(b[d]); }
    if (x.length < 40) return null;
    const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
    let cov = 0, vx = 0, vy = 0; x.forEach((v, i) => { cov += (v - mx) * (y[i] - my); vx += (v - mx) ** 2; vy += (y[i] - my) ** 2; });
    const corr = cov / Math.sqrt(vx * vy);
    return { beta: cov / vx, corr, r2: corr * corr, n: x.length };
  }
  const ret = (H, days) => { const n = H.c.length - 1; return n >= days ? (H.c[n] / H.c[n - days] - 1) * 100 : null; };
  const vol = (H, days = 60) => { const n = H.c.length; const r = []; for (let i = Math.max(1, n - days); i < n; i++) r.push(Math.log(H.c[i] / H.c[i - 1])); const m = r.reduce((s, v) => s + v, 0) / r.length; return Math.sqrt(r.reduce((s, v) => s + (v - m) ** 2, 0) / (r.length - 1) * 252) * 100; };

  // 财报后股价反应：盘后公布看下一交易日，盘前公布看当天
  function earnReact(H, eps) {
    return (eps || []).filter(e => e[3] != null).map(e => {
      const [date, timing] = e; const i = H.d.findIndex(d => d >= date);
      if (i < 0) return null;
      // d0 = 公布前最后一个收盘日
      const d0 = (timing === 'pm' && H.d[i] === date) ? i : i - 1;
      const d1 = d0 + 1;
      if (d0 < 0 || d1 >= H.c.length) return { e, r1: null, r5: null };
      return { e, r1: (H.c[d1] / H.c[d0] - 1) * 100, r5: d0 + 5 < H.c.length ? (H.c[d0 + 5] / H.c[d0] - 1) * 100 : null };
    }).filter(Boolean);
  }
  // 历史 PE（用最近 4 季调整后 EPS 滚动）
  function peHistory(H, eps) {
    const done = (eps || []).filter(e => e[3] != null).sort((a, b) => a[0] < b[0] ? -1 : 1);
    if (done.length < 4) return null;
    const out = { d: [], pe: [] };
    H.d.forEach((d, i) => {
      const past = done.filter(e => e[0] < d); if (past.length < 4) return;
      const ttm = past.slice(-4).reduce((s, e) => s + e[3], 0); if (ttm <= 0) return;
      out.d.push(d); out.pe.push(H.c[i] / ttm);
    });
    if (out.pe.length < 20) return null;
    const s = [...out.pe].sort((a, b) => a - b), q = p => s[Math.floor(p * (s.length - 1))];
    return { ...out, min: s[0], max: s[s.length - 1], med: q(0.5), now: out.pe[out.pe.length - 1] };
  }

  // 白话解读：把当前状态翻成几句话，并找过去两年"类似状态"出现后 20 天的表现
  function plain(H, I, S) {
    const n = H.c.length - 1, c = H.c[n], r = I.rsi[n];
    const above60 = c > I.ma60[n], above250 = I.ma250[n] != null ? c > I.ma250[n] : null;
    const rb = x => x == null ? null : x < 30 ? 0 : x < 45 ? 1 : x <= 55 ? 2 : x <= 70 ? 3 : 4;
    const trend = above250 === null ? (above60 ? '最近三个月整体在涨' : '最近三个月整体在跌')
      : above60 && above250 ? '中长期都在上升趋势里' : !above60 && !above250 ? '中长期都在下跌趋势里'
      : above250 ? '长期还在上升，但最近三个月走弱了' : '长期偏弱，但最近三个月在反弹';
    const where = S.pos < 15 ? '价格接近一年里的最低点' : S.pos > 85 ? '价格接近一年里的最高点' : S.pos < 40 ? '价格在一年区间的偏低位置' : S.pos > 60 ? '价格在一年区间的偏高位置' : '价格在一年区间的中间';
    const mood = r == null ? '' : r < 30 ? '短期跌得非常急，市场情绪恐慌（超卖）' : r < 45 ? '短期偏弱' : r <= 55 ? '短期没有明显方向' : r <= 70 ? '短期偏强' : '短期涨得非常急，市场情绪亢奋（超买）';
    // 类似状态：同在 60 日线同一侧、RSI 在同一档
    const idx = [];
    for (let i = 60; i < n - 20; i++) if (I.rsi[i] != null && I.ma60[i] != null && (H.c[i] > I.ma60[i]) === above60 && rb(I.rsi[i]) === rb(r)) idx.push(i);
    const pick = []; idx.forEach(i => { if (!pick.length || i - pick[pick.length - 1] >= 5) pick.push(i); });
    const bt = backtest(H.c, pick, 20);
    const tone = (above60 ? 1 : -1) + (above250 === null ? 0 : above250 ? 1 : -1);
    const head = tone >= 2 ? '走势强' : tone <= -2 ? '走势弱' : '走势分化';
    return { head, trend, where, mood, bt, tone };
  }

  return { all, signals, backtest, state, levels, beta, ret, vol, earnReact, peHistory, plain };
})();
