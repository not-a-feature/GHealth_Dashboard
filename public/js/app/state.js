import { $, isoDate, addDays } from './util.js';
import { FETCH_DAYS } from './constants.js';
import { fetchers } from './fetchers.js';
import { renderTiles, sparkJobs } from './render/tiles.js';
import { renderTodayCharts, renderTrends } from './render/today-trends.js';
import { renderWorkouts } from './render/workouts.js';
import { route } from './render/detail.js';

export const state = {
  range: 30, data: null, loadedAt: null, currentDetail: null, currentWorkout: null,
  sleepNight: null, pendingCount: 0, demo: false, woShowAll: false,
};

export const isPending = (e) => !!(e && e.pending);

export function updateStatus() {
  $('#data-status').textContent = state.pendingCount > 0
    ? 'loading…'
    : (state.loadedAt ? `updated ${state.loadedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '');
}

// Which dashboard sections each metric feeds, so a finished fetch only
// re-renders what actually changed instead of rebuilding the whole page.
const SECTIONS = {
  steps: ['tiles', 'trends'], azm: ['tiles', 'trends'], energy: ['tiles', 'trends'],
  rhr: ['tiles', 'trends'], sleep: ['tiles', 'trends'], weight: ['tiles', 'trends'],
  hrv: ['trends'], spo2: ['trends'], rr: ['trends'],
  hrzones: ['trends'], distance: ['trends'], floors: ['trends'],
  vo2max: ['trends'], bodyfat: ['trends'],
  hrToday: ['today'], exercise: ['workouts'],
};

let renderTimer = null;
const dirtySections = new Set();
export function scheduleRender(sections) {
  for (const s of sections || ['tiles', 'today', 'trends', 'workouts']) dirtySections.add(s);
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    if (!state.data) return;
    if (state.currentWorkout != null) { dirtySections.clear(); return; } // workout page manages its own async parts
    if (location.hash) { dirtySections.clear(); route(); return; } // detail page or pending deep link — rebuild via router
    const d = [...dirtySections];
    dirtySections.clear();
    if (d.includes('tiles')) { renderTiles(); for (const job of sparkJobs.splice(0)) job(); }
    if (d.includes('today')) renderTodayCharts();
    if (d.includes('trends')) renderTrends();
    if (d.includes('workouts')) renderWorkouts();
    updateStatus();
  }, 120);
}

// All metrics load in parallel (the API is HTTP/2, so requests multiplex on
// one connection); the critical set is awaited only to surface auth errors.
const CRITICAL = ['steps', 'azm', 'energy', 'rhr', 'sleep', 'weight', 'hrToday'];

// Stale-while-revalidate: seed every metric from its last cached value so the
// dashboard paints instantly, then always refetch from the API. A reload
// therefore triggers all API calls yet never flashes an empty page, and a
// failed refresh keeps the last good values on screen.
export async function loadData() {
  const now = new Date();
  const todayIso = isoDate(now);
  const startIso = isoDate(addDays(now, -FETCH_DAYS));
  const endExIso = isoDate(addDays(now, 1));
  const f = fetchers(todayIso, startIso, endExIso);
  const keys = Object.keys(f);
  const data = { todayIso, startIso };
  for (const k of keys) {
    data[k] = f[k].cached !== undefined ? { ok: true, v: f[k].cached, stale: true } : { pending: true };
  }
  state.data = data;
  state.pendingCount = keys.length;
  updateStatus();

  const run = (k) => f[k].load()
    .then((v) => ({ ok: true, v }), (err) => ({ ok: false, err }))
    .then((res) => {
      // on a failed refresh, keep the stale values we're already showing
      if (res.ok || !(data[k] && data[k].stale)) data[k] = res;
      state.pendingCount--;
      state.loadedAt = new Date();
      updateStatus();
      scheduleRender(SECTIONS[k]);
      return res;
    });

  const critical = CRITICAL.map(run);
  for (const k of keys) if (!CRITICAL.includes(k)) run(k);

  const first = await Promise.all(critical);
  if (first.every((r) => !r.ok)) {
    const auth = first.find((r) => /sign in again|Not signed in/i.test(String(r.err && r.err.message)));
    if (auth) throw auth.err;
  }
}
