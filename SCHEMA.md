# data.json 格式

所有百分比是数字（−7.6 表示 −7.6%），价格是美元数字。缺数据用 `null`，不要编。

```jsonc
{
  "asOf": "2026-11-05",                       // 数据日期
  "asOfLabel": "11月5日 周四 · 收盘快照",       // 顶部显示；盘前运行写"· 盘前"
  "banner": { "title": "一句话大盘", "text": "两三句原因，附带今天最重要的事" },  // 平静的日子可为 null
  "totals": { "label": "总市值（个人 + Roth IRA）", "value": 76496, "dayAbs": -6261, "dayPct": -7.6, "vsCost": -15.4 },

  // 所有账户合并后的持仓：代码, 中文名, 股数, 平均成本(Robinhood average_buy_price), 最新收盘, 前一日收盘, 盘后/盘前最新价, 账户
  "holdings": [["MU","美光",6,998.86,656.39,795.23,695.39,"个人"]],

  // 估值：type ∈ growth|cyclical|loss|value|bank|income|reit|etf|lev
  // pe=TTM市盈率, fpe=远期市盈率(没有就 null), ps=市值/过去4季营收, g=最近一季营收同比%, nm=最近一季净利率%, pb, dy=股息率%
  // key=这类股票重点看的指标(pe|fpe|ps|nm|pb|dy), note=一两句只讲事实的数字说明, ai=可选：今日解读(观点，需标明依据)
  "val": { "MU": {"type":"cyclical","pe":10.7,"fpe":null,"ps":5.6,"g":379,"nm":69.5,"pb":6.5,"dy":0.07,"key":"nm","note":"…","ai":null} },

  "earnNext": { "NBIS": "11月12日 盘前" },     // 未来两周持仓财报
  "watchSource": "AI connectivity",           // Robinhood 观察清单名
  "watch": [["ALAB",179.47,499.48,97.89,""]], // 代码, 现价, 52周高, 52周低, 标签(如"今天盘后财报"、"低于 52 周低点"，没有就"")
  "radar": [["NOW","ServiceNow",102.30,113,27.8]], // 扫描器"捡漏雷达"：代码, 中文名, 现价, 市值(十亿美元), RSI；只列市值≥500亿、未持有，按 RSI 升序前 10
  "earnings": [["11月12日 周四", [["NBIS","盘前","held"],["AMD","盘后","watch"]]]],

  // 板块 ETF：代码, 中文名, off|def, 今日%, 近一周%(5个交易日), 近一月%(约21个交易日)
  "sectors": [["XLK","科技","off",-8.0,-14.0,-19.2]],  // XLK XLY XLC XLF XLI XLE XLB 为 off；XLV XLP XLU XLRE 为 def
  "spyRet": [-4.4,-4.7,-5.4],                 // SPY 今日/近一周/近一月

  "news": [["11/5 周四","标题","一两句中文要点，自己的话，不抄原文"]],  // 3–5 条，与市场或持仓相关
  "newsSource": { "label": "来源名，日期", "url": "https://…" },
  "cal": [["11/6","周五","10 月非农就业报告","为什么重要，一句话"]]   // 未来约 5 周的重要经济数据和美联储会议，第一条是最近的
}
```
