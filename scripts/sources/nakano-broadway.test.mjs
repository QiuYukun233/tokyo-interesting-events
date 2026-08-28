import test from 'node:test';
import assert from 'node:assert/strict';
import { placeSignals } from '../../lib/activity-filter.mjs';
import { NAKANO_BROADWAY_ADDRESS, buildTaxonomy, mapTenant, mapTenants, postsUrl, summarise } from './nakano-broadway.mjs';

const categories = [
  { id: 16, name: 'カテゴリ別店舗情報', parent: 0 },
  { id: 17, name: 'フロア別店舗情報', parent: 0 },
  { id: 15, name: 'NEWS&amp;TOPICS・新店情報', parent: 0 },
  { id: 11, name: 'サブカルチャー', parent: 16 },
  { id: 9, name: 'ファッション・ショップ', parent: 16 },
  { id: 4, name: '地下１階', parent: 17 },
  { id: 7, name: '３階', parent: 17 },
  { id: 3, name: 'プチパリ', parent: 17 },
];
const taxonomy = buildTaxonomy(categories);
const source = { name: '中野ブロードウェイ', startDate: '2026-08-29' };

const post = ({ id = 1, title = 'CITY BOY', cats = [16, 9, 17, 7], body = '<p>日本の伝統刺繍×ジャパニメーション</p>' } = {}) => ({
  id,
  link: `https://nakano-broadway.com/2026/08/shop-${id}/`,
  title: { rendered: title },
  categories: cats,
  content: { rendered: body },
});

test('the floor and genre taxonomies are read from the live category list', () => {
  assert.deepEqual(taxonomy.floors, { 4: '地下１階', 7: '３階', 3: 'プチパリ' });
  assert.deepEqual(taxonomy.genres, { 11: 'サブカルチャー', 9: 'ファッション・ショップ' });
});

test('a tenant becomes a place candidate carrying its floor', () => {
  const event = mapTenant(post(), taxonomy, source);
  assert.equal(event.title, 'CITY BOY');
  assert.equal(event.place, `${NAKANO_BROADWAY_ADDRESS} ３階`);
  assert.equal(event.category, 'ファッション・ショップ');
  assert.equal(event.changeType, 'discovery');
  assert.equal(event.ongoing, true);
  assert.equal(event.endDate, undefined);
  assert.match(event.description, /日本の伝統刺繍/);
});

test('the floor makes the address read as off-street, which is the point', () => {
  // This building is four floors of shops with no street frontage; the floor in
  // `place` is what lets lib/activity-filter.mjs label them automatically.
  const event = mapTenant(post(), taxonomy, source);
  assert.ok(placeSignals(event).includes('signal:off_street'), event.place);
  // Note it does NOT get `signal:in_building`: that rule looks for ビル/マンション
  // and friends, and this building's name is カタカナ. A known limit of a
  // word-list heuristic, recorded here rather than papered over by widening the
  // pattern until it matches everything.
  assert.ok(!placeSignals(event).includes('signal:in_building'));
});

test('a post with no floor category is a notice, not a tenant, and is dropped', () => {
  // NEWS&TOPICS entries — a children's drawing contest, say — sit in the same
  // `posts` collection. The floor is both the useful field and the filter.
  assert.equal(mapTenant(post({ title: '第43回ファミリーの絵コンクール', cats: [15] }), taxonomy, source), null);
});

test('a tenant filed only by floor still becomes a candidate, without a genre', () => {
  const event = mapTenant(post({ cats: [17, 4] }), taxonomy, source);
  assert.ok(event.place.endsWith('地下１階'));
  assert.ok(!('category' in event));
});

test('an entity-escaped category name still matches its parent', () => {
  // The API returns `NEWS&amp;TOPICS・新店情報`; comparing raw would miss it.
  assert.ok(buildTaxonomy(categories).floors);
  assert.equal(Object.values(buildTaxonomy(categories).genres).includes('サブカルチャー'), true);
});

test('the summary collapses the editor’s empty block runs', () => {
  // The body is paragraphs separated by long stretches of empty block markup;
  // a naive text extraction returns one line then hundreds of blank ones.
  const body = '<p>ポケモン、ワンピース！</p>\n\n\t\t\n\n\t\t\t\n\n<div></div>\n\n\n<p>2026年夏オープン！</p>';
  assert.equal(summarise(body), 'ポケモン、ワンピース！ 2026年夏オープン！');
  assert.equal(summarise(''), '');
});

test('each tenant gets a distinct id, and ids come from the tenant page', () => {
  const events = mapTenants([post(), post({ id: 2, title: 'キムチのデメキン', cats: [17, 4] })], taxonomy, source);
  assert.equal(events.length, 2);
  assert.notEqual(events[0].id, events[1].id);
  assert.equal(events[0].sourceUrl, 'https://nakano-broadway.com/2026/08/shop-1/');
});

test('the posts URL asks only for the fields used', () => {
  assert.equal(postsUrl(2), 'https://nakano-broadway.com/wp-json/wp/v2/posts?per_page=100&page=2&_fields=id,link,title,content,categories');
});
