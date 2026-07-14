import { Charts } from '../../charts/index.js';
import { $, store } from '../util.js';
import { HR_ZONES } from '../constants.js';
import { state, isPending } from '../state.js';
import { navFlag } from '../nav-state.js';
import { cardWrap, statRow } from './cards.js';
import { cached } from '../cache.js';
import { listPoints, unionOf, gh } from '../api.js';
import { timeFilters } from '../filters.js';
import { demoWorkoutHr, demoRoute } from '../demo.js';
import { show } from '../ui.js';

const durFmt = (sec) => {
  if (sec == null) return '—';
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`;
};
const paceFmt = (secPerKm) => {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return null;
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
};

// ---------- workout detail page (#w/<index>) ----------
export function goWorkout(i) {
  navFlag.internal = true;
  location.hash = 'w/' + i;
}

// Heart rate during one activity, bucketed per minute of the workout.
async function fetchWorkoutHr(w) {
  if (state.demo) return demoWorkoutHr(w);
  if (!w.startMs || !w.endMs) throw new Error('no time interval on this activity');
  return cached(`wohr:${w.startMs}`, 24 * 3600 * 1000, async () => {
    const startUtc = new Date(w.startMs - 60000).toISOString();
    const endUtc = new Date(w.endMs + 60000).toISOString();
    const filters = timeFilters('heart-rate', 'sample_time.physical_time', startUtc, endUtc);
    const points = await listPoints('heart-rate', filters, { pageSize: 10000, maxPages: 3 });
    const buckets = new Map();
    for (const p of points) {
      const hrp = p.heartRate || unionOf(p);
      if (!hrp || hrp.beatsPerMinute == null || !hrp.sampleTime || !hrp.sampleTime.physicalTime) continue;
      const t = new Date(hrp.sampleTime.physicalTime).getTime();
      if (t < w.startMs - 60000 || t > w.endMs + 60000) continue;
      const slot = Math.max(0, Math.floor((t - w.startMs) / 60000));
      const b = buckets.get(slot) || { sum: 0, n: 0 };
      b.sum += Number(hrp.beatsPerMinute);
      b.n++;
      buckets.set(slot, b);
    }
    return [...buckets.entries()]
      .map(([slot, b]) => ({ slot, value: Math.round(b.sum / b.n) }))
      .sort((a, b) => a.slot - b.slot);
  });
}

// A google.api.HttpBody wraps the TCX as base64 in `data`; decode it to XML.
// (Older/edge responses may inline the XML as a string instead.)
function decodeHttpBody(body) {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  const b64 = body.data || body.body;
  if (!b64) return typeof body.contents === 'string' ? body.contents : '';
  const bin = atob(String(b64).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

// GPS track via exportExerciseTcx. The raw `?alt=media` download endpoint
// sends no CORS headers (the browser blocks reading it despite a 200), so we
// request the default JSON response — served from the CORS-enabled API — which
// returns an HttpBody wrapping the TCX as base64.
const downsample = (arr, cap) => {
  if (arr.length <= cap) return arr;
  const step = Math.ceil(arr.length / cap);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
};

// Returns {points, samples}: points = lat/lon for the map; samples = per-
// trackpoint {tMs, distM, altM} feeding the pace-split and elevation charts.
async function fetchWorkoutRoute(w) {
  if (state.demo) return demoRoute(w);
  if (!w.id) throw new Error('no track reference on this activity');
  return cached(`wotcx3:${w.id}`, 7 * 24 * 3600 * 1000, async () => {
    const body = await gh(
      `/v4/users/me/dataTypes/exercise/dataPoints/${encodeURIComponent(w.id)}:exportExerciseTcx`,
    );
    const text = decodeHttpBody(body);
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const points = [];
    const samples = [];
    const num = (tp, tag) => {
      const el = tp.querySelector(tag);
      const n = el ? Number(el.textContent) : NaN;
      return Number.isNaN(n) ? null : n;
    };
    for (const tp of doc.querySelectorAll('Trackpoint')) {
      const lat = num(tp, 'LatitudeDegrees');
      const lon = num(tp, 'LongitudeDegrees');
      if (lat != null && lon != null) points.push({ lat, lon });
      const timeEl = tp.querySelector('Time');
      const tMs = timeEl ? new Date(timeEl.textContent).getTime() : NaN;
      const distM = num(tp, 'DistanceMeters');
      if (!Number.isNaN(tMs) && distM != null) {
        samples.push({ tMs, distM, altM: num(tp, 'AltitudeMeters') });
      }
    }
    // downsample both before caching (localStorage quota)
    return { points: downsample(points, 500), samples: downsample(samples, 500) };
  });
}

// Time per kilometer from the cumulative distance samples: interpolate the
// timestamp at each km boundary; a trailing partial km counts when it's at
// least 200 m (its pace normalized to sec/km).
function paceSplits(samples) {
  const s = samples.filter((p) => p.distM != null).sort((a, b) => a.distM - b.distM);
  if (s.length < 2) return [];
  const totalM = s[s.length - 1].distM - s[0].distM;
  if (totalM < 400) return [];
  const t0 = s[0].tMs, d0 = s[0].distM;
  const timeAt = (m) => { // linear interpolation on cumulative distance
    for (let i = 1; i < s.length; i++) {
      if (s[i].distM - d0 >= m) {
        const a = s[i - 1], b = s[i];
        const span = b.distM - a.distM;
        const f = span > 0 ? (m - (a.distM - d0)) / span : 0;
        return a.tMs + (b.tMs - a.tMs) * f;
      }
    }
    return s[s.length - 1].tMs;
  };
  const out = [];
  let prevT = t0;
  const fullKm = Math.floor(totalM / 1000);
  for (let k = 1; k <= fullKm; k++) {
    const t = timeAt(k * 1000);
    out.push({ label: String(k), secPerKm: (t - prevT) / 1000 });
    prevT = t;
  }
  const restM = totalM - fullKm * 1000;
  if (restM >= 200) {
    const t = s[s.length - 1].tMs;
    out.push({
      label: (totalM / 1000).toFixed(1),
      secPerKm: ((t - prevT) / 1000) * (1000 / restM),
    });
  }
  return out.filter((r) => Number.isFinite(r.secPerKm) && r.secPerKm > 0);
}

export function showWorkoutPage(i) {
  const D = state.data;
  const w = D && D.exercise && D.exercise.ok && D.exercise.v[i];
  if (!w) { location.hash = ''; return; }
  state.currentDetail = null;
  state.currentWorkout = i;
  show('view-detail');
  $('#detail-title').textContent = `${woIcon(w.name)} ${w.name}`;
  $('#detail-sub').textContent = `${Charts.longDate(w.dateIso)}${w.timeStr ? ' · ' + w.timeStr : ''}`;
  const body = $('#detail-body');
  body.textContent = '';
  statRow(body, [
    { label: 'duration', value: durFmt(w.durSec) },
    { label: 'distance', value: w.distanceKm != null ? Charts.fmtNum(w.distanceKm, 2) + ' km' : null },
    { label: 'avg pace', value: paceFmt(w.paceSecPerKm) },
    { label: 'calories', value: w.kcal != null ? Charts.fmtNum(w.kcal) + ' kcal' : null },
    { label: 'avg heart rate', value: w.avgHr != null ? Charts.fmtNum(w.avgHr) + ' bpm' : null },
    { label: 'steps', value: w.steps != null ? Charts.fmtNum(w.steps) : null },
    { label: 'active zone minutes', value: w.azm != null ? Charts.fmtNum(w.azm) + ' min' : null },
    { label: 'elevation gain', value: w.elevM != null ? Charts.fmtNum(w.elevM) + ' m' : null },
  ]);

  // Each async section can remove itself (title + card) when it turns out
  // there is no data for it, instead of showing a "no data" note.
  const section = (title) => {
    const h3 = document.createElement('h3');
    h3.className = 'detail-section-title';
    h3.textContent = title;
    body.appendChild(h3);
    const box = cardWrap(body);
    const card = box.closest('.card');
    return {
      box,
      remove: () => { h3.remove(); card.remove(); },
      // inline display beats any .card stylesheet rule, so this reliably
      // hides/reveals the whole section (title + card)
      setHidden: (hidden) => { h3.style.display = card.style.display = hidden ? 'none' : ''; },
    };
  };
  const paint = (sec, fn) => {
    sec.box.textContent = '';
    fn(sec.box);
  };

  const hr = section('Heart rate during activity');
  Charts.emptyNote(hr.box, 'Loading heart rate…');
  const durLabel = (m) => (m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}h` : `${m}m`);
  fetchWorkoutHr(w).then((pts) => {
    if (!hr.box.isConnected) return;
    if (!pts.length) return hr.remove();
    paint(hr, (b) => Charts.lineChart(b, {
      labels: pts.map((p) => String(p.slot)),
      tickLabels: pts.map((p) => durLabel(p.slot)),
      titleForIndex: (ix) => `${durLabel(pts[ix].slot)} in`,
      series: [{ name: 'Heart rate', color: 'var(--c-hr)', values: pts.map((p) => p.value) }],
      unit: 'bpm', area: true, height: 240, zones: HR_ZONES,
    }));
  }).catch(() => {
    if (hr.box.isConnected) hr.remove();
  });

  if (w.distanceKm != null && w.distanceKm > 0.05) {
    // One TCX fetch feeds three sections (route map, pace splits, elevation).
    // All stay hidden until their data actually exists — no empty map box or
    // "Loading…" placeholder; the map is revealed *before* Leaflet initialises,
    // so the container already has its real size.
    const map = section('Route');
    const pace = section('Pace per km');
    const elev = section('Elevation');
    map.setHidden(true);
    pace.setHidden(true);
    elev.setHidden(true);
    fetchWorkoutRoute(w).then(({ points, samples }) => {
      if (!map.box.isConnected) return;
      if (points.length >= 2) {
        map.setHidden(false);
        paint(map, (b) => Charts.routeMap(b, { points, color: 'var(--c-steps)' }));
      } else map.remove();

      const splits = paceSplits(samples);
      if (splits.length) {
        pace.setHidden(false);
        paint(pace, (b) => Charts.columnChart(b, {
          data: splits.map((sp) => ({ date: sp.label, value: sp.secPerKm })),
          color: 'var(--c-azm)', height: 220,
          fmt: (v) => paceFmt(v) || '—',
          xFmt: (lab) => lab, titleFmt: (lab) => `Kilometre ${lab}`,
        }));
      } else pace.remove();

      const alts = samples.filter((sm) => sm.altM != null);
      if (alts.length >= 2) {
        const startM = alts[0].distM;
        const kmLab = (sm) => ((sm.distM - startM) / 1000).toFixed(1) + ' km';
        elev.setHidden(false);
        paint(elev, (b) => Charts.lineChart(b, {
          labels: alts.map((sm) => String(sm.distM)),
          tickLabels: alts.map(kmLab),
          titleForIndex: (ix) => kmLab(alts[ix]),
          series: [{ name: 'Elevation', color: 'var(--c-floors)', values: alts.map((sm) => sm.altM) }],
          unit: 'm', area: true, height: 200, endLabel: false, dots: false,
        }));
      } else elev.remove();
    }).catch((e) => {
      if (!map.box.isConnected) return;
      pace.remove();
      elev.remove();
      // 403 = the token predates the location scope — data may well exist,
      // so ask for a re-consent instead of silently hiding the card.
      if (e.status === 403) {
        map.setHidden(false);
        paint(map, (b) => Charts.emptyNote(b, 'GPS routes need the location permission — please sign out and sign in again to grant it.'));
      } else {
        map.remove();
      }
    });
  }
  window.scrollTo(0, 0);
}

const WO_FILTER_KEY = 'ghd_wo_filter';
const woFilter = () => ({ on: false, minMin: 5, minKm: 1, ...(store.get(WO_FILTER_KEY) || {}) });

const WO_ICONS = [
  [/run|lauf|jog/i, '🏃'],
  [/ride|bike|cycl|rad/i, '🚴'],
  [/walk|spazier|gehen/i, '🚶'],
  [/hike|wander/i, '🥾'],
  [/strength|weight|kraft|gym/i, '🏋️'],
  [/swim|schwimm/i, '🏊'],
  [/yoga|pilates|stretch/i, '🧘'],
  [/hiit|aerobic|cardio|workout|circuit/i, '🔥'],
  [/tennis|padel|squash|badminton/i, '🎾'],
  [/soccer|football|fussball|fußball/i, '⚽'],
  [/row|ruder/i, '🚣'],
  [/ski|snowboard/i, '⛷️'],
];
const woIcon = (name) => {
  for (const [re, icon] of WO_ICONS) if (re.test(name)) return icon;
  return '⚡';
};

export function renderWorkouts() {
  const wrap = $('#workout-list');
  wrap.textContent = '';
  const D = state.data;
  if (!D.exercise) return;
  if (isPending(D.exercise)) {
    $('#workouts-sub').textContent = 'loading…';
    const d = document.createElement('div');
    d.className = 'empty-note card';
    d.textContent = 'Loading workouts…';
    wrap.appendChild(d);
    return;
  }
  const f = woFilter();
  $('#wo-hide-short').checked = f.on;
  $('#wo-min-dur').value = String(f.minMin);
  $('#wo-min-dist').value = String(f.minKm);
  $('#wo-limits').classList.toggle('hidden', !f.on);
  if (!D.exercise.ok) {
    const d = document.createElement('div');
    d.className = 'empty-note card';
    d.textContent = `Couldn't load workouts: ${String((D.exercise.err && D.exercise.err.message) || D.exercise.err)}`;
    wrap.appendChild(d);
    return;
  }
  const all = D.exercise.v;
  if (!all.length) {
    const d = document.createElement('div');
    d.className = 'empty-note card';
    d.textContent = 'No workouts recorded in the last 90 days.';
    wrap.appendChild(d);
    return;
  }
  const isShort = (w) =>
    (w.durSec != null && w.durSec < f.minMin * 60)
    || (w.distanceKm != null && w.distanceKm < f.minKm);
  const shown = f.on ? all.filter((w) => !isShort(w)) : all;
  $('#workouts-sub').textContent = f.on && shown.length !== all.length
    ? `${shown.length} of ${all.length} in the last 90 days (short ones hidden)`
    : `${all.length} in the last 90 days`;
  if (!shown.length) {
    const d = document.createElement('div');
    d.className = 'empty-note card';
    d.textContent = 'All workouts in this range are shorter than the current limits.';
    wrap.appendChild(d);
    return;
  }
  const visible = state.woShowAll ? shown : shown.slice(0, 20);
  for (const w of visible) {
    const row = document.createElement('button');
    row.className = 'workout-row';
    row.type = 'button';
    const left = document.createElement('div');
    left.className = 'wo-left';
    const ic = document.createElement('span');
    ic.className = 'wo-icon';
    ic.textContent = woIcon(w.name);
    ic.setAttribute('aria-hidden', 'true');
    left.appendChild(ic);
    const tw = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'wo-name';
    name.textContent = w.name;
    const when = document.createElement('div');
    when.className = 'wo-when';
    when.textContent = `${Charts.longDate(w.dateIso)}${w.timeStr ? ' · ' + w.timeStr : ''}`;
    tw.append(name, when);
    left.appendChild(tw);
    row.appendChild(left);
    const right = document.createElement('div');
    right.className = 'wo-metrics';
    const metric = (val, lab) => {
      if (val == null) return;
      const m = document.createElement('span');
      m.className = 'wo-metric';
      const v = document.createElement('strong');
      v.textContent = val;
      m.appendChild(v);
      m.appendChild(document.createTextNode(' ' + lab));
      right.appendChild(m);
    };
    metric(durFmt(w.durSec), '');
    if (w.distanceKm != null) metric(Charts.fmtNum(w.distanceKm, 2), 'km');
    if (w.kcal != null) metric(Charts.fmtNum(w.kcal), 'kcal');
    if (w.avgHr != null) metric(Charts.fmtNum(w.avgHr), 'bpm');
    row.appendChild(right);
    row.addEventListener('click', () => goWorkout(all.indexOf(w)));
    wrap.appendChild(row);
  }
  if (shown.length > visible.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'show-more-btn';
    more.textContent = `Show all ${shown.length} workouts`;
    more.addEventListener('click', () => {
      state.woShowAll = true;
      renderWorkouts();
    });
    wrap.appendChild(more);
  }
}

export function wireWorkoutFilters() {
  $('#wo-hide-short').addEventListener('change', (ev) => {
    store.set(WO_FILTER_KEY, { ...woFilter(), on: ev.target.checked });
    if (state.data) renderWorkouts();
  });
  $('#wo-min-dur').addEventListener('change', (ev) => {
    store.set(WO_FILTER_KEY, { ...woFilter(), minMin: Number(ev.target.value) });
    if (state.data) renderWorkouts();
  });
  $('#wo-min-dist').addEventListener('change', (ev) => {
    store.set(WO_FILTER_KEY, { ...woFilter(), minKm: Number(ev.target.value) });
    if (state.data) renderWorkouts();
  });
}
