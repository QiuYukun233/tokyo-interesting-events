import { parseRssFeed } from 'feedsmith';
import { createEventCandidate, dateFrom, hasEventKeyword } from '../lib/event-utils.mjs';

export function parseRss(xml, source) {
  const feed = parseRssFeed(xml);
  return (feed.items || []).flatMap((item, index) => {
    const title = item.title || '';
    const description = item.description || item.content?.encoded || '';
    const text = `${title} ${description}`;
    const startDate = dateFrom(text);
    if (!startDate || !hasEventKeyword(text)) return [];
    const candidate = createEventCandidate({ sourceName: source.name, sourceUrl: item.link || item.guid?.value || '', title, startDate, text: description, visualIndex: index });
    return candidate ? [candidate] : [];
  });
}
