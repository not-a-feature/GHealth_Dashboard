import { E, M, frame, emptyNote, makeTip, tipTitle, tipRow, shortDate, longDate } from './core.js';

const clock = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const hourLabel = (h) => `${String(((Math.round(h) % 24) + 24) % 24).padStart(2, '0')}:00`;
const durLabel = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

// Sleep schedule: one rounded bar per night from bedtime down to wake time,
// so bed/wake consistency is visible at a glance. Time flows downward (bed at
// the top), sessions are placed on an hours-since-previous-noon scale so
// nights that straddle midnight stay contiguous.
// sessions: [{dateIso, startMs, endMs}] (naps/extra sessions get their own bar)
export function sleepSchedule(container, { sessions, height = 240, color }) {
  const ses = (sessions || []).filter((s) => s.endMs > s.startMs);
  if (!ses.length) return emptyNote(container, 'No sleep sessions in this range.');
  const { svg, pw, ph } = frame(container, height);
  const tip = makeTip(container);

  // hours relative to noon the day before the night's date
  const rel = (s, ms) => {
    const anchor = new Date(s.dateIso + 'T12:00:00').getTime() - 86400000;
    return (ms - anchor) / 3600000;
  };
  const bars = ses.map((s) => ({ s, y0: rel(s, s.startMs), y1: rel(s, s.endMs) }))
    .filter((b) => b.y0 >= 12 && b.y1 <= 44); // drop nonsense timestamps
  if (!bars.length) return emptyNote(container, 'No sleep sessions in this range.');
  const lo = Math.floor(Math.min(...bars.map((b) => b.y0)) - 0.5);
  const hi = Math.ceil(Math.max(...bars.map((b) => b.y1)) + 0.5);
  const Y = (h) => M.t + ((h - lo) / (hi - lo)) * ph; // earlier hour = higher up

  // horizontal hour grid (2h steps), labels on the left like the y-axis
  const step = hi - lo > 12 ? 3 : 2;
  for (let h = Math.ceil(lo); h <= hi; h++) {
    if (h % step !== 0) continue;
    const y = Y(h);
    E('line', { x1: M.l, x2: M.l + pw, y1: y, y2: y, class: 'gridline' }, svg);
    E('text', { x: M.l - 8, y: y + 3.5, 'text-anchor': 'end', class: 'axis-text' }, svg)
      .textContent = hourLabel(h);
  }

  // one band per distinct night, in date order
  const dates = [...new Set(bars.map((b) => b.s.dateIso))].sort();
  const band = pw / dates.length;
  const barW = Math.min(16, Math.max(3, band - 4));
  const xOf = new Map(dates.map((d, i) => [d, M.l + i * band + (band - barW) / 2]));

  for (const b of bars) {
    const x = xOf.get(b.s.dateIso);
    const y = Y(b.y0);
    const hgt = Math.max(2, Y(b.y1) - y);
    const r = Math.min(barW / 2, hgt / 2);
    const rect = E('rect', {
      x, y, width: barW, height: hgt, rx: r,
      style: `fill:${color || 'var(--sleep-light)'}`, class: 'bar-hit', tabindex: 0,
      'aria-label': `${longDate(b.s.dateIso)}: asleep ${clock(b.s.startMs)} to ${clock(b.s.endMs)}`,
    }, svg);
    const show = () => {
      rect.classList.add('lift');
      tip.show(x + barW / 2, y, (el) => {
        tipTitle(el, longDate(b.s.dateIso));
        tipRow(el, { color: color || 'var(--sleep-light)', value: `${clock(b.s.startMs)} – ${clock(b.s.endMs)}` });
        tipRow(el, { value: durLabel((b.s.endMs - b.s.startMs) / 60000), name: 'in bed' });
      });
    };
    const hide = () => { rect.classList.remove('lift'); tip.hide(); };
    rect.addEventListener('pointerenter', show);
    rect.addEventListener('pointerleave', hide);
    rect.addEventListener('focus', show);
    rect.addEventListener('blur', hide);
  }

  // x-axis date ticks (~5)
  const want = Math.min(5, dates.length);
  const tickStep = Math.max(1, Math.ceil(dates.length / want));
  for (let i = 0; i < dates.length; i += tickStep) {
    E('text', {
      x: xOf.get(dates[i]) + barW / 2, y: M.t + ph + 16,
      'text-anchor': 'middle', class: 'axis-text',
    }, svg).textContent = shortDate(dates[i]);
  }
}
