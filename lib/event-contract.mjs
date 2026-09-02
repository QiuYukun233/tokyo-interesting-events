/** Runtime event contract: source and editorial enrichments are optional. */
export const REQUIRED_EVENT_FIELDS = ['id', 'startDate', 'title', 'titleZh', 'place', 'time', 'price', 'vibe', 'sourceUrl'];
export const OPTIONAL_EVENT_FIELDS = ['endDate', 'source', 'imageUrl', 'why', 'changeType', 'attribution', 'audience', 'description'];
const text = (value) => typeof value === 'string' ? value.trim() : '';

export function validateEventRecord(event = {}) {
  const errors = [];
  for (const field of REQUIRED_EVENT_FIELDS) if (!text(event[field])) errors.push(`${field} is required`);
  if (text(event.startDate) && !/^\d{4}-\d{2}-\d{2}$/.test(event.startDate)) errors.push('startDate must be YYYY-MM-DD');
  if (text(event.endDate) && !/^\d{4}-\d{2}-\d{2}$/.test(event.endDate)) errors.push('endDate must be YYYY-MM-DD');
  for (const field of OPTIONAL_EVENT_FIELDS) if (event[field] != null && typeof event[field] !== 'string') errors.push(`${field} must be a string when present`);
  // Source-reported interest count (设计: 首页按热度挑若干条). Numeric, never a string.
  if (event.popularity != null && !(typeof event.popularity === 'number' && event.popularity >= 0)) errors.push('popularity must be a non-negative number when present');
  return { valid: errors.length === 0, errors };
}

export function normalizeEventRecord(event = {}) {
  return { ...event, ...Object.fromEntries(OPTIONAL_EVENT_FIELDS.map((field) => [field, text(event[field]) || null])) };
}
