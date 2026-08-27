#!/usr/bin/env node
/**
 * Local editorial console. `npm run review` → http://127.0.0.1:4321
 *
 * Why a local server and not a page on the site: the site is a static build
 * from JSON in git, and editorial judgement belongs in git too. This writes
 * data/editorial-labels.json directly, so a labelling session ends as a normal
 * commit and needs no backend, no auth, and no infrastructure.
 *
 * What it is NOT: an approval queue. Labels never change what gets published.
 * They exist to measure the rules — see lib/editorial-labels.mjs.
 *
 * Binds to loopback only. No dependencies beyond node builtins.
 */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { REASON_LABELS } from '../lib/activity-filter.mjs';
import { agreementByReason, agreementBySource, attachLabels, collectCandidates, coverage, emptyLabels, gateProjection, removeLabel, upsertLabel } from '../lib/editorial-labels.mjs';

const ROOT = new URL('../', import.meta.url);
const EVENTS = new URL('data/events.json', ROOT);
const REVIEW = new URL('data/review-events.json', ROOT);
const LABELS = new URL('data/editorial-labels.json', ROOT);
const PORT = Number(process.env.REVIEW_PORT || 4321);

const readJson = (url, fallback) => readFile(url, 'utf8').then(JSON.parse).catch((error) => {
  if (error.code === 'ENOENT') return fallback;
  throw error;
});

async function loadState() {
  const [events, review, store] = await Promise.all([
    readJson(EVENTS, { events: [] }),
    readJson(REVIEW, { events: [] }),
    readJson(LABELS, emptyLabels()),
  ]);
  const candidates = collectCandidates({ published: events.events, review: review.events });
  const labelled = attachLabels(candidates, store);
  return { store, labelled, updatedAt: events.updatedAt };
}

const summarize = (labelled) => ({
  coverage: coverage(labelled),
  byReason: agreementByReason(labelled),
  bySource: agreementBySource(labelled),
  projection: gateProjection(labelled),
});

const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

// Collect Buffers and decode once: a note in Japanese or Chinese can put a
// multi-byte character across a chunk boundary, and decoding per chunk mangles it.
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

    if (request.method === 'GET' && url.pathname === '/api/state') {
      const { labelled, updatedAt } = await loadState();
      return json(response, 200, {
        updatedAt,
        reasonLabels: REASON_LABELS,
        candidates: labelled,
        summary: summarize(labelled),
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/label') {
      const { id, verdict, note } = await readBody(request);
      const store = await readJson(LABELS, emptyLabels());
      const next = verdict === null
        ? removeLabel(store, id)
        : upsertLabel(store, id, { verdict, note, at: new Date().toISOString() });
      await writeFile(LABELS, `${JSON.stringify(next, null, 2)}\n`);
      const { labelled } = await loadState();
      return json(response, 200, { ok: true, summary: summarize(labelled) });
    }

    json(response, 404, { error: 'not found' });
  } catch (error) {
    json(response, 500, { error: String(error?.message || error) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`候选诊断台  http://127.0.0.1:${PORT}`);
  console.log('标注写入 data/editorial-labels.json，不影响发布。Ctrl+C 退出。');
});

const PAGE = String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>候选诊断台</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#faf9f7;--fg:#1c1a17;--muted:#6b6560;--line:#e2ddd6;--card:#fff;--good:#2f7d4f;--bad:#b4472f;--unsure:#8a7a3d;--accent:#3d66f5}
@media(prefers-color-scheme:dark){:root{--bg:#161513;--fg:#eceae6;--muted:#9a938c;--line:#2f2c28;--card:#1f1d1a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 ui-sans-serif,system-ui,"Hiragino Sans","Noto Sans CJK SC",sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:14px 20px}
h1{font-size:17px;margin:0 0 2px}
.sub{color:var(--muted);font-size:13px}
main{padding:20px;max-width:1180px;margin:0 auto}
section{margin-bottom:26px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 10px;font-weight:600}
.panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:14px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:5px 8px 5px 0;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.bar{height:6px;border-radius:3px;background:var(--line);overflow:hidden;min-width:56px}
.bar>i{display:block;height:100%;background:var(--good)}
.thin{opacity:.5}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
select,input[type=search]{font:inherit;padding:5px 8px;border:1px solid var(--line);border-radius:7px;background:var(--card);color:var(--fg)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:9px}
.card.done{opacity:.62}
.top{display:flex;gap:12px;justify-content:space-between;align-items:baseline}
.title{font-weight:600}
.meta{color:var(--muted);font-size:12.5px;margin-top:2px}
.codes{margin-top:7px;display:flex;flex-wrap:wrap;gap:5px}
.code{font-size:11.5px;padding:2px 7px;border-radius:20px;border:1px solid var(--line);color:var(--muted)}
.code.sig{border-color:var(--good);color:var(--good)}
.code.hard{border-color:var(--bad);color:var(--bad)}
.pill{font-size:11.5px;padding:2px 8px;border-radius:20px;border:1px solid var(--line);white-space:nowrap}
.pill.pub{border-color:var(--accent);color:var(--accent)}
.acts{margin-top:9px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
button{font:inherit;font-size:13px;padding:4px 12px;border-radius:7px;border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}
button:hover{border-color:var(--muted)}
button[aria-pressed=true][data-v=good]{background:var(--good);border-color:var(--good);color:#fff}
button[aria-pressed=true][data-v=bad]{background:var(--bad);border-color:var(--bad);color:#fff}
button[aria-pressed=true][data-v=unsure]{background:var(--unsure);border-color:var(--unsure);color:#fff}
a{color:var(--accent)}
.note{font:inherit;font-size:12.5px;padding:4px 8px;border:1px solid var(--line);border-radius:7px;background:transparent;color:var(--fg);flex:1;min-width:150px}
.empty{color:var(--muted);padding:22px 0}
.hint{color:var(--muted);font-size:12.5px;margin-top:8px}
kbd{font:inherit;font-size:11.5px;border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;padding:0 5px}
</style></head><body>
<header>
  <h1>候选诊断台</h1>
  <div class="sub" id="sub">载入中…</div>
</header>
<main>
  <section>
    <h2>统计</h2>
    <div class="panels">
      <div class="panel"><h2>标注进度</h2><div id="cov"></div></div>
      <div class="panel"><h2>若把现有规则当闸门</h2><div id="proj"></div></div>
    </div>
  </section>
  <section>
    <h2>各理由码与人判断的吻合度</h2>
    <div class="panel"><div id="reasons"></div>
      <div class="hint">「想去率」高说明这条规则拦的多是人想去的东西，作为闸门是错的；低才说明它拦得准。样本不足 10 条的行是灰的，不要据此下结论。</div>
    </div>
  </section>
  <section>
    <h2>各来源</h2>
    <div class="panel"><div id="sources"></div></div>
  </section>
  <section>
    <h2>候选</h2>
    <div class="filters">
      <select id="f-decision"><option value="">全部判定</option><option value="keep">keep</option><option value="review">review</option><option value="exclude">exclude</option></select>
      <select id="f-source"><option value="">全部来源</option></select>
      <select id="f-reason"><option value="">全部理由码</option></select>
      <select id="f-labelled"><option value="">全部</option><option value="no">未标注</option><option value="yes">已标注</option></select>
      <input type="search" id="f-text" placeholder="搜索标题">
      <span class="sub" id="count"></span>
    </div>
    <div id="list"></div>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
let state = { candidates: [], summary: null, reasonLabels: {} };

const pct = (value) => value === null || value === undefined ? '—' : (value * 100).toFixed(0) + '%';
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function rateTable(rows, keyName, keyOf) {
  if (!rows.length) return '<div class="empty">还没有标注，先在下面判几条。</div>';
  return '<table><thead><tr><th>' + keyName + '</th><th class="num">已判</th><th class="num">想去</th><th class="num">想去率</th><th></th></tr></thead><tbody>'
    + rows.map((row) => '<tr class="' + (row.enoughSamples ? '' : 'thin') + '">'
      + '<td>' + esc(keyOf(row)) + (state.reasonLabels[keyOf(row)] ? ' <span class="sub">' + esc(state.reasonLabels[keyOf(row)]) + '</span>' : '')
      + '</td><td class="num">' + row.labelled + '</td><td class="num">' + row.good + '</td><td class="num">' + pct(row.goodRate) + '</td>'
      + '<td><div class="bar"><i style="width:' + (row.goodRate * 100).toFixed(0) + '%"></i></div></td></tr>').join('')
    + '</tbody></table>';
}

function renderSummary() {
  const { coverage: cov, projection: proj, byReason, bySource } = state.summary;
  $('cov').innerHTML = '<table><tbody>'
    + '<tr><td>合计</td><td class="num">' + cov.labelled + ' / ' + cov.total + '</td></tr>'
    + Object.entries(cov.byDecision).map(([decision, value]) =>
        '<tr><td>' + esc(decision) + '</td><td class="num">' + value.labelled + ' / ' + value.total + '</td></tr>').join('')
    + '</tbody></table>';

  $('proj').innerHTML = proj.judged === 0
    ? '<div class="empty">判够几条之后这里会给出：开闸门会放行多少、拦掉多少、以及拦错多少。</div>'
    : '<table><tbody>'
      + '<tr><td>已判候选</td><td class="num">' + proj.judged + '</td></tr>'
      + '<tr><td>会放行 / 会拦下</td><td class="num">' + proj.wouldPublish + ' / ' + proj.wouldWithhold + '</td></tr>'
      + '<tr><td>放行里确实想去（精确率）</td><td class="num">' + pct(proj.precision) + '</td></tr>'
      + '<tr><td>想去的里放行了（召回率）</td><td class="num">' + pct(proj.recall) + '</td></tr>'
      + '<tr><td><b>误拦掉的好东西</b></td><td class="num"><b>' + proj.missedGood + '</b></td></tr>'
      + '<tr><td>拦对的</td><td class="num">' + proj.correctlyWithheld + '</td></tr>'
      + '</tbody></table>';

  $('reasons').innerHTML = rateTable(byReason, '理由码', (row) => row.code);
  $('sources').innerHTML = rateTable(bySource, '来源', (row) => row.source);
}

function fillOptions() {
  const sources = [...new Set(state.candidates.map((c) => c.activity.source).filter(Boolean))].sort();
  const codes = [...new Set(state.candidates.flatMap((c) => [...c.reasons, ...c.signals]))].sort();
  $('f-source').innerHTML = '<option value="">全部来源</option>' + sources.map((s) => '<option>' + esc(s) + '</option>').join('');
  $('f-reason').innerHTML = '<option value="">全部理由码</option>' + codes.map((c) => '<option>' + esc(c) + '</option>').join('');
}

function visible() {
  const decision = $('f-decision').value, source = $('f-source').value, reason = $('f-reason').value;
  const labelled = $('f-labelled').value, text = $('f-text').value.trim().toLowerCase();
  return state.candidates.filter((c) =>
    (!decision || c.decision === decision)
    && (!source || c.activity.source === source)
    && (!reason || c.reasons.includes(reason) || c.signals.includes(reason))
    && (!labelled || (labelled === 'yes' ? Boolean(c.label) : !c.label))
    && (!text || String(c.activity.title || '').toLowerCase().includes(text)));
}

function renderList() {
  const rows = visible();
  $('count').textContent = rows.length + ' 条';
  $('list').innerHTML = rows.length === 0 ? '<div class="empty">没有符合条件的候选。</div>' : rows.map((c) => {
    const a = c.activity, verdict = c.label?.verdict;
    const codes = [
      ...c.reasons.map((code) => '<span class="code ' + (code.startsWith('hard:') ? 'hard' : '') + '" title="' + esc(state.reasonLabels[code] || '') + '">' + esc(code) + '</span>'),
      ...c.signals.filter((code) => !c.reasons.includes(code)).map((code) => '<span class="code sig">' + esc(code) + '</span>'),
    ].join('');
    const button = (v, text) => '<button data-id="' + esc(a.id) + '" data-v="' + v + '" aria-pressed="' + (verdict === v) + '">' + text + '</button>';
    return '<div class="card ' + (verdict ? 'done' : '') + '">'
      + '<div class="top"><div><div class="title">' + esc(a.titleZh || a.title) + '</div>'
      + '<div class="meta">' + esc(a.source || '—') + ' · ' + esc(a.place || '—') + ' · ' + esc(a.time || a.startDate || '—')
      + ' · <a href="' + esc(a.sourceUrl) + '" target="_blank" rel="noreferrer">原文</a></div></div>'
      + '<div><span class="pill">' + esc(c.decision) + '</span> ' + (c.published ? '<span class="pill pub">已在首页</span>' : '') + '</div></div>'
      + '<div class="codes">' + codes + '</div>'
      + '<div class="acts">' + button('good', '想去') + button('bad', '不想去') + button('unsure', '说不好')
      + '<input class="note" data-id="' + esc(a.id) + '" placeholder="备注（可留空）" value="' + esc(c.label?.note || '') + '"></div>'
      + '</div>';
  }).join('');
}

async function send(id, verdict, note) {
  const response = await fetch('/api/label', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, verdict, note }),
  });
  const body = await response.json();
  if (!response.ok) return alert(body.error);
  const candidate = state.candidates.find((c) => c.activity.id === id);
  candidate.label = verdict === null ? null : { verdict, note: note || '', labeledAt: new Date().toISOString() };
  state.summary = body.summary;
  renderSummary(); renderList();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-v]');
  if (!button) return;
  const id = button.dataset.id;
  const current = state.candidates.find((c) => c.activity.id === id)?.label?.verdict;
  const note = document.querySelector('.note[data-id="' + CSS.escape(id) + '"]')?.value || '';
  send(id, current === button.dataset.v ? null : button.dataset.v, note);
});

document.addEventListener('change', (event) => {
  if (event.target.classList.contains('note')) {
    const id = event.target.dataset.id;
    const verdict = state.candidates.find((c) => c.activity.id === id)?.label?.verdict;
    if (verdict) send(id, verdict, event.target.value);
  } else if (event.target.id.startsWith('f-')) renderList();
});
$('f-text').addEventListener('input', renderList);

fetch('/api/state').then((r) => r.json()).then((data) => {
  state = data;
  $('sub').innerHTML = data.candidates.length + ' 条候选 · 数据 ' + esc(data.updatedAt || '—')
    + ' · 标注只用于衡量规则，<b>不改变发布</b>';
  fillOptions(); renderSummary(); renderList();
});
</script></body></html>`;
