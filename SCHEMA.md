# data.json 格式（加密前的明文）

所有百分比是数字（−7.6 表示 −7.6%），价格是美元数字。缺数据用 `null`，不要编。

```jsonc
{
  "asOf": "2026-11-05",                       // 数据日期
  "asOfLabel": "11月5日 周四 · 收盘快照",       // 顶部显示；盘前运行写"· 盘前"
  "banner": { "title": "一句话大盘", "text": "两三句原因，附带今天最重要的事" },  // 平静的日子可为 null
  "totals": { "label": "总市值（个人 + Roth IRA）", "value": 76496, "dayAbs": -6261, "dayPct": -7.6, "vsCost": -15.4 },

  // 所有账户合并后的持仓：代码, 英文公司名（如 "Micron Technology"，不要中文名）, 股数, 平均成本(Robinhood average_buy_price), 最新收盘, 前一日收盘, 盘后/盘前最新价, 账户
  "holdings": [["MU","Micron Technology",6,998.86,656.39,795.23,695.39,"个人"]],

  // 估值：type ∈ growth|cyclical|loss|value|bank|income|reit|etf|lev
  // pe=TTM市盈率, fpe=远期市盈率（见下方"远期市盈率"说明，查不到才 null）, ps=市值/过去4季营收, g=最近一季营收同比%, nm=最近一季净利率%, pb, dy=股息率%
  // key=这类股票重点看的指标(pe|fpe|ps|nm|pb|dy), note=一两句只讲事实的数字说明, ai=可选：今日解读(观点，需标明依据)
  // why=今天涨跌的原因（每只持仓都要写）：text 两三句中文，说清是什么新闻/事件、谁报道的，
  //     例如"据 Reuters 报道，…"；只是跟着板块或大盘走就直说"没有个股消息，跟随半导体板块下跌"。
  //     src 是 1–3 个 [来源名, 网址]。不确定原因时写"没找到明确原因"，不要编。
  "val": { "MU": {"type":"cyclical","pe":10.7,"fpe":null,"ps":5.6,"g":379,"nm":69.5,"pb":6.5,"dy":0.07,"key":"nm","note":"…","ai":null,
                  "why":{"text":"…","src":[["CNBC","https://…"]]}} },

  "earnNext": { "NBIS": "11月12日 盘前" },     // 未来两周持仓财报
  // 观察：Robinhood 里所有 owner_type=custom 的股票清单（不含期权清单、加密货币清单和 Robinhood 官方清单），
  // 合并去重，去掉已持有的。lists 是这只股票所在的清单名。
  "watchLists": ["AI connectivity","My First List","rednote"],
  "watch": [{"s":"ALAB","n":"Astera Labs","p":179.47,"pc":168.8,"hi":499.48,"lo":97.89,"tag":"","lists":["AI connectivity"]}],
  //  s 代码, n 英文名, p 最新收盘, pc 前一日收盘, hi/lo 52 周高低, tag 标签（"今天盘后财报"、"低于 52 周低点"、"创 52 周新高"，没有就""）
  "watchWhy": { "ALAB": {"text":"…","src":[["来源","https://…"]]} },  // 只给今日涨跌 ≥5% 的观察股写原因，格式同 val.why
  "radar": [["NOW","ServiceNow",102.30,113,27.8]], // 扫描器"捡漏雷达"：代码, 英文公司名, 现价, 市值(十亿美元), RSI；只列市值≥500亿、未持有，按 RSI 升序前 10
  // 每只捡漏股的分析（见下方"捡漏分析怎么写"）
  "radarInfo": { "NOW": {
    "verdict": "cheap",          // cheap=看起来是真便宜 | mixed=一半一半 | trap=更像是公司变差了
    "view": "两三句结论：为什么这么判断，关键要盯什么",
    "fell": "两三句事实：最近为什么跌（财报、指引、竞争、行业、宏观），谁报道的",
    "bull": ["支持便宜的理由，每条一句，最多 3 条"],
    "bear": ["担心的理由，每条一句，最多 3 条"],
    "off52": -45.2, "m1": -18.0,  // 距 52 周高点 %、近一月 %
    "pe": 60.1, "fpe": 32.5, "ps": 8.1, "g": 21,
    "analyst": {"buy":40,"hold":6,"sell":1,"target":150.0,"lo":110.0,"hi":190.0},  // get_equity_analyst_ratings
    "src": [["来源名","https://…"]]
  } },
  "earnings": [["11月12日 周四", [["NBIS","盘前","held"],["AMD","盘后","watch"]]]],

  // 板块 ETF：代码, 中文名, off|def, 今日%, 近一周%(5个交易日), 近一月%(约21个交易日)
  "sectors": [["XLK","科技","off",-8.0,-14.0,-19.2]],  // XLK XLY XLC XLF XLI XLE XLB 为 off；XLV XLP XLU XLRE 为 def
  "spyRet": [-4.4,-4.7,-5.4],                 // SPY 今日/近一周/近一月

  "news": [["11/5 周四","标题","一两句中文要点，自己的话，不抄原文"]],  // 3–5 条，与市场或持仓相关
  "newsSource": { "label": "来源名，日期", "url": "https://…" },
  "cal": [["11/6","周五","10 月非农就业报告","为什么重要，一句话"]]   // 未来约 5 周的重要经济数据和美联储会议，第一条是最近的
}
```

## 远期市盈率（fpe）怎么取

Robinhood 不提供。用 WebSearch 搜 "stockanalysis.com {代码} statistics"，WebFetch 结果里的 stockanalysis.com/stocks/{代码}/statistics 页面，读 Forward PE 和页面数据日期。
网站数据常滞后几天，必须换算到最新价格：远期 EPS = 页面数据日期那天的收盘价 ÷ 页面 Forward PE；fpe = 最新收盘价 ÷ 远期 EPS（保留一位小数）。
页面写 n/a、亏损或查不到时填 null。ETF 不需要。成长股和周期股的 key 不变，但 note 里可以对比 PE 和远期 PE（远期明显更低 = 分析师预计利润继续增长）。

## 捡漏分析怎么写

目的：回答"它是真便宜，还是公司不行了"。每只都要查：
1. 为什么跌：WebSearch 最近一两个月的新闻（财报、业绩指引、管理层、竞争、监管、行业周期、宏观），用自己的话写，标明来源。
2. 数字：营收增速和利润率在变好还是变差（get_financials 最近几季），PE/远期 PE/PS 和自身过去比，跌幅多少（距 52 周高点、近一月）。
3. 分析师：get_equity_analyst_ratings 的买入/持有/卖出人数和目标价区间；如有最近的大幅下调评级或目标价，在 fell 里提。
判断规则（view 里说清依据）：
- cheap：业务没坏（营收还在增长、利润率稳定、指引没大降），主要是情绪、板块轮动或短期一次性因素拖累，估值低于自身常态。
- trap：基本面在变差（营收下滑或增速大降、利润率收缩、指引下调、失去份额、结构性威胁），低估值是在反映这些。
- mixed：两边证据都有，或要看下一个事件（财报、政策、商品价格）。
周期股（能源、炼油、存储、航运）低 PE 常出现在利润顶部，要说明周期位置。
这是 AI 观点，用"看起来""更像"这类措辞，不写"应该买/卖"。不确定就选 mixed 并说明缺什么信息。
