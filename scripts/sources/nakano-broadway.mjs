import * as cheerio from 'cheerio';
import { createEventCandidate } from '../lib/event-utils.mjs';

/**
 * 中野ブロードウェイ — one building, read as a directory of the shops inside it.
 *
 * A different shape again from the fair rosters: not "who exhibited once", but
 * **who is permanently upstairs in this building**. Nakano Broadway is four
 * floors of very small, very specific shops — 85 of its 207 tenants are filed
 * by the building itself under サブカルチャー — and almost none of them are
 * street-facing, which is exactly the kind of place lib/activity-filter.mjs's
 * `signal:off_street` was added for. Feeding this source through that rule set
 * labels most of these automatically.
 *
 * `wp-json/wp/v2/posts?per_page=100` returns everything in three requests, each
 * tenant carrying its own description, opening hours and SNS links.
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
 * Reduce the post body to its opening prose.
 *
 * The editor leaves long runs of empty block markup between paragraphs, so a
 * naive text extraction yields a paragraph followed by hundreds of blank lines.
 */
export function summarise(html = '', limit = 400) {
  const text = cheerio.load(html).root().text();
  const lines = text.split('\n').map((line) => compact(line)).filter(Boolean);
  return lines.join(' ').slice(0, limit);
}

/**
 * One tenant post → one `place` candidate.
 * @param {object} post
 * @param {{floors: object, genres: object}} taxonomy
 * @param {{name: string, startDate: string}} source
 */
export function mapTenant(post, taxonomy, source, index = 0) {
  const title = compact(decode(post?.title?.rendered));
  const ids = post?.categories ?? [];
  const floor = ids.map((id) => taxonomy.floors?.[id]).find(Boolean);
  // No floor means this is a notice, not a tenant.
  if (!title || !floor || !source?.startDate) return null;

  const genre = ids.map((id) => taxonomy.genres?.[id]).find(Boolean);
  const description = summarise(post?.content?.rendered ?? '');
  const candidate = createEventCandidate({
    sourceName: source.name,
    sourceUrl: post.link,
    title,
    startDate: source.startDate,
    // The floor goes into `place` so lib/activity-filter.mjs reads it as
    // `signal:off_street` — which for this building is true of nearly all of them.
    place: `${NAKANO_BROADWAY_ADDRESS} ${floor}`,
    time: '详见店铺',
    price: '详见店铺',
    text: `${title} ${genre ?? ''} ${description} 中野ブロードウェイ`,
    visualIndex: index,
  });
  return candidate && {
    ...candidate,
    ongoing: true,
    changeType: 'discovery',
    ...(genre ? { category: genre } : {}),
    ...(description ? { description } : {}),
    attribution: '中野ブロードウェイ 公式店舗情報',
    why: `中野ブロードウェイ${floor}の一区画。ビルごと専門店の集合体で、店の外からは中身が読めない。`,
  };
}

/** Map a page of posts, dropping anything that is not a tenant. */
export function mapTenants(posts = [], taxonomy, source) {
  return posts.map((post, index) => mapTenant(post, taxonomy, source, index)).filter(Boolean);
}
