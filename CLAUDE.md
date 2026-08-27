# 东京有点意思 — 给 Claude 的项目说明

一个东京事件发现站。产品定位不是活动搜索引擎，而是**现实世界版的 Steam 探索队列**：
从大量候选中持续生成有限、解释充分、值得逐个判断的队列，再用朋友间的共同兴趣把
"发现"推进到"成行"。完整产品方案见 `docs/信息雷达与探索队列方案.md`。

**当前进度：阶段 1（信息雷达）的前半段。** 抓取管线能出数据，编辑后台和探索队列都还不存在。

## 常用命令

```bash
npm test                    # node:test，覆盖 lib/ 和 scripts/ 下全部 *.test.mjs
npm run lint                # eslint
npm run update-events       # 跑抓取管线，写 data/events.json + data/review-events.json
npm run collect-shop-changes # 单独跑开闭店采集
npm run dev                 # 本地站点
npm run build               # 构建
```

`npm run update-events` 会**真实访问外部站点**。改解析器时优先靠单测里的 HTML 夹具验证，
不要为了看一眼结果就反复打真站。

## 目录约定

| 路径 | 职责 |
|---|---|
| `app/` | 前台页面（Next.js / vinext）。直接 import `data/events.json`，无运行时抓取 |
| `data/` | 管线产物 + 人工数据。见下方"数据文件" |
| `lib/` | 与抓取无关的纯逻辑：过滤、去重、契约校验、发布策略、编辑文案 |
| `scripts/sources/` | **每个来源一个适配器**，导出 `parseXxx(html, source)`，旁边放同名 `.test.mjs` |
| `scripts/lib/` | 管线骨架（`run-ingestion.mjs`）与共用工具（`event-utils.mjs`） |
| `scripts/*.mjs` | 可执行入口 |
| `docs/` | 方案、架构、契约、来源清单、决策记录 |
| `research/` | 调研笔记，不参与构建 |

## 代码约定

**不要用文件名做版本管理。** 不允许出现 `foo-v2.mjs`、`index-v3.mjs`、`update-events-v6.mjs`。
需要改写就改原文件，用 git 保留历史。这条规矩的来由见
`docs/决策记录/0001-收敛版本树.md`——2026-08-28 之前仓库里堆了 6 代平行副本，
真正生效的只有一条链，另外五条的测试还在红着，测试信号因此完全失效。

其余约定：
- 每个 `.mjs` 模块旁边放同名 `.test.mjs`，用 `node:test` + `node:assert/strict`。
- 解析器的测试用**内联 HTML 夹具**，不打网络。
- 新来源必须先确认 `robots.txt` 与使用条款；管线自身会在抓取前校验 robots（`run-ingestion.mjs`）。
- 站点只保留摘要，始终链接回主办方。
- 代码与注释用英文（沿用既有文件），文档与提交信息用汉语。

## 数据流

```
scripts/update-events.mjs
  → scripts/sources/index.mjs        9 个来源的注册数组
  → scripts/lib/run-ingestion.mjs    robots 校验 → 并发抓取 → 解析
      → lib/activity-filter.mjs      硬排除 / 分流 / 去重
      → 合并 manual + existing + fetched，按 180 天窗口与 80 条上限截断
  → data/events.json        前台读这份
  → data/review-events.json 编辑候选箱（目前没有任何界面消费）
```

详细说明见 `docs/架构.md`。事件记录的字段契约见 `docs/数据契约.md`，
来源逐个的状态见 `docs/来源清单.md`。

## 已知问题

1. **`review` 判定不拦截发布。** `lib/activity-filter.mjs` 只把 `exclude` 挡在外面，
   `review` 的条目照样进 `events.json` 上前台。这与方案 §2「爬虫的任务是发现候选，
   不是直接发布」冲突。
2. **`review` 条目多数没有理由。** 最近一次运行 33 条待审里 26 条 `reasons` 为空——
   它们只是没命中 `PUBLIC_EXPERIENCE_PATTERNS`，编辑看不到为什么。
3. **早稲田大学来源常年 403**（robots.txt 返回 403，管线按"不可抓"处理）。
4. **来源没有注册表**。方案 §3.3 要求的 `source_registry`（解析器版本、失败连击、
   条数异常下降告警）尚未实现，来源静默失效只体现为 JSON 里一行 `ok:false`。
