import { Charts } from '../../charts/index.js';
import { $, hm } from '../util.js';
import { show } from '../ui.js';
import { state, isPending } from '../state.js';
import { axisDates, seriesOnAxis } from '../series.js';
import { statRow, seriesStats, appendTable, cardWrap } from './cards.js';
import { navFlag } from '../nav-state.js';
import { showWorkoutPage } from './workouts.js';
import { renderAll } from './today-trends.js';

// HR zone stack (LIGHT→PEAK, matching the API enum) — shared by the trends
// card and the detail page.
export const HRZONE_SERIES = [
  { key: 'light', name: 'Light', color: 'var(--hr-z1)' },
  { key: 'moderate', name: 'Moderate', color: 'var(--hr-z2)' },
  { key: 'vigorous', name: 'Vigorous', color: 'var(--hr-z3)' },
  { key: 'peak', name: 'Peak', color: 'var(--hr-z4)' },
];

export const METRIC_DETAILS = {
  steps: { title: 'Steps', color: '--c-steps', kind: 'column', fmt: (v) => Charts.fmtNum(Math.round(v)) },
  azm: { title: 'Active zone minutes', color: '--c-azm', kind: 'column', fmt: (v) => Charts.fmtNum(Math.round(v)) + ' min' },
  energy: { title: 'Active energy', color: '--c-cal', kind: 'column', fmt: (v) => Charts.fmtNum(Math.round(v)) + ' kcal' },
  distance: { title: 'Distance', color: '--c-dist', kind: 'column', dec: 2, fmt: (v) => Charts.fmtNum(v, 2) + ' km' },
  floors: { title: 'Floors climbed', color: '--c-floors', kind: 'column', fmt: (v) => Charts.fmtNum(Math.round(v)) },
  rhr: { title: 'Resting heart rate', color: '--c-hr', kind: 'line', fmt: (v) => Charts.fmtNum(v, 1) + ' bpm' },
  weight: { title: 'Weight', color: '--c-weight', kind: 'line', dots: true, dec: 1, fmt: (v) => Charts.fmtNum(v, 1) + ' kg' },
  bodyfat: { title: 'Body fat', color: '--c-fat', kind: 'line', dots: true, dec: 1, fmt: (v) => Charts.fmtNum(v, 1) + ' %' },
  vo2max: { title: 'VO₂ max (cardio fitness)', color: '--c-vo2', kind: 'line', dec: 1, fmt: (v) => Charts.fmtNum(v, 1) },
  hrv: { title: 'Heart rate variability', color: '--c-hrv', kind: 'line', fmt: (v) => Charts.fmtNum(v, 0) + ' ms' },
  spo2: { title: 'Oxygen saturation (SpO₂)', color: '--c-spo2', kind: 'line', dec: 1, fmt: (v) => Charts.fmtNum(v, 1) + ' %' },
  rr: { title: 'Respiratory rate', color: '--c-rr', kind: 'line', dec: 1, fmt: (v) => Charts.fmtNum(v, 1) + ' br/min' },
  hrzones: {
    title: 'Heart rate zones', kind: 'stacked', series: HRZONE_SERIES,
    fmt: (v) => Charts.fmtNum(Math.round(v)) + ' min',
    parts: (r) => ({ light: r.light, moderate: r.moderate, vigorous: r.vigorous, peak: r.peak }),
  },
};

export function buildMetricDetail(body, key) {
  const D = state.data;
  const axis = axisDates(D.startIso, D.todayIso);
  if (key === 'sleep') {
    if (isPending(D.sleep)) return Charts.emptyNote(body, 'Loading…');
    if (!D.sleep.ok) return Charts.emptyNote(body, `Couldn't load: ${String(D.sleep.err && D.sleep.err.message)}`);
    const days = D.sleep.v.days;
    if (!days.length) return Charts.emptyNote(body);
    const sessions = D.sleep.v.sessions || [];
    const seriesDef = [
      { key: 'deep', name: 'Deep', color: 'var(--sleep-deep)' },
      { key: 'light', name: 'Light', color: 'var(--sleep-light)' },
      { key: 'rem', name: 'REM', color: 'var(--sleep-rem)' },
      { key: 'awake', name: 'Awake', color: 'var(--sleep-awake)' },
    ];
    const byDate = new Map(days.map((r) => [r.date, r]));
    statRow(body, seriesStats(days.map((r) => ({ date: r.date, value: r.asleep })), hm));

    // one night's hypnogram — last night by default, or the clicked day
    const nightDates = [...new Set(sessions.filter((s) => s.segments.length).map((s) => s.dateIso))];
    const selDate = nightDates.includes(state.sleepNight)
      ? state.sleepNight
      : nightDates[nightDates.length - 1];
    if (selDate) {
      const nights = sessions.filter((s) => s.dateIso === selDate && s.segments.length);
      const startMs = Math.min(...nights.map((s) => s.startMs));
      const endMs = Math.max(...nights.map((s) => s.endMs));
      const segments = nights.flatMap((s) => s.segments);
      const h3 = document.createElement('h3');
      h3.className = 'detail-section-title';
      h3.textContent = `Night of ${Charts.longDate(selDate)}`;
      const hint = document.createElement('span');
      hint.className = 'night-hint';
      hint.textContent = ' — click a bar below to see another night';
      h3.appendChild(hint);
      body.appendChild(h3);
      // hypnogram track order mirrors the app: awake on top, deep at the bottom
      Charts.stageTracks(cardWrap(body), {
        segments,
        stages: [
          { key: 'awake', name: 'Awake', color: 'var(--sleep-awake)' },
          { key: 'rem', name: 'REM', color: 'var(--sleep-rem)' },
          { key: 'light', name: 'Light sleep', color: 'var(--sleep-light)' },
          { key: 'deep', name: 'Deep sleep', color: 'var(--sleep-deep)' },
        ],
        startMs, endMs,
      });
    }
    // bed/wake consistency for the nights we have sessions for
    if (sessions.length) {
      const sh3 = document.createElement('h3');
      sh3.className = 'detail-section-title';
      sh3.textContent = 'Sleep schedule';
      body.appendChild(sh3);
      Charts.sleepSchedule(cardWrap(body), { sessions, color: 'var(--sleep-light)' });
    }
    const cb = cardWrap(body);
    Charts.stackedColumns(cb, {
      data: axis.map((d) => {
        const r = byDate.get(d);
        return { date: d, parts: r ? { deep: r.deep, light: r.light, rem: r.rem, awake: r.awake } : {} };
      }),
      series: seriesDef, fmt: hm, height: 300,
      onBarClick: (i) => {
        if (nightDates.includes(axis[i])) {
          state.sleepNight = axis[i];
          showDetailPage('sleep');
        }
      },
    });
    Charts.legend(cb, seriesDef);
    appendTable(body, ['Date', 'Deep', 'Light', 'REM', 'Awake', 'Asleep total'],
      [...days].reverse().map((r) => [r.date, hm(r.deep), hm(r.light), hm(r.rem), hm(r.awake), hm(r.asleep)]),
      'sleep');
    return;
  }
  const cfg = METRIC_DETAILS[key];
  const entry = D[key];
  if (isPending(entry)) return Charts.emptyNote(body, 'Loading…');
  if (!entry || !entry.ok) return Charts.emptyNote(body, entry ? `Couldn't load: ${String(entry.err && entry.err.message)}` : 'Unknown metric.');
  if (cfg.kind === 'stacked') {
    const rows = entry.v; // [{date, <part keys>}]
    if (!rows.length) return Charts.emptyNote(body);
    const total = (r) => cfg.series.reduce((a, s) => a + (r[s.key] || 0), 0);
    const byDate = new Map(rows.map((r) => [r.date, r]));
    statRow(body, seriesStats(rows.map((r) => ({ date: r.date, value: total(r) })), cfg.fmt));
    const scb = cardWrap(body);
    Charts.stackedColumns(scb, {
      data: axis.map((d) => {
        const r = byDate.get(d);
        return { date: d, parts: r ? cfg.parts(r) : {} };
      }),
      series: cfg.series, fmt: cfg.fmt, height: 300,
    });
    Charts.legend(scb, cfg.series);
    appendTable(body, ['Date', ...cfg.series.map((s) => s.name), 'Total'],
      [...rows].reverse().map((r) => [r.date, ...cfg.series.map((s) => cfg.fmt(r[s.key] || 0)), cfg.fmt(total(r))]),
      cfg.title);
    return;
  }
  const series = entry.v;
  if (!series.length) return Charts.emptyNote(body);
  statRow(body, seriesStats(series, cfg.fmt));
  const cb = cardWrap(body);
  if (cfg.kind === 'column') {
    const byDate = new Map(series.map((r) => [r.date, r.value]));
    Charts.columnChart(cb, {
      data: axis.map((d) => ({ date: d, value: byDate.has(d) ? byDate.get(d) : null })),
      color: `var(${cfg.color})`, fmt: cfg.dec ? (v) => Charts.fmtNum(v, cfg.dec) : Charts.compact, height: 300,
    });
  } else {
    Charts.lineChart(cb, {
      labels: axis,
      series: [{ name: cfg.title, color: `var(${cfg.color})`, values: seriesOnAxis(axis, series) }],
      fmt: (v) => Charts.fmtNum(v, cfg.dec || 0), dots: cfg.dots, area: true, height: 300,
    });
  }
  appendTable(body, ['Date', cfg.title], [...series].reverse().map((r) => [r.date, cfg.fmt(r.value)]), cfg.title);
}

// ---------- detail pages (hash-routed: #m/steps, #m/sleep, …) ----------
export function goDetail(key) {
  navFlag.internal = true;
  location.hash = 'm/' + key;
}
export function showDetailPage(key) {
  state.currentDetail = key;
  state.currentWorkout = null;
  show('view-detail');
  $('#detail-title').textContent = key === 'sleep' ? 'Sleep' : METRIC_DETAILS[key].title;
  $('#detail-sub').textContent = 'last 90 days';
  const body = $('#detail-body');
  body.textContent = '';
  buildMetricDetail(body, key);
  window.scrollTo(0, 0);
}
export function route() {
  if (!state.data) return;
  const m = location.hash.match(/^#m\/(\w+)$/);
  const key = m && m[1];
  if (key && (key === 'sleep' || METRIC_DETAILS[key])) return showDetailPage(key);
  const wm = location.hash.match(/^#w\/(\d+)$/);
  if (wm && state.data.exercise && state.data.exercise.ok) return showWorkoutPage(Number(wm[1]));
  if (wm && isPending(state.data.exercise)) return; // workouts still loading — stay put, route() re-runs when they land
  state.currentDetail = null;
  state.currentWorkout = null;
  show('view-dashboard');
  renderAll();
}
window.addEventListener('hashchange', route);
