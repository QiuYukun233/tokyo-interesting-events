import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * 中野ブロードウェイ — **one building, one candidate.**
 *
 * The building is four floors of very small, very specific shops: 207 tenants,
 * 85 of them filed by the building itself under サブカルチャー, almost none
 * street-facing.
 *
 * ## Why this emits one candidate and not 207
 *
 * The first version pooled every tenant separately, and that was the wrong
 * granularity. **For deciding where to go, all 207 shops are the same
 * destination** — you go to Nakano Broadway once and you have covered them
 * all. 207 rows would be 207 near-identical answers to "where should we go
 * this weekend", flooding both the review queue and, later, the discovery
 * queue (方案 §7.1 wants variety in a round, which this defeats outright).
 *
 * Measured before the change: 524 place candidates in the pool collapsed to
 * 309 distinct street addresses, and 207 of that gap was this one building.
 * Nothing else in the pool had more than three candidates at one address.
 *
 * **The rule this establishes: one address, one candidate.** Shops spread
 * across a district (モノマチ's 125 workshops, each at its own address) stay
 * separate, because those are genuinely separate trips.
 *
 * The tenant list is not thrown away — it is what the card is made of. What
 * makes this building worth a trip is precisely "207 specialist shops, 85 of
 * them subculture", which is a fact about the whole building.
 *
 * `wp-json/wp/v2/posts?per_page=100` returns every tenant in three requests.
 *
 * ## Floors come from the taxonomy, not the text
 *
 * The building files every tenant twice: once under カテゴリ別店舗情報 (genre)
 * and once under フロア別店舗情報 (floor, including 地下1階 and the プチパリ
 * arcade). The post body mentions a floor in only 6 of 208 cases, so the
 * categories are the reliable source. The ids are read from the live taxonomy
 * rather than hardcoded, since a WordPress category id is an implementation
 * detail of one install.
 *
 * ## Not every post is a shop
 *
 * NEWS&TOPICS entries (a children's drawing contest, for instance) sit in the
 * same `posts` collection. A post with no floor category is not a tenant, and
 * is dropped — the floor is both the useful field and the reliable filter.
 */
export const NAKANO_BROADWAY_ORIGIN = 'https://nakano-broadway.com';
export const NAKANO_BROADWAY_ADDRESS = '東京都中野区中野5-52-15 中野ブロードウェイ';

export const postsUrl = (page) => `${NAKANO_BROADWAY_ORIGIN}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=id,link,title,content,categories`;
export const CATEGORIES_URL = `${NAKANO_BROADWAY_ORIGIN}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,count,parent`;

/** Parent category names that group the two axes the building files tenants under. */
const FLOOR_PARENT = 'フロア別店舗情報';
const GENRE_PARENT = 'カテゴリ別店舗情報';

const compact = (value = '') => String(value).replace(/[\s ]+/g, ' ').trim();
const decode = (value = '') => cheerio.load(`<div>${value}</div>`).root().text();

/**
 * Turn the live category list into `{floors, genres}` id→name maps.
 * @param {Array<{id:number,name:string,parent:number}>} categories
 */
export function buildTaxonomy(categories = []) {
  const idOf = (name) => categories.find((category) => compact(decode(category.name)) === name)?.id;
  const childrenOf = (parent) => Object.fromEntries(
    categories.filter((category) => category.parent === parent && parent !== undefined)
      .map((category) => [category.id, compact(decode(category.name))]),
  );
  return { floors: childrenOf(idOf(FLOOR_PARENT)), genres: childrenOf(idOf(GENRE_PARENT)) };
}

/**
 * Read one post as a tenant record: `{name, floor, genre}`, or null if the post
 * is a notice rather than a shop.
 *
 * NEWS&TOPICS entries sit in the same `posts` collection. A post with no floor
 * category is not a tenant — the floor is both the useful field and the filter.
 */
export function readTenant(post, taxonomy) {
  const name = compact(decode(post?.title?.rendered));
  const ids = post?.categories ?? [];
  const floor = ids.map((id) => taxonomy.floors?.[id]).find(Boolean);
  if (!name || !floor) return null;
  return { name, floor, genre: ids.map((id) => taxonomy.genres?.[id]).find(Boolean) ?? null };
}

const countBy = (items, key) => items.reduce((counts, item) => {
  if (item[key]) counts.set(item[key], (counts.get(item[key]) ?? 0) + 1);
  return counts;
}, new Map());

const ranked = (counts) => [...counts].sort((a, b) => b[1] - a[1]);

/**
 * Describe the building from its tenants.
 *
 * This is the card's whole content, so it has to answer "why go" for the
 * building as a unit: how many shops, of what kinds, on how many floors.
 */
export function describeBuilding(tenants = []) {
  if (!tenants.length) return null;
  const genres = ranked(countBy(tenants, 'genre'));
  const floors = ranked(countBy(tenants, 'floor')).length;
  const breakdown = genres.slice(0, 4).map(([genre, count]) => `${genre}${count}`).join('・');
  return `専門店${tenants.length}軒が${floors}フロアに密集。${breakdown}。`;
}

/**
 * All tenants → **one** `place` candidate for the building.
 *
 * @param {Array} posts       the raw `posts` collection
 * @param {{floors: object, genres: object}} taxonomy
 * @param {{name: string, startDate: string}} source
 */
export function mapBuilding(posts = [], taxonomy, source) {
  const tenants = posts.map((post) => readTenant(post, taxonomy)).filter(Boolean);
  if (!tenants.length || !source?.startDate) return null;

  const description = describeBuilding(tenants);
  const genres = ranked(countBy(tenants, 'genre')).map(([genre]) => genre);
  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: `${NAKANO_BROADWAY_ORIGIN}/floor/`,
    title: '中野ブロードウェイ',
    startDate: source.startDate,
    place: NAKANO_BROADWAY_ADDRESS,
    time: '详见各店',
    price: '详见各店',
    text: `中野ブロードウェイ ${genres.join(' ')} ${tenants.map((tenant) => tenant.name).join(' ')}`,
  });
  return candidate && {
    ...candidate,
    ongoing: true,
    changeType: 'discovery',
    category: genres[0] ?? 'サブカルチャー',
    description,
    attribution: '中野ブロードウェイ 公式店舗情報',
    why: '一つの建物にサブカル専門店がぎっしり。中に入ってしまえば一日中はしごできるので、行き先としてはここ一つで足りる。',
  };
}
