import { isoDate, parseIso, addDays } from './util.js';

export function axisDates(startIso, endIso) {
  const out = [];
  for (let d = parseIso(startIso); isoDate(d) <= endIso; d = addDays(d, 1)) out.push(isoDate(d));
  return out;
}
export const seriesOnAxis = (axis, series) => {
  const m = new Map(series.map((r) => [r.date, r.value]));
  return axis.map((d) => (m.has(d) ? m.get(d) : null));
};

export function latest(series) {
  for (let i = series.length - 1; i >= 0; i--) if (series[i].value != null) return series[i];
  return null;
}
export function prevAvg(series, beforeDate, days = 7) {
  const vals = series.filter((r) => r.value != null && r.date < beforeDate).slice(-days).map((r) => r.value);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}
