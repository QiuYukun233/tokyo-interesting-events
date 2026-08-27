function normalize(value = '') {
  return String(value).normalize('NFKC').toLocaleLowerCase('ja-JP')
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

function bigrams(value) {
  const text = normalize(value);
  const grams = new Set();
  for (let index = 0; index < text.length - 1; index += 1) grams.add(text.slice(index, index + 2));
  return grams;
}

export function titleOverlap(left, right) {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}

export function areNearDuplicateEvents(left, right) {
  if (!left?.startDate || left.startDate !== right?.startDate) return false;
  if (left.sourceUrl && left.sourceUrl === right.sourceUrl) return true;
  return titleOverlap(left.title, right.title) >= 0.72;
}

function richness(event) {
  return ['title', 'description', 'place', 'time', 'price', 'endDate']
    .reduce((score, key) => score + String(event?.[key] || '').length, 0);
}

function mergePair(left, right) {
  const preferred = richness(right) > richness(left) ? right : left;
  const other = preferred === left ? right : left;
  const urls = [...new Set([preferred.sourceUrl, ...(preferred.alternateSourceUrls || []), other.sourceUrl, ...(other.alternateSourceUrls || [])].filter(Boolean))];
  return { ...preferred, alternateSourceUrls: urls.filter((url) => url !== preferred.sourceUrl), duplicateCount: urls.length };
}

export function dedupeNearDuplicateEvents(events = []) {
  const kept = [];
  for (const event of events) {
    const index = kept.findIndex((candidate) => areNearDuplicateEvents(candidate, event));
    if (index === -1) kept.push(event);
    else kept[index] = mergePair(kept[index], event);
  }
  return kept;
}
