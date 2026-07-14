import { store, civilDate, civilToIso, parseIso, addDays, isoDate } from './util.js';
import { ensureToken, refreshTokens } from './oauth.js';
import { API_BASE, TOK_KEY } from './constants.js';

// ---------- Google Health API ----------
export async function gh(path, { method = 'GET', body } = {}) {
  let token = await ensureToken();
  const doFetch = () => fetch(API_BASE + path, {
    method,
    headers: body
      ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
      : { Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  let r = await doFetch();
  if (r.status === 401) {
    await refreshTokens();
    token = store.get(TOK_KEY).access_token;
    r = await doFetch();
  }
  let j = null;
  try { j = await r.json(); } catch { j = {}; }
  if (!r.ok) {
    const msg = (j.error && (j.error.message || j.error.status)) || `HTTP ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return j;
}

// List data points, following pagination. The docs and real API disagree on
// filter field syntax, so we try each candidate filter in order, then
// unfiltered (callers always slice by date anyway), and remember per data
// type which variant the API accepted.
const FV_KEY = 'ghd_filter_variants2';
export async function listPoints(dataType, filters, { pageSize = 1000, maxPages = 8 } = {}) {
  const base = `/v4/users/me/dataTypes/${dataType}/dataPoints`;
  const candidates = [...(Array.isArray(filters) ? filters : filters ? [filters] : []), null]; // null = unfiltered
  const fetchPage = async (filter, pageToken) => {
    const q = new URLSearchParams({ pageSize: String(pageSize) });
    if (filter) q.set('filter', filter);
    if (pageToken) q.set('pageToken', pageToken);
    return gh(`${base}?${q}`);
  };
  const variants = store.get(FV_KEY) || {};
  const startAt = Math.min(variants[dataType] ?? 0, candidates.length - 1);
  let first = null;
  let used = startAt;
  for (let i = startAt; i < candidates.length; i++) {
    try {
      first = await fetchPage(candidates[i]);
      used = i;
      break;
    } catch (e) {
      if (e.status !== 400 || i === candidates.length - 1) throw e;
      console.warn(`[ghealth] ${dataType}: API rejected ${candidates[i] ? `filter \`${candidates[i]}\`` : 'unfiltered list'} — ${e.message}`);
    }
  }
  if (variants[dataType] !== used) {
    variants[dataType] = used;
    store.set(FV_KEY, variants);
  }
  const out = [...(first.dataPoints || [])];
  let token = first.nextPageToken;
  let pages = 1;
  while (token && pages < maxPages) {
    const page = await fetchPage(candidates[used], token);
    out.push(...(page.dataPoints || []));
    token = page.nextPageToken;
    pages++;
  }
  return out;
}

// range is a CivilTimeInterval: closed-open, so the end date is EXCLUSIVE —
// callers pass the day after the last day they want.
async function rollupRange(dataType, startIso, endExIso) {
  const j = await gh(`/v4/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
    method: 'POST',
    body: {
      range: { start: { date: civilDate(startIso) }, end: { date: civilDate(endExIso) } },
      windowSizeDays: 1,
    },
  });
  return j.rollupDataPoints || j.dataPoints || [];
}

// The API rejects long ranges with "invalid argument" for more data types
// than the documented 14-day-cap list (steps/azm/energy 400 at ~90 days
// too), so always request 14-day chunks, fetched in parallel since each
// chunk is independent.
export async function dailyRollup(dataType, startIso, endExIso) {
  const ranges = [];
  let s = parseIso(startIso);
  const endEx = parseIso(endExIso);
  while (s < endEx) {
    const e = new Date(Math.min(addDays(s, 14).getTime(), endEx.getTime()));
    ranges.push([isoDate(s), isoDate(e)]);
    s = e;
  }
  const chunks = await Promise.all(ranges.map(([a, b]) => rollupRange(dataType, a, b)));
  return chunks.flat();
}

// The data union: the one key on a DataPoint besides name/dataSource.
const META_KEYS = new Set(['name', 'dataSource']);
export const unionOf = (p) => {
  for (const k of Object.keys(p)) if (!META_KEYS.has(k)) return p[k];
  return null;
};

const isNumLike = (v) => (typeof v === 'number' || (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))));

// Preferred value fields per metric, then any numeric field as fallback —
// defensive against schema fields we haven't seen.
function pickValue(obj, preferred = []) {
  for (const k of preferred) if (obj && isNumLike(obj[k])) return Number(obj[k]);
  for (const [k, v] of Object.entries(obj || {})) {
    if (k === 'date' || k.endsWith('Metadata') || typeof v === 'object') continue;
    if (isNumLike(v)) return Number(v);
  }
  return null;
}

export function rollupToSeries(points) {
  const out = [];
  for (const p of points) {
    const date = civilToIso(p.civilStartTime);
    if (!date) continue;
    let value = null;
    for (const [k, v] of Object.entries(p)) {
      if (['civilStartTime', 'civilEndTime', 'dataSourceFamily'].includes(k)) continue;
      if (v && typeof v === 'object') {
        value = pickValue(v, ['countSum', 'kcalSum', 'minutesSum', 'activeZoneMinutesSum', 'millimetersSum', 'bpmAvg']);
        break;
      }
    }
    out.push({ date, value });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function dailyTypeToSeries(points, preferred) {
  const out = [];
  for (const p of points) {
    const u = unionOf(p);
    if (!u) continue;
    const date = civilToIso(u.date);
    if (!date) continue;
    const value = pickValue(u, preferred);
    if (value != null) out.push({ date, value });
  }
  const byDate = new Map(out.map((r) => [r.date, r]));
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
