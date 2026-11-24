# 股票助手

个人持仓看板：今日持仓异动、市场风格（进攻/防御板块）、观察清单、捡漏雷达、财报和经济日历。

- 纯静态网页，部署在 Vercel。
- 持仓数据保存在 `data.enc.json`，已用密码加密（AES-256-GCM + PBKDF2）。没有密码只能看到解锁页。
- 明文 `data.json` 只在生成数据时临时存在，已写进 `.gitignore`，不会提交。

## 更新数据

云端定时任务每天从 Robinhood 拉数据，生成 `data.json`，然后：

```
PASSCODE='密码' node scripts/encrypt.mjs
git add data.enc.json && git commit -m "data: 更新" && git push
```

Vercel 检测到推送后自动重新部署。

## 历史行情（图表用）
GitHub Action `.github/workflows/history.yml` 在开盘前、收盘后和每次数据更新后，从 Yahoo Finance 下载两年日线，
推送到 `hist` 分支。文件名是 HMAC(密码, 代码)，看不出持仓。需要在仓库 Settings → Secrets and variables → Actions
里设置 `PASSCODE`（和网页解锁密码相同）。以后改密码时这里也要一起改。
