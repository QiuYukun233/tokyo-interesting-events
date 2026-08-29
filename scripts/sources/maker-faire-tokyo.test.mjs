import test from 'node:test';
import assert from 'node:assert/strict';
import { MAKER_FAIRE_KANA_INDEXES, discoverMakerSlugs, fetchMaker, parseMakerDetail, parseMakerSlugs, mapFair } from './maker-faire-tokyo.mjs';

const source = { name: 'Maker Faire Tokyo 2026', startDate: '2026-09-05', endDate: '2026-09-06', venue: '有明GYM-EX（ジメックス）' };

const indexPage = (...slugs) => `<html><body><ul class="makers">${slugs.map((slug) => `
  <li class="maker"><a href="https://makezine.jp/event/makers-mft2026/${slug}/"><div class="maker__inner">
    <dt class="maker__name">dummy</dt>
  </div></a></li>`).join('')}</ul></body></html>`;

const detailPage = ({ name = 'AIT鉄人プロジェクト', categories = ['Young Makers', 'ロボティクス'], booth = '02-04', tagline = '鉄人23号', description = 'ヒューマノイドの実機展示。', sponsor = false, sns = 'https://twitter.com/ait_tetusjin' } = {}) => `
<html><body>
  <article class="article__detail"><section>
    <ul class="maker__category no-bullet">${categories.map((c) => `<li><a href="/event/makercat-mft2026/x/"></span>${c}</a></li>`).join('')}</ul>
    <h3 class="maker__name">${name}</h3>
    ${sponsor ? '<ul class="no-bullet maker__genre"><li>SPONSOR</li></ul>' : ''}
    <ul class="no-bullet maker__booth"><li class="maker__booth__initial">${sponsor ? 'SP' : 'B'}</li><li class="maker__booth__no">${booth}</li></ul>
    <div class="maker">
      <dl class="maker__title"><dt class="maker__title_ja">${tagline}</dt></dl>
      <div class="maker__description"><p>${description}</p></div>
      <ul class="no-bullet maker__sns">${sns ? `<li>X: <a href="${sns}" target="_blank">@x</a></li>` : ''}</ul>
    </div>
  </section></article>
</body></html>`;

test('exhibitor slugs are extracted from a kana-index page, deduped', () => {
  const slugs = parseMakerSlugs(indexPage('m0086', '3dmart-japan', 'm0086'));
  assert.deepEqual(slugs, ['m0086', '3dmart-japan']);
});

test('a detail page maps name, booth, dates, categories, description and one SNS link', () => {
  const event = parseMakerDetail(detailPage(), 'm0086', source);
  assert.equal(event.title, 'AIT鉄人プロジェクト');
  assert.equal(event.startDate, '2026-09-05');
  assert.equal(event.endDate, '2026-09-06');
  assert.equal(event.place, '有明GYM-EX（ジメックス） · ブース02-04');
  assert.equal(event.category, 'Young Makers・ロボティクス');
  assert.equal(event.description, '鉄人23号 — ヒューマノイドの実機展示。');
  assert.equal(event.attribution, 'https://twitter.com/ait_tetusjin');
  assert.equal(event.sourceUrl, 'https://makezine.jp/event/makers-mft2026/m0086/');
});

test('a sponsor booth is a valid candidate like any other exhibitor', () => {
  // The back office judges sponsor vs. individual maker, not the crawl.
  const event = parseMakerDetail(detailPage({ sponsor: true, name: '3DMart Japan合同会社' }), '3dmart-japan', source);
  assert.equal(event.title, '3DMart Japan合同会社');
  assert.equal(event.place, '有明GYM-EX（ジメックス） · ブース02-04');
});

test('a page with no SNS link is still a valid candidate', () => {
  const event = parseMakerDetail(detailPage({ sns: null }), 'x', source);
  assert.ok(!('attribution' in event));
});

test('a page missing the exhibitor name is dropped', () => {
  assert.equal(parseMakerDetail(detailPage({ name: '' }), 'x', source), null);
});

test('discovery fetches every kana index once and unions the slugs', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    return { ok: true, status: 200, text: async () => indexPage('shared-maker', String(url).includes('n=101') ? 'n101-only' : 'other-maker') };
  };
  const slugs = await discoverMakerSlugs(fetchImpl);
  assert.equal(requested.length, MAKER_FAIRE_KANA_INDEXES.length);
  assert.ok(slugs.includes('shared-maker'));
  assert.ok(slugs.includes('n101-only'));
});

test('a failed index page is skipped rather than aborting discovery', async () => {
  const fetchImpl = async (url) => String(url).includes('n=102')
    ? { ok: false, status: 500, text: async () => '' }
    : { ok: true, status: 200, text: async () => indexPage('m0001') };
  const slugs = await discoverMakerSlugs(fetchImpl);
  assert.deepEqual(slugs, ['m0001']);
});

test('fetchMaker wraps a failed request as null rather than throwing', async () => {
  const event = await fetchMaker('x', source, async () => ({ ok: false, status: 404, text: async () => '' }));
  assert.equal(event, null);
});

test('the whole fair is ONE candidate, however many exhibitors', () => {
  // 287 exhibitors at one venue on one weekend — 方案 §4.3.
  const fair = mapFair([
    { title: 'AIT鉄人プロジェクト', category: 'Young Makers・ロボティクス' },
    { title: '3DMart Japan', category: 'デジタルファブリケーションのツール・クラフト' },
    { title: 'D-The-Star', category: 'ロボティクス' },
  ], { name: 'Maker Faire Tokyo 2026', startDate: '2026-09-05', endDate: '2026-09-06', venue: '有明GYM-EX' });
  assert.equal(fair.title, 'Maker Faire Tokyo 2026');
  assert.equal(fair.place, '有明GYM-EX');
  assert.equal(fair.startDate, '2026-09-05');
  assert.equal(fair.endDate, '2026-09-06');
  assert.match(fair.description, /出展者3組/);
  assert.match(fair.description, /ロボティクス2/, 'a multi-tag exhibitor counts under each tag');
});

test('no exhibitors means no candidate rather than an empty fair', () => {
  assert.equal(mapFair([], { name: 'x', startDate: '2026-09-05', venue: 'y' }), null);
  assert.equal(mapFair([{ title: 'a' }], { name: 'x', venue: 'y' }), null);
});
