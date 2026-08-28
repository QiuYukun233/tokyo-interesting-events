# 东京有点意思 — 给 Claude 的项目说明

一个东京事件发现站。产品定位不是活动搜索引擎，而是**现实世界版的 Steam 探索队列**：
从大量候选中持续生成有限、解释充分、值得逐个判断的队列，再用朋友间的共同兴趣把
"发现"推进到"成行"。完整产品方案见 `docs/信息雷达与探索队列方案.md`。

**当前进度：阶段 1（信息雷达）。** 抓取管线能出数据，来源健康监测与候选诊断台已就位；
发布闸门和探索队列还不存在。

## 常用命令

```bash
npm test                     # node:test，覆盖 lib/ 和 scripts/ 下全部 *.test.mjs
npm run lint                 # eslint
npm run update-events        # 抓取，把候选写进 data/pool.db（不发布任何东西）
npm run apply-gate           # 自动规则判决事实性不合格的候选
npm run review               # 本地后台 http://127.0.0.1:4321，人工放行/排除
npm run export-site          # 池子 → data/events.json（已发布）+ backstage.json
npm run check-sources        # 读注册表报来源健康；有严重告警则退出码非 0
npm run collect-shop-changes # 单独跑开闭店采集
npm run dev                  # 本地站点
npm run build                # 构建
```

`npm run update-events` 会**真实访问外部站点**。改解析器时优先靠单测里的 HTML 夹具验证，
不要为了看一眼结果就反复打真站。

## 目录约定

| 路径 | 职责 |
|---|---|
| `app/` | 前台页面（Next.js / vinext）。直接 import `data/events.json`，无运行时抓取 |
| `data/pool.db` | **候选池，记录之源**（SQLite）。`events.json` 与 `backstage.json` 都是它的导出 |
| `data/` | 管线产物 + 人工数据。字段定义见 `docs/数据契约.md` |
| `lib/` | 与抓取无关的纯逻辑：过滤、去重、契约校验、来源健康、编辑标注 |
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
npm run update-events
  → scripts/sources/index.mjs        来源注册表（11 条 + 开闭店家族 15 版）
  → scripts/lib/run-ingestion.mjs    robots 校验 → 并发抓取 → 按 accessMethod 解析
      → lib/activity-filter.mjs      算理由码（不再决定发布）
      → lib/pool-db.mjs              upsert 进 candidates 表
  → data/pool.db                     ← 记录之源
  → data/review-events.json          诊断队列
  → data/source-registry.json        来源健康

npm run apply-gate    → lib/gate.mjs 对 pending 应用规则，写 decisions（decidedBy: rule:…）
npm run review        → 本地后台，人工写 decisions（decidedBy: human）
npm run export-site   → data/events.json（只含 published）+ data/backstage.json（整池，分类）
```

**最要紧的一条规矩：抓取只写 `candidates`，判决只写 `decisions`。**
没有判决行的候选就是 pending，所以重抓永远不会撤销任何人的决定，
也没有任何抓取代码路径能让东西上前台。见 `docs/决策记录/0003-候选池与后台.md`。

**推论（0004）：任何采集脚本的唯一写入口是 `upsertCandidate()`。**
不写 `data/events.json`、不写 `data/review-events.json`、不自行判决发布。
手动触发的 `collect-*.mjs` 也一样，手动不是绕开规矩的理由。
开闭店链路曾经违反这条并因此白跑了很久，见
`docs/决策记录/0004-采集脚本一律写池子.md`。

详细说明见 `docs/架构.md`。事件记录的字段契约见 `docs/数据契约.md`，
来源逐个的状态见 `docs/来源清单.md`。

## 已知问题

1. **候选积压在后台等人判是常态，出路是从判决里长出更多规则。** 这是 0002
   警告过的问题（人工队列会淹没审批者）。本地后台底部的判据面板就是为此存在的。
   目前两条规则：`rule:trade_only_admission`（主办方声明的入场对象）、
   `rule:not_a_destination`（内容类型不是可去处，2026-08-28 从第一轮判决拆出，
   见 `决策记录/0003-候选池与后台.md` 附录）。taste 类判断仍然留给人。
2. **前台只有 30 条**，因为只有扩源前既有的那批被追认为已发布。
   池子里还有 126 条待定。
3. **前台一次渲染整个已发布集合。** `app/page.tsx` 与 `app/pool/page.tsx`
   都全量铺开。方案 §7 的探索队列（每轮 12–20 项）本来就是解决这个的，
   但它还不存在。
4. **候选量距漏斗目标仍有差距。** 池子 236 条候选。方案 §10 的目标是
   每周 1,000 条原始候选。六个来源家族里只剩「新运动」还偏薄。
   方案与实测见 `docs/信息获取管道设计.md`。
5. **餐饮、影视、剧本杀、手作五个品类目前仍未覆盖；剧场已接。**
   CoRich舞台芸術！已上线（386 条候选，全部待判），不按类型过滤——演剧、音乐剧、
   落语、能楽、2.5次元舞台混着来，长尾是刻意的。HotPepper（餐厅）、
   mdms-mania.com（剧本杀）调研过路径干净但尚未实现；映画.com（电影）与 Craftie
   （手作工坊）明确被利用规约挡住，不接；餐厅定期菜单和拼豆没有找到可规模化入口。
   见 `docs/信息获取管道设计.md` 第二轮、`docs/信息卡片设计参考.md`。
