#!/usr/bin/env node
/**
 * Local back office. `npm run review` → http://127.0.0.1:4321
 *
 * The writable half of the back office. `/backstage` on the site shows the same
 * pool read-only; this is where candidates are actually promoted or rejected.
 *
 * Local-only on purpose: the site is a static build from files in git, and
 * editorial judgement belongs in git too. Decisions go straight into
 * data/pool.db, so a session ends as a normal commit — no backend, no auth, no
 * infrastructure. Binds to loopback; no dependencies beyond node builtins.
 *
 * Publishing here does not change the site until `npm run export-site` runs.
 * That separation is deliberate: deciding and shipping are different acts.
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { REASON_LABELS } from '../lib/activity-filter.mjs';
import { OBJECT_TYPES, OBJECT_TYPE_LABELS } from '../lib/object-type.mjs';
import { agreementByObjectType, agreementByReason, agreementBySource, coverage, gateProjection, humanCoverage } from '../lib/gate-evidence.mjs';
import { decide, listCandidates, openPool, poolSummary, undecide } from '../lib/pool-db.mjs';
import { rankByLearningValue } from '../lib/learning-value.mjs';
import { rankCandidates, weightsFromEvidence } from '../lib/ranking.mjs';

const POOL = new URL('../data/pool.db', import.meta.url);
const PORT = Number(process.env.REVIEW_PORT || 4321);

const pool = openPool(fileURLToPath(POOL));

const state = () => {
  const raw = listCandidates(pool, { horizonDays: 180 });
  const byReason = agreementByReason(raw);
  // Order for judging, not by date: weights come from what has actually been
  // published so far, and one candidate per venue is shown before the second of
  // any venue. Without that, 708 stalls of one craft fair fill the screen and
  // the rest of the pool is never reached. See lib/ranking.mjs.
  const candidates = rankCandidates(raw, { weights: weightsFromEvidence(byReason) });
  // A second queue, ordered by what a decision teaches rather than by what is
  // likely to be good. The reviewer is the bottleneck, so this is where a
  // session should usually start — see lib/learning-value.mjs.
  const score = new Map(candidates.map((candidate) => [candidate.id, candidate.score]));
  const learning = rankByLearningValue(candidates, {
    tiebreak: (a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || String(a.id).localeCompare(String(b.id)),
  });
  return {
    objectTypes: OBJECT_TYPES.map((type) => ({ type, label: OBJECT_TYPE_LABELS[type] })),
    reasonLabels: REASON_LABELS,
    summary: poolSummary(pool),
    candidates,
    learningQueue: learning.slice(0, 200),
    evidence: {
      coverage: coverage(candidates),
      humanCoverage: humanCoverage(candidates),
      byReason,
      bySource: agreementBySource(candidates),
      byObjectType: agreementByObjectType(candidates),
      projection: gateProjection(candidates),
    },
  };
};

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

// Collect Buffers and decode once: a note in Japanese or Chinese can put a
// multi-byte character across a chunk boundary, and per-chunk decoding mangles it.
const readBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > 1e6) return reject(new Error('body too large'));
    chunks.push(chunk);
  });
  request.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
  });
  request.on('error', reject);
});

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`);

    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return response.end(PAGE);
    }
    if (request.method === 'GET' && url.pathname === '/api/state') return json(response, 200, state());

    if (request.method === 'POST' && url.pathname === '/api/decide') {
      const { id, state: next, note, decidedBy } = await readBody(request);
      if (next === null) undecide(pool, id);
      else decide(pool, id, { state: next, decidedBy: decidedBy || 'human', note: note || null });
      return json(response, 200, { ok: true, ...state() });
    }

    json(response, 404, { error: 'not found' });
  } catch (error) {
    json(response, 500, { error: String(error?.message || error) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const { pending, published, rejected } = poolSummary(pool);
  console.log(`后台  http://127.0.0.1:${PORT}`);
  console.log(`池子：${pending} 待定 · ${published} 已发布 · ${rejected} 已排除`);
  console.log('放行后跑 `npm run export-site` 才会更新站点。Ctrl+C 退出。');
});

const PAGE = String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>后台 · 东京有点意思</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
/* Same design language as the site: ink/paper/acid, 1.5px rules, hard shadows,
   monospace kickers, heavy display type. Denser, because this is a workbench. */
:root{--ink:#151515;--paper:#f2f0e9;--acid:#d7ff3f;--red:#ef5b3f;--green:#2f7d4f}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 Arial,"Noto Sans SC","Hiragino Sans",sans-serif}
a{color:inherit}
nav{height:70px;padding:0 32px;display:flex;align-items:center;gap:14px;border-bottom:1.5px solid var(--ink);position:sticky;top:0;background:var(--paper);z-index:9}
.mark{width:32px;height:32px;display:grid;place-items:center;background:var(--ink);color:var(--acid);border-radius:50%;font-size:14px;font-weight:900;transform:rotate(-8deg)}
nav b{font-size:17px;font-weight:900;letter-spacing:-.04em}
nav .hint{margin-left:auto;font:700 11px/1 monospace;letter-spacing:.1em;color:#666}
header{padding:44px 32px 0}
.kicker{font:700 11px/1 monospace;letter-spacing:.14em;color:#666}
h1{font-size:clamp(32px,4.5vw,58px);letter-spacing:-.07em;margin:12px 0 8px;font-weight:950}
.lede{font-size:13.5px;line-height:1.8;font-weight:600;max-width:64ch;color:#444}
.lede b{background:var(--acid);padding:1px 5px;color:var(--ink)}
.stats{display:flex;flex-wrap:wrap;gap:12px;padding:28px 32px 0}
.stat{border:1.5px solid var(--ink);background:#faf9f5;box-shadow:5px 5px 0 var(--ink);padding:14px 20px;min-width:118px}
.stat b{display:block;font-size:34px;line-height:1;letter-spacing:-.06em}
.stat span{font:700 10px/1 monospace;letter-spacing:.12em;color:#666}
.stat.pending{background:var(--acid)}
.controls{padding:34px 32px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
button,select,input{font:inherit}
.sortsep{align-self:center;font-size:11px;font-weight:700;opacity:.5;margin-left:10px}
.lv{display:inline-block;border:1px solid var(--ink);border-radius:4px;padding:1px 6px;font-size:11px;font-weight:700;margin-right:6px}
.lv b{font-weight:800}
.chip{border:1.5px solid var(--ink);padding:7px 14px;background:transparent;border-radius:100px;cursor:pointer;font-size:12.5px;font-weight:700}
.chip:hover,.chip[aria-pressed=true]{background:var(--ink);color:#fff}
select{border:1.5px solid var(--ink);background:transparent;padding:7px 12px;border-radius:100px;font-size:12.5px;font-weight:700}
.count{margin-left:auto;font:700 11px/1 monospace;letter-spacing:.1em;color:#666}
section{padding:38px 32px 0}
.sechead{display:flex;align-items:baseline;gap:12px;border-bottom:1.5px solid var(--ink);padding-bottom:9px;margin-bottom:16px}
.sechead h2{font-size:24px;letter-spacing:-.05em;margin:0;font-weight:900}
.sechead em{font:700 10px/1 monospace;letter-spacing:.12em;color:#666;font-style:normal}
.sechead span{margin-left:auto;font:700 11px/1 monospace;color:#666}
.rows{display:grid;gap:8px}
.row{display:grid;grid-template-columns:74px 1fr auto;gap:14px;align-items:start;border:1.5px solid var(--ink);background:#faf9f5;padding:12px 15px}
.row.pending{box-shadow:4px 4px 0 var(--acid)}
.row.published{background:#f2f0e9;opacity:.85}
.row.rejected{background:#e8e5dd;opacity:.6}
.when{font:800 12px/1.45 monospace}
.when small{display:block;font-size:10px;color:#888}
.what h3{font-size:15px;line-height:1.4;margin:0 0 4px;font-weight:800;letter-spacing:-.02em}
.meta{font-size:11.5px;color:#666;display:flex;flex-wrap:wrap;gap:10px}
.meta b{color:var(--ink)}
.codes{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.code{font:700 10px/1 monospace;padding:3px 7px;border:1px solid #c9c6be;color:#777;border-radius:20px}
.code.signal{border-color:var(--green);color:var(--green)}
.code.hard{border-color:var(--red);color:var(--red)}
.acts{display:flex;flex-direction:column;gap:5px;align-items:stretch;min-width:104px}
.acts button{border:1.5px solid var(--ink);background:transparent;padding:6px 10px;font-size:11.5px;font-weight:800;cursor:pointer}
.acts button:hover{background:var(--ink);color:#fff}
.acts button[aria-pressed=true][data-s=published]{background:var(--ink);color:#fff}
.acts button[aria-pressed=true][data-s=rejected]{background:var(--red);color:#fff;border-color:var(--red)}
.by{font:700 9px/1.4 monospace;color:#888;text-align:center}
.panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px;padding:0 32px}
.panel{border:1.5px solid var(--ink);background:#faf9f5;box-shadow:5px 5px 0 var(--ink);padding:16px}
.panel h3{font:700 10px/1 monospace;letter-spacing:.12em;color:#666;margin:0 0 12px;text-transform:uppercase}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{text-align:left;padding:5px 8px 5px 0;border-bottom:1px solid #d2d0c9;vertical-align:top}
th{font:700 10px/1 monospace;letter-spacing:.08em;color:#888}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.bar{height:6px;background:#ddd9d0;min-width:52px;overflow:hidden}
.bar>i{display:block;height:100%;background:var(--green)}
.thin{opacity:.45}
.hint2{font-size:11.5px;color:#666;margin-top:10px;line-height:1.7}
.empty{border:1.5px dashed var(--ink);padding:34px;text-align:center;color:#666;font-size:13px}
footer{padding:60px 32px 80px;font-size:12px;line-height:1.9;color:#666}
footer b{color:var(--ink)}
@media(max-width:760px){.row{grid-template-columns:1fr}.count{margin-left:0;width:100%}}
</style></head><body>
<nav><span class="mark">东</span><b>后台</b><span class="hint" id="hint">载入中…</span></nav>
<header>
  <div class="kicker">BACKSTAGE · 候选池</div>
  <h1>新来的东西，先在这儿。</h1>
  <p class="lede">抓到的候选先进后台，按方案 §4.1 的对象类型分门别类。
    <b>待定的不会自己上前台</b>。放行只是写一条判决——<b>还要跑 npm run export-site 站点才会变</b>。</p>
</header>
<div class="stats" id="stats"></div>
<div class="controls">
  <button class="chip" data-f="state" data-v="pending" aria-pressed="true">待定</button>
  <button class="chip" data-f="state" data-v="published" aria-pressed="false">已发布</button>
  <button class="chip" data-f="state" data-v="rejected" aria-pressed="false">已排除</button>
  <button class="chip" data-f="state" data-v="" aria-pressed="false">全部</button>
  <span class="sortsep">排序</span>
  <button class="chip" data-f="sort" data-v="learning" aria-pressed="true" title="按「判了能学到多少」排：优先没判过的类型，一轮里每种问题只出一条">学习价值</button>
  <button class="chip" data-f="sort" data-v="likely" aria-pressed="false" title="按可能被放行的程度排">可能性</button>
  <select id="f-source"><option value="">全部来源</option></select>
  <select id="f-type"><option value="">全部类型</option></select>
  <input id="f-text" placeholder="搜索标题" style="border:1.5px solid var(--ink);background:transparent;padding:7px 12px;border-radius:100px;font-size:12.5px">
  <span class="count" id="count"></span>
</div>
<div id="list"></div>
<section><div class="sechead"><h2>给自动闸门的判据</h2><em>GATE EVIDENCE</em></div></section>
<div class="panels" id="panels"></div>
<footer>
  <b>为什么判决和抓取分两张表：</b>抓取每天重跑，判决只写 <code>decisions</code>，抓取碰不到它。所以重抓永远不会撤销你的决定。<br>
  <b>为什么这里不直接改站点：</b>放行是判断，发布是动作。判完跑 <code>npm run export-site</code>。<br>
  <b>这些判决同时是闸门的训练数据：</b>「想去率」高的理由码说明它拦错了人想去的东西；低才说明它拦得准。样本不足 10 条的行是灰的。
</footer>
<script>
const $ = (id) => document.getElementById(id);
let data = null;
const filters = { state: 'pending', source: '', type: '', text: '', sort: 'learning' };

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => v === null || v === undefined ? '—' : (v * 100).toFixed(0) + '%';
const STATE_CN = { pending: '待定', published: '已发布', rejected: '已排除' };

function when(item) {
  const short = (d) => d.slice(5).replace('-', '.');
  return item.endDate && item.endDate !== item.startDate
    ? [short(item.startDate), '→ ' + short(item.endDate)]
    : [short(item.startDate), item.startDate.slice(0, 4)];
}

function decidedBy(by) {
  if (!by) return '';
  if (by === 'human') return '人工';
  if (by === 'legacy') return '扩源前既有';
  if (by === 'ai:claude') return 'AI 初筛（待复核）';
  return by.startsWith('rule:') ? '规则 ' + by.slice(5) : by;
}

/**
 * The list the reviewer works from.
 *
 * The learning queue is the default because the reviewer is the bottleneck: it
 * orders by what a decision teaches (lib/learning-value.mjs) rather than by
 * what is likely to be good. It only ever holds pending candidates, so any
 * other state filter falls back to the full list.
 *
 * NOTE: this block lives inside a template literal (the browser script is
 * embedded in the served page), so backticks are not allowed in it.
 */
function ordered() {
  if (filters.sort !== 'learning') return data.candidates;
  if (filters.state && filters.state !== 'pending') return data.candidates;
  const rest = data.candidates.filter((c) => !data.learningQueue.some((l) => l.id === c.id));
  return [...data.learningQueue, ...rest];
}

function visible() {
  return ordered().filter((c) =>
    (!filters.state || c.state === filters.state)
    && (!filters.source || c.source === filters.source)
    && (!filters.type || c.objectType === filters.type)
    && (!filters.text || String(c.title || '').toLowerCase().includes(filters.text)));
}

function renderStats() {
  const s = data.summary;
  $('stats').innerHTML = [['pending', s.pending, 'PENDING 待定'], ['', s.published, 'PUBLISHED 已发布'], ['', s.rejected, 'REJECTED 已排除'], ['', s.total, 'TOTAL 候选总数']]
    .map(([cls, n, label]) => '<div class="stat ' + cls + '"><b>' + n + '</b><span>' + label + '</span></div>').join('');
  $('hint').textContent = s.pending + ' 待定 · ' + s.published + ' 已发布';
}

function renderList() {
  const rows = visible();
  $('count').textContent = rows.length + ' 条';
  // Grouping by object type would scatter the learning order, which is the
  // whole point of that mode: one candidate per kind-of-question, best first.
  const flat = filters.sort === 'learning' && (!filters.state || filters.state === 'pending');
  const byType = new Map();
  if (flat) byType.set('__queue', rows);
  else for (const c of rows) { if (!byType.has(c.objectType)) byType.set(c.objectType, []); byType.get(c.objectType).push(c); }
  const order = flat
    ? [{ type: '__queue', label: '按学习价值排序', hint: '优先没判过的类型；一轮里每种问题只出一条' }]
    : data.objectTypes.filter((t) => byType.has(t.type));
  $('list').innerHTML = order.length === 0 || rows.length === 0
    ? '<section><div class="empty">没有符合条件的候选。</div></section>'
    : order.map((t) => {
      const items = byType.get(t.type);
      return '<section><div class="sechead"><h2>' + esc(t.label) + '</h2><em>' + esc(t.hint || t.type.toUpperCase()) + '</em><span>' + items.length + ' 条</span></div><div class="rows">'
        + items.map((c) => {
          const [main, sub] = when(c);
          const codes = [
            ...c.reasons.map((code) => '<span class="code ' + (code.startsWith('hard:') ? 'hard' : '') + '" title="' + esc(data.reasonLabels[code] || '') + '">' + esc(code) + '</span>'),
            ...c.signals.filter((code) => !c.reasons.includes(code)).map((code) => '<span class="code signal">' + esc(code) + '</span>'),
          ].join('');
          const act = (s, label) => '<button data-id="' + esc(c.id) + '" data-s="' + s + '" aria-pressed="' + (c.state === s) + '">' + label + '</button>';
          // In learning mode, say what judging this one buys: how many pending
          // candidates share its signature and how many have ever been judged.
          const lv = (flat && c.learningValue !== undefined)
            ? '<span class="lv" title="同类候选 ' + c.groupPending + ' 条待判，已判 ' + c.groupDecided + ' 条 · 签名 ' + esc(c.signature) + '">代表 <b>' + c.groupPending + '</b> 条'
              + (c.groupDecided === 0 ? ' · 未判过' : ' · 已判 ' + c.groupDecided) + '</span>'
            : '';
          return '<article class="row ' + c.state + '">'
            + '<div class="when">' + main + '<small>' + sub + '</small></div>'
            + '<div class="what"><h3>' + (c.sourceUrl ? '<a href="' + esc(c.sourceUrl) + '" target="_blank" rel="noreferrer">' + esc(c.titleZh || c.title) + '</a>' : esc(c.titleZh || c.title)) + '</h3>'
            + '<div class="meta">' + lv + '<span><b>' + esc(c.source || '编辑精选') + '</b></span>'
            + (c.place ? '<span>' + esc(c.place) + '</span>' : '')
            + (c.category ? '<span>' + esc(c.category) + '</span>' : '')
            + (c.audience ? '<span>来场对象 ' + esc(c.audience) + '</span>' : '')
            + (c.price ? '<span>' + esc(c.price) + '</span>' : '') + '</div>'
            + (codes ? '<div class="codes">' + codes + '</div>' : '')
            + '</div>'
            + '<div class="acts">' + act('published', '放行') + act('rejected', '排除')
            + (c.state !== 'pending' ? '<div class="by">' + esc(decidedBy(c.decidedBy)) + '</div>' : '') + '</div>'
            + '</article>';
        }).join('') + '</div></section>';
    }).join('');
}

function rateTable(rows, keyName, keyOf) {
  if (!rows.length) return '<div class="empty">还没有判决，先在上面放行或排除几条。</div>';
  return '<table><thead><tr><th>' + keyName + '</th><th class="num">已判</th><th class="num">放行</th><th class="num">想去率</th><th></th></tr></thead><tbody>'
    + rows.map((r) => '<tr class="' + (r.enoughSamples ? '' : 'thin') + '"><td>' + esc(keyOf(r))
      + (data.reasonLabels[keyOf(r)] ? ' <span style="color:#888">' + esc(data.reasonLabels[keyOf(r)]) + '</span>' : '')
      + '</td><td class="num">' + r.decided + '</td><td class="num">' + r.published + '</td><td class="num">' + pct(r.publishRate)
      + '</td><td><div class="bar"><i style="width:' + (r.publishRate * 100).toFixed(0) + '%"></i></div></td></tr>').join('')
    + '</tbody></table>';
}

function renderPanels() {
  const e = data.evidence;
  const p = e.projection;
  $('panels').innerHTML =
    '<div class="panel"><h3>判决进度</h3><table><tbody>'
      + '<tr><td>已判 / 合计</td><td class="num">' + e.coverage.decided + ' / ' + e.coverage.total + '</td></tr>'
      + Object.entries(e.coverage.byType).map(([t, v]) => '<tr><td>' + esc(t) + '</td><td class="num">' + v.decided + ' / ' + v.total + '</td></tr>').join('')
      + '</tbody></table></div>'
    + '<div class="panel"><h3>若把抓取期过滤器当闸门</h3>' + (p.judged === 0
      ? '<div class="empty">判够几条之后这里会给出精确率、召回率和误拦数。</div>'
      : '<table><tbody>'
        + '<tr><td>已判候选</td><td class="num">' + p.judged + '</td></tr>'
        + '<tr><td>会放行 / 会拦下</td><td class="num">' + p.wouldPublish + ' / ' + p.wouldWithhold + '</td></tr>'
        + '<tr><td>精确率</td><td class="num">' + pct(p.precision) + '</td></tr>'
        + '<tr><td>召回率</td><td class="num">' + pct(p.recall) + '</td></tr>'
        + '<tr><td><b>误拦掉的好东西</b></td><td class="num"><b>' + p.missedGood + '</b></td></tr>'
        + '<tr><td>拦对的</td><td class="num">' + p.correctlyWithheld + '</td></tr></tbody></table>') + '</div>'
    + '<div class="panel"><h3>各理由码</h3>' + rateTable(e.byReason, '理由码', (r) => r.code)
      + '<div class="hint2">只统计 <b>人</b> 判的 ' + e.humanCoverage.judgedByHuman + ' 条（另有 ' + e.humanCoverage.settledByMachine + ' 条由规则判定，不计入）。'
      + '把规则自己的判决算进来，规则就会自证——2026-08-30 曾因此把一条 0% 放行率读成最强判据，实际人工判过 0 条。</div></div>'
    + '<div class="panel"><h3>各来源</h3>' + rateTable(e.bySource, '来源', (r) => r.source) + '</div>'
    + '<div class="panel"><h3>各对象类型</h3>' + rateTable(e.byObjectType, '类型', (r) => r.objectType) + '</div>';
}

function fillOptions() {
  const sources = [...new Set(data.candidates.map((c) => c.source).filter(Boolean))].sort();
  $('f-source').innerHTML = '<option value="">全部来源</option>' + sources.map((s) => '<option>' + esc(s) + '</option>').join('');
  $('f-type').innerHTML = '<option value="">全部类型</option>'
    + data.objectTypes.map((t) => '<option value="' + t.type + '">' + esc(t.label) + '</option>').join('');
}

function renderAll() { renderStats(); renderList(); renderPanels(); }

document.addEventListener('click', async (event) => {
  const sortChip = event.target.closest('.chip[data-f=sort]');
  if (sortChip) {
    filters.sort = sortChip.dataset.v;
    document.querySelectorAll('.chip[data-f=sort]').forEach((b) => b.setAttribute('aria-pressed', String(b === sortChip)));
    return renderList();
  }
  const chip = event.target.closest('.chip[data-f=state]');
  if (chip) {
    filters.state = chip.dataset.v;
    document.querySelectorAll('.chip[data-f=state]').forEach((b) => b.setAttribute('aria-pressed', String(b === chip)));
    return renderList();
  }
  const button = event.target.closest('.acts button');
  if (!button) return;
  const current = data.candidates.find((c) => c.id === button.dataset.id);
  const next = current.state === button.dataset.s ? null : button.dataset.s;
  const response = await fetch('/api/decide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: button.dataset.id, state: next }) });
  const body = await response.json();
  if (!response.ok) return alert(body.error);
  data = { ...data, ...body };
  renderAll();
});

$('f-source').addEventListener('change', (e) => { filters.source = e.target.value; renderList(); });
$('f-type').addEventListener('change', (e) => { filters.type = e.target.value; renderList(); });
$('f-text').addEventListener('input', (e) => { filters.text = e.target.value.trim().toLowerCase(); renderList(); });

fetch('/api/state').then((r) => r.json()).then((payload) => { data = payload; fillOptions(); renderAll(); });
</script></body></html>`;
