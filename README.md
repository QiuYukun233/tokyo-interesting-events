# 东京有点意思

一个把"找活动"和"找搭子"放在一起的东京事件发现站。先让共同想做的一件事成为见面的理由，
再决定要不要继续认识。

产品方案见 [`docs/信息雷达与探索队列方案.md`](docs/信息雷达与探索队列方案.md)。
上手改代码前先读 [`CLAUDE.md`](CLAUDE.md)，文档全览见 [`docs/README.md`](docs/README.md)。

## 本地使用

```bash
npm install
npm run dev                  # 本地站点
npm test                     # 全部单测
npm run lint
npm run build
```

## 数据更新

```bash
npm run update-events        # 抓取 9 个来源，写 data/events.json 与 data/review-events.json
npm run collect-shop-changes # 单独跑开闭店采集
```

`.github/workflows/update-events.yml` 每天日本时间 07:10 自动运行，先跑测试再抓取。
来源逐个的状态见 [`docs/来源清单.md`](docs/来源清单.md)，管线结构见
[`docs/架构.md`](docs/架构.md)。

`data/manual-events.json` 用于放编辑精选，格式与 `data/events.json` 中单条活动一致。
抓取前会自动校验来源的 `robots.txt`；站点只保留摘要并始终链接回主办方。
