# 东京有点意思

一个把“找活动”和“找搭子”放在一起的东京事件发现站。先让共同想做的一件事成为见面的理由，再决定要不要继续认识。

## 数据更新

`npm run update-events` 会读取东京都官方 My TOKYO RSS，抽取包含明确未来日期的活动公告，按来源链接去重并更新 `data/events.json`。`.github/workflows/update-events.yml` 每天日本时间 07:10 自动运行。来源适配器与页面解耦，后续可继续增加 GO TOKYO、区级文化馆和独立场地的公开源。

`data/manual-events.json` 用于放编辑精选，格式与 `data/events.json` 中单条活动一致。抓取前应先检查来源的 robots.txt 与使用条款；站点只保留摘要并始终链接回主办方。

## 本地使用

```bash
npm run dev
npm run update-events
npm run build
```
