/**
 * Source registry bookkeeping and silent-failure detection. Plan §3.3.
 *
 * The pipeline already reports "this source threw". What it could not report is
 * the quieter failure: a source that still returns 200 and still parses, but
 * whose parser has silently stopped matching after a site redesign. That looks
 * exactly like "no events today". These rules separate the two by comparing
 * against the source's own recent history.
 *
 * Pure functions over plain data — no fs, no clock, no network. The caller
 * supplies `now`.
 */

/** Alerts at this level or above should fail CI. */
export const CRITICAL = 'critical';
export const WARNING = 'warning';

/** How many recent runs to keep per source for the baseline. */
export const HISTORY_LENGTH = 14;

/** A count below this fraction of the trailing median is treated as a drop. */
export const DROP_RATIO = 0.5;

/** Consecutive failures before a source is considered broken rather than flaky. */
export const FAILURE_STREAK_LIMIT = 3;

const DAY_MS = 86400000;

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Stable identity for a source. `name` alone is not unique — the three Geidai
 * halls share a name and differ only by URL.
 */
export const sourceId = (source) => source.id || `${source.name}::${source.url}`;

/**
 * Fold one run's result into a source's registry entry.
 *
 * @param {object|undefined} previous  the stored entry, if this source has run before
 * @param {object} source              the static registration from sources/index.mjs
 * @param {{ok: boolean, count: number, error?: string, robotsUnavailable?: boolean}} result
 * @param {Date} now
 */
export function updateEntry(previous, source, result, now) {
  const id = sourceId(source);
  const iso = now.toISOString();
  const history = [...(previous?.history || []), { at: iso, ok: result.ok, count: result.count }].slice(-HISTORY_LENGTH);
  return {
    id,
    name: source.name,
    sourceFamily: source.sourceFamily ?? null,
    baseUrl: source.origin ?? source.url,
    accessMethod: source.accessMethod ?? 'html',
    crawlFrequency: source.crawlFrequency ?? 'daily',
    expectedUpdateWindowDays: source.expectedUpdateWindowDays ?? null,
    robotsAndTermsCheckedAt: source.robotsAndTermsCheckedAt ?? null,
    robotsUnavailable: Boolean(result.robotsUnavailable),
    parserVersion: source.parserVersion ?? null,
    trustTier: source.trustTier ?? null,
    ownerOrContact: source.ownerOrContact ?? null,
    lastRunAt: iso,
    lastSuccessAt: result.ok ? iso : (previous?.lastSuccessAt ?? null),
    lastItemCount: result.count,
    lastError: result.ok ? null : (result.error ?? 'unknown error'),
    failureStreak: result.ok ? 0 : (previous?.failureStreak ?? 0) + 1,
    history,
  };
}

/** Baseline for "how many items does this source normally yield". */
export function baselineCount(entry) {
  // Drop the run just folded in, so today's zero cannot drag down its own baseline.
  const prior = (entry.history || []).slice(0, -1);
  return median(prior.filter(({ ok }) => ok).map(({ count }) => count));
}

/**
 * Derive alerts for one entry. Returns [] when the source looks healthy.
 */
export function alertsForEntry(entry, now) {
  const alerts = [];
  const baseline = baselineCount(entry);

  if (entry.failureStreak >= FAILURE_STREAK_LIMIT) {
    alerts.push({ id: entry.id, name: entry.name, code: 'fetch_failed_repeatedly', level: CRITICAL,
      detail: `连续 ${entry.failureStreak} 次抓取失败：${entry.lastError}` });
  } else if (entry.failureStreak > 0) {
    alerts.push({ id: entry.id, name: entry.name, code: 'fetch_failed', level: WARNING,
      detail: `本次抓取失败（连续 ${entry.failureStreak} 次）：${entry.lastError}` });
  }

  if (entry.failureStreak === 0 && baseline > 0) {
    if (entry.lastItemCount === 0) {
      // A venue that is often between exhibitions legitimately reports zero;
      // only a source that reliably yields several items makes zero alarming.
      alerts.push({ id: entry.id, name: entry.name, code: 'empty_parse', level: baseline >= 3 ? CRITICAL : WARNING,
        detail: `抓取成功但解析出 0 条，历史基线 ${baseline} 条——解析器可能已失配` });
    } else if (entry.lastItemCount < baseline * DROP_RATIO) {
      alerts.push({ id: entry.id, name: entry.name, code: 'count_drop', level: WARNING,
        detail: `条数 ${entry.lastItemCount} 低于基线 ${baseline} 的 ${DROP_RATIO * 100}%` });
    }
  }

  if (entry.expectedUpdateWindowDays && entry.lastSuccessAt) {
    const days = (now.getTime() - new Date(entry.lastSuccessAt).getTime()) / DAY_MS;
    if (days > entry.expectedUpdateWindowDays) {
      alerts.push({ id: entry.id, name: entry.name, code: 'stale', level: WARNING,
        detail: `距上次成功已 ${days.toFixed(1)} 天，超过预期窗口 ${entry.expectedUpdateWindowDays} 天` });
    }
  }

  if (entry.robotsUnavailable) {
    alerts.push({ id: entry.id, name: entry.name, code: 'robots_unavailable', level: WARNING,
      detail: '取不到 robots.txt（4xx），按 RFC 9309 视为未设限制后继续抓取' });
  }

  return alerts;
}

/**
 * Fold a whole run into the registry.
 *
 * @param {{entries: object[]}} registry  previous registry (may be empty)
 * @param {object[]} sources              static registrations, in run order
 * @param {object[]} results              per-source outcomes, aligned with `sources`
 * @param {Date} now
 */
export function updateRegistry(registry, sources, results, now) {
  const previousById = new Map((registry?.entries || []).map((entry) => [entry.id, entry]));
  const entries = sources.map((source, index) => updateEntry(previousById.get(sourceId(source)), source, results[index], now));
  const alerts = entries.flatMap((entry) => alertsForEntry(entry, now));
  return { updatedAt: now.toISOString(), entries, alerts };
}

export const hasCriticalAlert = (registry) => (registry?.alerts || []).some(({ level }) => level === CRITICAL);

export function formatAlert({ name, code, level, detail }) {
  return `[${level === CRITICAL ? '严重' : '警告'}] ${name} · ${code} — ${detail}`;
}
