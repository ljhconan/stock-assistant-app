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
