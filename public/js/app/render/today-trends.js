import { Charts } from '../../charts/index.js';
import { $, hm, addDays, parseIso, isoDate } from '../util.js';
import { HR_ZONES } from '../constants.js';
import { state, isPending, updateStatus } from '../state.js';
import { axisDates, seriesOnAxis } from '../series.js';
import { makeCard, errCard, loadingCard } from './cards.js';
import { renderTiles, sparkJobs } from './tiles.js';
import { renderWorkouts } from './workouts.js';
import { goDetail, HRZONE_SERIES } from './detail.js';

export function renderTodayCharts() {
  const wrap = $('#today-charts');
  wrap.textContent = '';
  const D = state.data;
  const css = (v) => `var(${v})`;
  if (isPending(D.hrToday)) return loadingCard(wrap, 'Heart rate today');
  if (!D.hrToday.ok) return errCard(wrap, 'Heart rate today', D.hrToday.err);
  const pts = D.hrToday.v;
  if (!pts.length) {
    return makeCard(wrap, {
      title: 'Heart rate today',
      render: (b) => Charts.emptyNote(b, 'No heart-rate samples yet today.'),
      table: () => ({ head: ['Time', 'bpm'], rows: [] }),
    });
  }
  const slotLabel = (slot) => `${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}`;
  makeCard(wrap, {
    title: 'Heart rate today',
    sub: '5-minute averages',
    render: (body) => Charts.lineChart(body, {
      labels: pts.map((p) => String(p.slot)),
      tickLabels: pts.map((p) => slotLabel(p.slot)),
      titleForIndex: (i) => slotLabel(pts[i].slot),
      series: [{ name: 'Heart rate', color: css('--c-hr'), values: pts.map((p) => p.value) }],
      unit: 'bpm', area: true, height: 200, endLabel: true, zones: HR_ZONES,
    }),
    table: () => ({ head: ['Time', 'bpm'], rows: pts.map((p) => [slotLabel(p.slot), String(p.value)]) }),
  });
}

export function renderTrends() {
  const wrap = $('#trend-charts');
  wrap.textContent = '';
  const D = state.data;
  const endIso = D.todayIso;
  const startIso = isoDate(addDays(parseIso(endIso), -(state.range - 1)));
  const axis = axisDates(startIso, endIso);
  const css = (v) => `var(${v})`;
  const slice = (series) => series.filter((r) => r.date >= startIso);
  const columnData = (series) => {
    const m = new Map(series.map((r) => [r.date, r.value]));
    return axis.map((d) => ({ date: d, value: m.has(d) ? m.get(d) : null }));
  };

  const simpleTable = (series, valHead, fmt = (v) => Charts.fmtNum(v)) => () => ({
    head: ['Date', valHead],
    rows: slice(series).map((r) => [r.date, r.value == null ? '—' : fmt(r.value)]),
  });

  // Steps
  if (D.steps.ok) {
    makeCard(wrap, {
      title: 'Steps',
      detailKey: 'steps',
      render: (b) => Charts.columnChart(b, {
        data: columnData(D.steps.v),
        color: css('--c-steps'), fmt: Charts.compact,
        onBarClick: () => goDetail('steps'),
      }),
      table: simpleTable(D.steps.v, 'Steps'),
    });
  } else if (isPending(D.steps)) loadingCard(wrap, 'Steps');
  else errCard(wrap, 'Steps', D.steps.err);

  // Sleep stages
  if (D.sleep.ok) {
    const seriesDef = [
      { key: 'deep', name: 'Deep', color: css('--sleep-deep') },
      { key: 'light', name: 'Light', color: css('--sleep-light') },
      { key: 'rem', name: 'REM', color: css('--sleep-rem') },
      { key: 'awake', name: 'Awake', color: css('--sleep-awake') },
    ];
    const byDate = new Map(D.sleep.v.days.map((r) => [r.date, r]));
    const data = axis.map((d) => {
      const r = byDate.get(d);
      return { date: d, parts: r ? { deep: r.deep, light: r.light, rem: r.rem, awake: r.awake } : {} };
    });
    makeCard(wrap, {
      title: 'Sleep stages',
      detailKey: 'sleep',
      sub: 'minutes per night — tap a night for its hypnogram',
      legendItems: seriesDef,
      render: (b) => Charts.stackedColumns(b, {
        data, series: seriesDef, fmt: hm,
        onBarClick: (i) => { state.sleepNight = axis[i]; goDetail('sleep'); },
      }),
      table: () => ({
        head: ['Date', 'Deep', 'Light', 'REM', 'Awake', 'Asleep total'],
        rows: slice(D.sleep.v.days).map((r) => [r.date, hm(r.deep), hm(r.light), hm(r.rem), hm(r.awake), hm(r.asleep)]),
      }),
    });
  } else if (isPending(D.sleep)) loadingCard(wrap, 'Sleep stages');
  else errCard(wrap, 'Sleep stages', D.sleep.err);

  // Resting HR
  if (D.rhr.ok) {
    makeCard(wrap, {
      title: 'Resting heart rate',
      detailKey: 'rhr',
      render: (b) => Charts.lineChart(b, {
        labels: axis,
        series: [{ name: 'Resting HR', color: css('--c-hr'), values: seriesOnAxis(axis, slice(D.rhr.v)) }],
        unit: 'bpm', area: true, onBarClick: () => goDetail('rhr'),
      }),
      table: simpleTable(D.rhr.v, 'bpm'),
    });
  } else if (isPending(D.rhr)) loadingCard(wrap, 'Resting heart rate');
  else errCard(wrap, 'Resting heart rate', D.rhr.err);

  // Weight
  if (D.weight.ok) {
    makeCard(wrap, {
      title: 'Weight',
      detailKey: 'weight',
      render: (b) => Charts.lineChart(b, {
        labels: axis,
        series: [{ name: 'Weight', color: css('--c-weight'), values: seriesOnAxis(axis, slice(D.weight.v)) }],
        unit: 'kg', dots: true, area: true, fmt: (v) => Charts.fmtNum(v, 1), onBarClick: () => goDetail('weight'),
      }),
      table: simpleTable(D.weight.v, 'kg', (v) => Charts.fmtNum(v, 1)),
    });
  } else if (isPending(D.weight)) loadingCard(wrap, 'Weight');
  else errCard(wrap, 'Weight', D.weight.err);

  // Active zone minutes
  if (D.azm.ok) {
    makeCard(wrap, {
      title: 'Active zone minutes',
      detailKey: 'azm',
      render: (b) => Charts.columnChart(b, {
        data: columnData(D.azm.v),
        color: css('--c-azm'), fmt: (v) => Charts.fmtNum(v), unit: 'min',
        onBarClick: () => goDetail('azm'),
      }),
      table: simpleTable(D.azm.v, 'Minutes'),
    });
  } else if (isPending(D.azm)) loadingCard(wrap, 'Active zone minutes');
  else errCard(wrap, 'Active zone minutes', D.azm.err);

  // Active energy
  if (D.energy.ok) {
    makeCard(wrap, {
      title: 'Active energy',
      detailKey: 'energy',
      render: (b) => Charts.columnChart(b, {
        data: columnData(D.energy.v),
        color: css('--c-cal'), fmt: Charts.compact, unit: 'kcal',
        onBarClick: () => goDetail('energy'),
      }),
      table: simpleTable(D.energy.v, 'kcal', (v) => Charts.fmtNum(Math.round(v))),
    });
  } else if (isPending(D.energy)) loadingCard(wrap, 'Active energy');
  else errCard(wrap, 'Active energy', D.energy.err);

  // HRV
  if (D.hrv.ok) {
    makeCard(wrap, {
      title: 'Heart rate variability',
      detailKey: 'hrv',
      sub: 'nightly average',
      render: (b) => Charts.lineChart(b, {
        labels: axis,
        series: [{ name: 'HRV', color: css('--c-hrv'), values: seriesOnAxis(axis, slice(D.hrv.v)) }],
        unit: 'ms', area: true, fmt: (v) => Charts.fmtNum(v, 0), onBarClick: () => goDetail('hrv'),
      }),
      table: simpleTable(D.hrv.v, 'ms'),
    });
  } else if (isPending(D.hrv)) loadingCard(wrap, 'Heart rate variability');
  else errCard(wrap, 'Heart rate variability', D.hrv.err);

  // SpO2
  if (D.spo2.ok) {
    makeCard(wrap, {
      title: 'Oxygen saturation (SpO₂)',
      detailKey: 'spo2',
      sub: 'nightly average',
      render: (b) => Charts.lineChart(b, {
        labels: axis,
        series: [{ name: 'SpO₂', color: css('--c-spo2'), values: seriesOnAxis(axis, slice(D.spo2.v)) }],
        unit: '%', area: true, fmt: (v) => Charts.fmtNum(v, 1), onBarClick: () => goDetail('spo2'),
      }),
      table: simpleTable(D.spo2.v, '%', (v) => Charts.fmtNum(v, 1)),
    });
  } else if (isPending(D.spo2)) loadingCard(wrap, 'Oxygen saturation (SpO₂)');
  else errCard(wrap, 'Oxygen saturation (SpO₂)', D.spo2.err);

  // Respiratory rate
  if (D.rr.ok) {
    makeCard(wrap, {
      title: 'Respiratory rate',
      detailKey: 'rr',
      sub: 'breaths per minute, nightly',
      render: (b) => Charts.lineChart(b, {
        labels: axis,
        series: [{ name: 'Respiratory rate', color: css('--c-rr'), values: seriesOnAxis(axis, slice(D.rr.v)) }],
        unit: 'br/min', area: true, fmt: (v) => Charts.fmtNum(v, 1), onBarClick: () => goDetail('rr'),
      }),
      table: simpleTable(D.rr.v, 'br/min', (v) => Charts.fmtNum(v, 1)),
    });
  } else if (isPending(D.rr)) loadingCard(wrap, 'Respiratory rate');
  else errCard(wrap, 'Respiratory rate', D.rr.err);

  // ---- bonus metrics: many accounts don't record these, so the cards appear
  // only once data actually lands (no loading/error placeholders).

  // Heart rate zones
  if (D.hrzones && D.hrzones.ok && D.hrzones.v.length) {
    const byDate = new Map(D.hrzones.v.map((r) => [r.date, r]));
    const zoneData = axis.map((d) => {
      const r = byDate.get(d);
      return { date: d, parts: r ? { light: r.light, moderate: r.moderate, vigorous: r.vigorous, peak: r.peak } : {} };
    });
    const minFmt = (v) => Charts.fmtNum(Math.round(v)) + ' min';
    makeCard(wrap, {
      title: 'Heart rate zones',
      detailKey: 'hrzones',
      sub: 'minutes per zone, daily',
      legendItems: HRZONE_SERIES,
      render: (b) => Charts.stackedColumns(b, {
        data: zoneData, series: HRZONE_SERIES, fmt: minFmt,
        onBarClick: () => goDetail('hrzones'),
      }),
      table: () => ({
        head: ['Date', ...HRZONE_SERIES.map((s) => s.name)],
        rows: slice(D.hrzones.v).map((r) => [r.date, ...HRZONE_SERIES.map((s) => minFmt(r[s.key] || 0))]),
      }),
    });
  }

  // Distance
  if (D.distance && D.distance.ok && D.distance.v.length) {
    makeCard(wrap, {
      title: 'Distance',
      detailKey: 'distance',
      render: (b) => Charts.columnChart(b, {
        data: columnData(D.distance.v),
        color: css('--c-dist'), fmt: (v) => Charts.fmtNum(v, 1), unit: 'km',
        onBarClick: () => goDetail('distance'),
      }),
      table: simpleTable(D.distance.v, 'km', (v) => Charts.fmtNum(v, 2)),
    });
  }

  // Floors climbed
  if (D.floors && D.floors.ok && D.floors.v.length) {
    makeCard(wrap, {
      title: 'Floors climbed',
      detailKey: 'floors',
      render: (b) => Charts.columnChart(b, {
        data: columnData(D.floors.v),
        color: css('--c-floors'), fmt: (v) => Charts.fmtNum(v),
        onBarClick: () => goDetail('floors'),
      }),
      table: simpleTable(D.floors.v, 'Floors'),
    });
  }

  // VO₂ max
  if (D.vo2max && D.vo2max.ok && D.vo2max.v.length) {
    makeCard(wrap, {
      title: 'VO₂ max',
      detailKey: 'vo2max',
      sub: 'cardio fitness score',
      render: (b) => Charts.lineChart(b, {
        labels: axis,
        series: [{ name: 'VO₂ max', color: css('--c-vo2'), values: seriesOnAxis(axis, slice(D.vo2max.v)) }],
        area: true, fmt: (v) => Charts.fmtNum(v, 1), onBarClick: () => goDetail('vo2max'),
      }),
      table: simpleTable(D.vo2max.v, 'VO₂ max', (v) => Charts.fmtNum(v, 1)),
    });
  }

  // Body fat
  if (D.bodyfat && D.bodyfat.ok && D.bodyfat.v.length) {
    makeCard(wrap, {
      title: 'Body fat',
      detailKey: 'bodyfat',
      render: (b) => Charts.lineChart(b, {
        labels: axis,
        series: [{ name: 'Body fat', color: css('--c-fat'), values: seriesOnAxis(axis, slice(D.bodyfat.v)) }],
        unit: '%', dots: true, area: true, fmt: (v) => Charts.fmtNum(v, 1), onBarClick: () => goDetail('bodyfat'),
      }),
      table: simpleTable(D.bodyfat.v, '%', (v) => Charts.fmtNum(v, 1)),
    });
  }
}

export function renderAll() {
  $('#today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  renderTiles();
  for (const job of sparkJobs.splice(0)) job();
  renderTodayCharts();
  renderWorkouts();
  renderTrends();
  updateStatus();
}
