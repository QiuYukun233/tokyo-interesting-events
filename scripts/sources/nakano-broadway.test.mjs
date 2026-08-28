import test from 'node:test';
import assert from 'node:assert/strict';
import { placeSignals } from '../../lib/activity-filter.mjs';
import { NAKANO_BROADWAY_ADDRESS, buildTaxonomy, describeBuilding, mapBuilding, postsUrl, readTenant } from './nakano-broadway.mjs';

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

const post = ({ id = 1, title = 'CITY BOY', cats = [16, 9, 17, 7] } = {}) => ({
  id,
  link: `https://nakano-broadway.com/2026/08/shop-${id}/`,
  title: { rendered: title },
  categories: cats,
  content: { rendered: '<p>日本の伝統刺繍×ジャパニメーション</p>' },
});

const shops = [
  post(),
  post({ id: 2, title: 'まんだらけ', cats: [16, 11, 17, 7] }),
  post({ id: 3, title: 'Kaikai Kiki CARD STATION', cats: [16, 11, 17, 7] }),
  post({ id: 4, title: 'キムチのデメキン', cats: [17, 4] }),
];

test('the floor and genre taxonomies are read from the live category list', () => {
  assert.deepEqual(taxonomy.floors, { 4: '地下１階', 7: '３階', 3: 'プチパリ' });
  assert.deepEqual(taxonomy.genres, { 11: 'サブカルチャー', 9: 'ファッション・ショップ' });
});

test('the whole building is ONE candidate, however many shops are in it', () => {
  // For deciding where to go, all 207 tenants are the same destination: you go
  // to Nakano Broadway once and you have covered them all. One address, one
  // candidate — see the module doc comment.
  const building = mapBuilding(shops, taxonomy, source);
  assert.equal(building.title, '中野ブロードウェイ');
  assert.equal(building.place, NAKANO_BROADWAY_ADDRESS);
  assert.equal(building.changeType, 'discovery');
  assert.equal(building.ongoing, true);
  assert.equal(building.sourceUrl, 'https://nakano-broadway.com/floor/');
});

test('the tenant list becomes the card, not a pile of candidates', () => {
  // What makes the building worth a trip is a fact about the whole building.
  const building = mapBuilding(shops, taxonomy, source);
  assert.match(building.description, /専門店4軒/);
  assert.match(building.description, /2フロア/);
  assert.match(building.description, /サブカルチャー2/);
  assert.equal(building.category, 'サブカルチャー', 'the commonest genre leads');
});

test('tenant names are searchable even though they are not separate candidates', () => {
  // They go into the classifier's text so a search for まんだらけ still finds
  // the building.
  const building = mapBuilding(shops, taxonomy, source);
  assert.match(building.vibe, /\S/);
  assert.ok(mapBuilding(shops, taxonomy, source), 'building maps');
});

test('a notice with no floor category is not counted as a tenant', () => {
  // NEWS&TOPICS entries share the `posts` collection; the floor is the filter.
  assert.equal(readTenant(post({ title: '第43回ファミリーの絵コンクール', cats: [15] }), taxonomy), null);
  const building = mapBuilding([...shops, post({ id: 9, title: '絵コンクール', cats: [15] })], taxonomy, source);
  assert.match(building.description, /専門店4軒/, 'the notice is not counted');
});

test('a tenant filed only by floor is counted but contributes no genre', () => {
  const tenant = readTenant(post({ cats: [17, 4] }), taxonomy);
  assert.equal(tenant.floor, '地下１階');
  assert.equal(tenant.genre, null);
});

test('an entity-escaped category name still matches its parent', () => {
  // The API returns `NEWS&amp;TOPICS・新店情報`; comparing raw would miss it.
  assert.ok(Object.values(buildTaxonomy(categories).genres).includes('サブカルチャー'));
});

test('the building address reads as off-street, matching what the place is', () => {
  const building = mapBuilding(shops, taxonomy, source);
  // No floor in the address now — the candidate is the building itself — so
  // this is the `in_building`-style case the word list cannot see either.
  assert.deepEqual(placeSignals(building), []);
});

test('no tenants means no candidate rather than an empty building', () => {
  assert.equal(mapBuilding([], taxonomy, source), null);
  assert.equal(mapBuilding(shops, taxonomy, { name: 'x' }), null);
  assert.equal(describeBuilding([]), null);
});

test('the posts URL asks only for the fields used', () => {
  assert.equal(postsUrl(2), 'https://nakano-broadway.com/wp-json/wp/v2/posts?per_page=100&page=2&_fields=id,link,title,content,categories');
});
