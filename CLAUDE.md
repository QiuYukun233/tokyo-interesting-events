# 东京有点意思 — 给 Claude 的项目说明

一个东京事件发现站。产品定位不是活动搜索引擎，而是**现实世界版的 Steam 探索队列**：
从大量候选中持续生成有限、解释充分、值得逐个判断的队列，再用朋友间的共同兴趣把
"发现"推进到"成行"。完整产品方案见 `docs/信息雷达与探索队列方案.md`。

**当前进度：阶段 2（探索队列云端半边已落地，待部署）。** 抓取管线能出数据，来源健康监测与
候选诊断台已就位；tag 词表、tags 表、打 tag 脚本、队列引擎纯函数（`lib/queue.mjs`）已建。
云端半边（Turso 镜像、votes/rounds、队列 API、`/queue` 与 `/wantlist` 两页）已按
`docs/探索队列设计.md` 实现，本地 dev 全链路可用；部署未做。
闸门已按 0006 降级为纯事实闸门：品味不再是判决问题。

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
npm run tag-candidates       # 廉价模型批量打 tag（--dry-run 预览 / --retag 整批重打）
npm run push-cloud           # 候选+分数单向上行 Turso（--dry-run 只报数量）
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

npm run apply-gate     → lib/gate.mjs 对 pending 应用规则，写 decisions（decidedBy: rule:…）
npm run review         → 本地后台，人工写 decisions（decidedBy: human）
npm run tag-candidates → 廉价模型打 tag，只写 tags 表（taggedBy: ai:…）
npm run push-cloud     → Turso 镜像（事实合格集合 + score + tags；votes/rounds 只在云端）
npm run export-site    → data/events.json（只含 published）+ data/backstage.json（整池，分类）
```

**最要紧的一条规矩：抓取只写 `candidates`，判决只写 `decisions`，打 tag 只写 `tags`。**
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

0. **闸门已按 0006 降级为纯事实闸门，积压不再逐条人判。** `decisions` 只回答
   「能不能收录」；品味交给探索队列的云端 votes（`docs/探索队列设计.md`）。
   0005 的廉价模型初判范围随之变窄：只初判事实合格性。
   `scripts/undecide-batch.mjs` 能整批撤回某个 `decidedBy` 的判决；
   `scripts/tag-candidates.mjs --retag` 能整批重打 tag。
1. **事实规则继续从判决里长**（0002）：目前 `rule:trade_only_admission`、
   `rule:not_a_destination`、`rule:not_open_to_public`。判据面板只统计人的判决。
2. **探索队列云端半边已落地**（Turso 镜像、votes/rounds、队列 API 三条路由、
   `/queue` 与 `/wantlist` 两页，token 保护），本地 dev 全链路可用；**部署还没做**——
   仓库是 vinext + Cloudflare Workers 家底，部署去向（现平台/自有 CF/迁 Vercel）待定，
   见计划二 Task 8 决策点。旧前台两页（`app/page.tsx` / `app/pool/page.tsx`）未替换，
   等部署定了再动。
3. **打 tag 已真实跑过一轮**（2026-09-01，deepseek-chat 走 Anthropic 兼容端点，
   需 `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`）：874 条全部入 tags 表。
   新抓的候选再跑 `npm run tag-candidates` 即可增量补打。
6. **候选的粒度还只做到「一个地址一个候选」。** 更模糊的边界——同一片区的
   一批店、同一天开放的一批工厂——现在没有合并，因为"多近算一趟"是产品判断。
   见方案 §4.3；做探索队列时大概需要在"地点"之上再有一个"行程"层。
4. **候选量距漏斗目标仍有差距。** 池子 236 条候选。方案 §10 的目标是
   每周 1,000 条原始候选。六个来源家族里只剩「新运动」还偏薄。
   方案与实测见 `docs/信息获取管道设计.md`。
5. **餐饮、影视、手作三个品类目前仍未覆盖；剧场、剧本杀已接。**
   CoRich舞台芸術！已上线（386 条候选，全部待判），不按类型过滤——演剧、音乐剧、
   落语、能楽、2.5次元舞台混着来，长尾是刻意的。マダミスマニア（mdms-mania.com）
   已接（`scripts/collect-mdms-mania.mjs`，21 家东京剧本杀店当作 `place` 候选，
   一家店一个候选，非每日抓取——这是手写文章不是事件流，门店变化按月计不按天计）。
   HotPepper（餐厅）需要先注册官方 API key（外部账号动作，尚未做）；映画.com
   （电影）与 Craftie（手作工坊）明确被利用规约挡住，不接；餐厅定期菜单和拼豆
   没有找到可规模化入口。见 `docs/信息获取管道设计.md` 第二轮、`docs/信息卡片设计参考.md`。
