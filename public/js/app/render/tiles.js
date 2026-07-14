import { Charts } from '../../charts/index.js';
import { $, store, addDays, parseIso, isoDate, hm } from '../util.js';
import { state, isPending } from '../state.js';
import { axisDates, seriesOnAxis, latest, prevAvg } from '../series.js';
import { goDetail } from './detail.js';

// sparklines are drawn after the whole KPI row is in the DOM (real widths)
export const sparkJobs = [];

export function tile({ label, color, value, unit, delta, trend, note, onClick }) {
  const t = document.createElement('div');
  t.className = 'tile';
  if (onClick) {
    t.classList.add('clickable');
    t.tabIndex = 0;
    t.setAttribute('role', 'button');
    t.setAttribute('aria-label', `${label} — show details`);
    t.addEventListener('click', onClick);
    t.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onClick(); }
    });
  }
  const lab = document.createElement('div');
  lab.className = 'tile-label';
  const key = document.createElement('span');
  key.className = 'tile-key';
  key.style.background = color;
  lab.append(key, document.createTextNode(label));
  t.appendChild(lab);
  const val = document.createElement('div');
  val.className = 'tile-value';
  val.textContent = value;
  if (unit && value !== '—') {
    const u = document.createElement('span');
    u.className = 'unit';
    u.textContent = unit;
    val.appendChild(u);
  }
  t.appendChild(val);
  if (delta) {
    const d = document.createElement('div');
    d.className = 'tile-delta';
    const pill = document.createElement('span');
    const pillCls = delta.cls === 'up' ? 'pill-good' : delta.cls === 'down' ? 'pill-bad' : 'pill-neutral';
    pill.className = `pill ${pillCls}`;
    pill.textContent = `${delta.dirUp ? '▲' : '▼'} ${delta.text}`;
    const rest = document.createElement('span');
    rest.className = 'delta-rest';
    rest.textContent = 'vs 7-day avg';
    d.append(pill, rest);
    t.appendChild(d);
  } else if (note) {
    const d = document.createElement('div');
    d.className = 'tile-note';
    d.textContent = note;
    t.appendChild(d);
  }
  if (trend && trend.values.filter((v) => v != null).length > 1) {
    const sp = document.createElement('div');
    sp.className = 'tile-spark';
    t.appendChild(sp);
    sparkJobs.push(() => Charts.tileTrend(sp, trend.values, trend.labels, color));
  }
  return t;
}

function deltaFor(cur, base, { fmt, pct = false, goodWhenUp = null }) {
  if (cur == null || base == null || base === 0) return null;
  const diff = cur - base;
  if (Math.abs(diff) < 1e-9) return null;
  const dirUp = diff > 0;
  const text = pct
    ? `${Math.abs((diff / base) * 100).toFixed(0)}%`
    : fmt(Math.abs(diff));
  let cls = 'neutral';
  if (goodWhenUp !== null) cls = (dirUp === goodWhenUp) ? 'up' : 'down';
  return { dirUp, text, cls };
}

export function renderTiles() {
  const row = $('#kpi-row');
  row.textContent = '';
  sparkJobs.length = 0;
  const D = state.data;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || v;
  // last 7 days, app-style: values + narrow weekday letters (M D M D F S S)
  const trendOf = (series) => {
    const axis = axisDates(isoDate(addDays(parseIso(D.todayIso), -6)), D.todayIso);
    return {
      values: seriesOnAxis(axis, series),
      labels: axis.map((d) => parseIso(d).toLocaleDateString(undefined, { weekday: 'narrow' })),
    };
  };
  const val = (x, dec = 0) => (x == null ? '—' : Charts.fmtNum(x, dec));

  // Weight is logged sparsely, so the 7-day window the other tiles use often
  // holds <2 weigh-ins and no spark renders. Widen it until there are at least
  // two points (up to 90 days) so the weight tile shows a real history line
  // like every other metric, with day-of-month labels for the longer span.
  const weightTrend = (series) => {
    const end = parseIso(D.todayIso);
    let axis = axisDates(isoDate(addDays(end, -29)), D.todayIso);
    for (const win of [30, 60, 90]) {
      axis = axisDates(isoDate(addDays(end, -(win - 1))), D.todayIso);
      if (seriesOnAxis(axis, series).filter((v) => v != null).length >= 2) break;
    }
    const every = Math.ceil(axis.length / 4);
    return {
      values: seriesOnAxis(axis, series),
      labels: axis.map((d, i) =>
        (i === axis.length - 1 || i % every === 0) ? String(parseIso(d).getDate()) : ''),
    };
  };

  // Cardio-load ring card: this week's active zone minutes vs. weekly goal
  if (D.azm.ok && D.azm.v.length) {
    const goal = Number(store.get('ghd_azm_goal')) || 150;
    const today = parseIso(D.todayIso);
    const weekStart = isoDate(addDays(today, -((today.getDay() + 6) % 7))); // Monday
    const week = D.azm.v.filter((r) => r.date >= weekStart && r.value != null);
    const total = week.reduce((a, r) => a + r.value, 0);
    const done = total >= goal;

    const t = document.createElement('div');
    t.className = 'tile clickable cardio-tile';
    t.tabIndex = 0;
    t.setAttribute('role', 'button');
    t.setAttribute('aria-label', `Cardio load: ${Math.round(total)} of ${goal} zone minutes this week — show details`);
    const open = () => goDetail('azm');
    t.addEventListener('click', open);
    t.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
    });

    const lab = document.createElement('div');
    lab.className = 'tile-label';
    const key = document.createElement('span');
    key.className = 'tile-key';
    key.style.background = css('--c-azm');
    lab.append(key, document.createTextNode('Cardio load'));
    const edit = document.createElement('button');
    edit.className = 'goal-edit';
    edit.type = 'button';
    edit.textContent = '✎';
    edit.title = 'Change weekly goal';
    edit.setAttribute('aria-label', 'Change weekly cardio goal');
    edit.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const inp = prompt('Weekly cardio goal (active zone minutes):', String(goal));
      const n = Number(inp);
      if (inp != null && Number.isFinite(n) && n > 0) {
        store.set('ghd_azm_goal', n);
        renderTiles();
        for (const job of sparkJobs.splice(0)) job();
      }
    });
    lab.appendChild(edit);
    t.appendChild(lab);

    const ringBox = document.createElement('div');
    ringBox.className = 'cardio-tile-ring';
    t.appendChild(ringBox);
    sparkJobs.push(() => Charts.progressRing(ringBox, {
      value: total, goal, size: 104, key: 'cardio-week',
      color: done ? css('--good') : css('--c-azm'),
      sub: `${Charts.fmtNum(Math.round(total))} / ${goal} min`,
      label: `${Math.round(total)} of ${goal} zone minutes this week`,
    }));

    const note = document.createElement('div');
    note.className = 'tile-note center-note';
    note.textContent = done ? 'weekly goal reached 🎉' : 'this week';
    t.appendChild(note);
    row.appendChild(t);
  }

  if (D.steps.ok && D.steps.v.length) {
    const l = latest(D.steps.v);
    row.appendChild(tile({
      label: 'Steps', color: css('--c-steps'),
      value: val(l && l.value), unit: '',
      delta: l && deltaFor(l.value, prevAvg(D.steps.v, l.date), { pct: true, goodWhenUp: true, fmt: val }),
      trend: trendOf(D.steps.v),
      note: l && l.date !== D.todayIso ? `as of ${Charts.shortDate(l.date)}` : null,
      onClick: () => goDetail('steps'),
    }));
  }
  if (D.azm.ok && D.azm.v.length) {
    const l = latest(D.azm.v);
    row.appendChild(tile({
      label: 'Active zone minutes', color: css('--c-azm'),
      value: val(l && l.value), unit: 'min',
      delta: l && deltaFor(l.value, prevAvg(D.azm.v, l.date), { goodWhenUp: true, fmt: (n) => val(Math.round(n)) + ' min' }),
      trend: trendOf(D.azm.v),
      onClick: () => goDetail('azm'),
    }));
  }
  if (D.energy.ok && D.energy.v.length) {
    const l = latest(D.energy.v);
    row.appendChild(tile({
      label: 'Active energy', color: css('--c-cal'),
      value: val(l && Math.round(l.value)), unit: 'kcal',
      delta: l && deltaFor(l.value, prevAvg(D.energy.v, l.date), { pct: true, goodWhenUp: true, fmt: val }),
      trend: trendOf(D.energy.v),
      onClick: () => goDetail('energy'),
    }));
  }
  if (D.rhr.ok && D.rhr.v.length) {
    const l = latest(D.rhr.v);
    row.appendChild(tile({
      label: 'Resting heart rate', color: css('--c-hr'),
      value: val(l && l.value), unit: 'bpm',
      delta: l && deltaFor(l.value, prevAvg(D.rhr.v, l.date), { goodWhenUp: false, fmt: (n) => n.toFixed(1) + ' bpm' }),
      trend: trendOf(D.rhr.v),
      onClick: () => goDetail('rhr'),
    }));
  }
  if (D.sleep.ok && D.sleep.v.days.length) {
    const l = D.sleep.v.days[D.sleep.v.days.length - 1];
    const asleepSeries = D.sleep.v.days.map((r) => ({ date: r.date, value: r.asleep }));
    const eff = l.inPeriod ? Math.round((l.asleep / l.inPeriod) * 100) : null;
    row.appendChild(tile({
      label: 'Sleep', color: css('--sleep-deep'),
      value: hm(l.asleep), unit: '',
      delta: deltaFor(l.asleep, prevAvg(asleepSeries, l.date), { goodWhenUp: true, fmt: (n) => hm(Math.round(n)) }),
      trend: trendOf(asleepSeries),
      note: eff != null ? `efficiency ${eff}%` : null,
      onClick: () => goDetail('sleep'),
    }));
  }
  if (D.weight.ok && D.weight.v.length) {
    const l = latest(D.weight.v);
    const prev = D.weight.v.length > 1 ? D.weight.v[D.weight.v.length - 2].value : null;
    const d = (l && prev != null) ? deltaFor(l.value, prev, { fmt: (n) => n.toFixed(1) + ' kg' }) : null;
    if (d) d.cls = 'neutral'; // weight direction isn't inherently good or bad
    row.appendChild(tile({
      label: 'Weight', color: css('--c-weight'),
      value: l ? l.value.toFixed(1) : '—', unit: 'kg',
      delta: d,
      trend: weightTrend(D.weight.v),
      note: l && l.date !== D.todayIso ? `as of ${Charts.shortDate(l.date)}` : null,
      onClick: () => goDetail('weight'),
    }));
  }
  const tileKeys = ['steps', 'azm', 'energy', 'rhr', 'sleep', 'weight'];
  if (!row.children.length && !tileKeys.some((k) => isPending(D[k]))) {
    const d = document.createElement('div');
    d.className = 'empty-note';
    d.textContent = 'No recent data found. Is your device syncing to your Google account?';
    row.appendChild(d);
  }
}
