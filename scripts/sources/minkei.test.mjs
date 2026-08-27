import test from 'node:test';
import assert from 'node:assert/strict';
import { MINKEI_EDITIONS, changeTypeFor, collectMinkeiShopChanges, describedChangeDate, isoDate, minkeiSources, parseMinkeiArticle, parseMinkeiHomepage, placeFrom } from './minkei.mjs';

const shibuya = { name: 'シブヤ経済新聞', origin: 'https://www.shibukei.com', url: 'https://www.shibukei.com/', area: '涩谷', wards: ['渋谷区'] };

const homepage = `<html><body>
  <a href="/headline/1001/"><h3>渋谷に古書店がオープン</h3><span>ショップ</span></a>
  <a href="/headline/1002/"><h3>老舗喫茶店が閉店へ</h3><span>グルメ</span></a>
  <a href="/headline/1003/"><h3>渋谷駅前で盆踊り大会</h3><span>カルチャー</span></a>
  <a href="/headline/1001/"><h3>渋谷に古書店がオープン</h3><span>ショップ</span></a>
  <a href="/column/9/"><h3>コラム：まちの記憶</h3></a>
</body></html>`;

const article = (description, published) =>
  `<html><head><meta name="description" content="${description}"></head><body><time>${published}</time></body></html>`;

test('shop changes are classified; promotions dressed as openings are not', () => {
  assert.equal(changeTypeFor('渋谷に古書店がオープン'), 'opening');
  assert.equal(changeTypeFor('老舗喫茶店が閉店へ'), 'closing');
  assert.equal(changeTypeFor('店舗がリニューアル'), 'discovery');
  // "オープン記念フェア" is a promotion at an existing shop, not a new shop.
  assert.equal(changeTypeFor('オープン記念フェア開催'), null);
  assert.equal(changeTypeFor('渋谷駅前で盆踊り大会'), null);
  assert.equal(changeTypeFor('まちの歴史を振り返る'), null);
});

test('homepage yields only shop-change leads, deduped, absolute-linked', () => {
  const leads = parseMinkeiHomepage(homepage, shibuya);
  assert.equal(leads.length, 2);
  assert.deepEqual(leads.map((lead) => lead.changeType), ['opening', 'closing']);
  assert.equal(leads[0].sourceUrl, 'https://www.shibukei.com/headline/1001/');
  assert.equal(leads[0].category, 'ショップ');
});

test('a year-less date in the article is read against the publication year', () => {
  assert.equal(describedChangeDate('9月20日にオープン', '2026-09-01'), '2026-09-20');
  // December publication naming January means next year.
  assert.equal(describedChangeDate('1月5日にオープン', '2026-12-20'), '2027-01-05');
  assert.equal(describedChangeDate('日付未定', '2026-09-01'), null);
});

test('dates parse from the formats the network uses', () => {
  assert.equal(isoDate('2026.09.01'), '2026-09-01');
  assert.equal(isoDate('2026/9/1'), '2026-09-01');
  assert.equal(isoDate(''), null);
});

test('place prefers a ward the edition covers, else names the edition area', () => {
  assert.equal(placeFrom('渋谷区宇田川町に開店', shibuya), '渋谷区宇田川町に開店');
  assert.equal(placeFrom('詳細は記事参照', shibuya), '涩谷周边 · 详见报道');
  const ikebukuro = MINKEI_EDITIONS.find((edition) => edition.name === '池袋経済新聞');
  assert.equal(placeFrom('板橋区大山町にオープン', ikebukuro), '板橋区大山町にオープン');
});

test('an article becomes an event carrying the change type and attribution', () => {
  const lead = { title: '渋谷に古書店がオープン', sourceUrl: 'https://www.shibukei.com/headline/1001/', changeType: 'opening', category: 'ショップ' };
  const event = parseMinkeiArticle(article('渋谷区宇田川町に9月20日オープンする', '2026.09.01'), lead, shibuya);
  assert.equal(event.startDate, '2026-09-20');
  assert.equal(event.dateKind, 'change');
  assert.equal(event.changeType, 'opening');
  assert.equal(event.attribution, 'シブヤ経済新聞');
  assert.equal(event.place, '渋谷区宇田川町に9月20日オープンする');
  // The article summary itself is never carried over.
  assert.ok(!('description' in event));
});

test('without a stated change date the publication date stands in, and is labelled', () => {
  const lead = { title: '古書店がオープン', sourceUrl: 'https://www.shibukei.com/headline/1001/', changeType: 'opening', category: '' };
  const event = parseMinkeiArticle(article('渋谷区に新しい古書店', '2026.09.01'), lead, shibuya);
  assert.equal(event.startDate, '2026-09-01');
  assert.equal(event.dateKind, 'published');
});

test('an article with no date is dropped rather than dated to today', () => {
  const lead = { title: 'オープン', sourceUrl: 'https://x.test/headline/1/', changeType: 'opening', category: '' };
  assert.equal(parseMinkeiArticle('<html><head><meta name="description" content="x"></head><body></body></html>', lead, shibuya), null);
});

test('collection fetches the homepage once and drops stale leads', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    const href = String(url);
    requested.push(href);
    if (href === 'https://www.shibukei.com/') return { ok: true, status: 200, text: async () => homepage };
    // 1001 is recent; 1002 is long past the age cutoff.
    const published = href.includes('1001') ? '2026.09.01' : '2026.01.05';
    return { ok: true, status: 200, text: async () => article('渋谷区に開店', published) };
  };
  const events = await collectMinkeiShopChanges({ source: shibuya, fetchImpl, now: new Date('2026-09-10T00:00:00+09:00') });
  assert.equal(requested.filter((url) => url === 'https://www.shibukei.com/').length, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].changeType, 'opening');
});

test('a failing article is skipped without failing the whole edition', async () => {
  const fetchImpl = async (url) => String(url) === 'https://www.shibukei.com/'
    ? { ok: true, status: 200, text: async () => homepage }
    : { ok: false, status: 500, text: async () => '' };
  assert.deepEqual(await collectMinkeiShopChanges({ source: shibuya, fetchImpl }), []);
});

test('a failing homepage is an error, not a silent empty edition', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, text: async () => '' });
  await assert.rejects(() => collectMinkeiShopChanges({ source: shibuya, fetchImpl }), /503/);
});

test('every edition produces a registrable source with a distinct identity', () => {
  const sources = minkeiSources();
  assert.equal(sources.length, MINKEI_EDITIONS.length);
  assert.ok(sources.length >= 15, 'the whole reachable Tokyo network should be registered');
  assert.equal(new Set(sources.map((source) => source.url)).size, sources.length);
  assert.equal(new Set(sources.map((source) => source.name)).size, sources.length);
  for (const source of sources) {
    assert.equal(source.trustTier, 'S2');
    assert.equal(source.sourceFamily, 'local_media');
    assert.equal(typeof source.collect, 'function');
    assert.match(source.url, /^https:\/\/.+\/$/);
  }
});
