import * as cheerio from 'cheerio';

const DEFAULT_ORIGIN = 'https://www.u-tokyo.ac.jp';
const compact = (value = '') => value.replace(/\s+/g, ' ').trim();

function sameOrigin(url, origin) {
  try { return new URL(url).origin === origin; } catch { return false; }
}

function tableValue($, label) {
  const row = $('.c-table-news tr').filter((_, node) => compact($(node).find('th').text()) === label).first();
  return compact(row.find('td').text());
}

/**
 * Enrich one UTokyo event from its official detail page. The function is
 * deliberately sequential (one event per call), same-origin only, and falls
 * back to the list-card event on every network/parse failure.
 */
export async function enrichUTokyoEvent(event, { fetchImpl = fetch, timeoutMs = 10000, origin = DEFAULT_ORIGIN } = {}) {
  const url = event?.sourceUrl;
  if (!sameOrigin(url, origin)) return { ...event, enrichmentStatus: 'fallback', enrichmentError: 'cross-origin detail URL rejected' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'text/html' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.url && !sameOrigin(response.url, origin)) throw new Error('cross-origin redirect rejected');
    const $ = cheerio.load(await response.text());
    const image = $('meta[property="og:image"]').attr('content') || $('.editableHtml img').first().attr('src');
    const venue = tableValue($, '会場') || tableValue($, '開催場所');
    const price = tableValue($, '参加費');
    const audience = tableValue($, '対象者');
    const summary = compact($('.editableHtml').first().find('p').map((_, node) => $(node).text()).get().join(' '));
    return {
      ...event,
      ...(image ? { imageUrl: new URL(image, url).href } : {}),
      ...(venue ? { place: venue } : {}),
      ...(price ? { price } : {}),
      ...(audience ? { audience } : {}),
      ...(summary ? { description: summary.slice(0, 1600) } : {}),
      enrichmentStatus: 'enriched',
    };
  } catch (error) {
    return { ...event, enrichmentStatus: 'fallback', enrichmentError: error instanceof Error ? error.message : String(error) };
  } finally { clearTimeout(timer); }
}
