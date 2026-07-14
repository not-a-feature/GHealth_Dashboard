import { E, nextUid } from './core.js';

// Tile sparkline (app-style: rounded tinted plot, filled area under the line,
// dotted markers, and weekday letters with the latest day in a pill).
export function tileTrend(container, values, dayLabels, color) {
  container.textContent = '';
  const idx = [...Array(values.length).keys()].filter((i) => values[i] != null);
  if (idx.length < 2) return;
  const w = Math.max(container.clientWidth, 120);
  const h = 56;
  const padX = 10, padT = 8, plotH = 27;
  const baseY = padT + plotH + 3;     // area floor — sits just above the weekday row
  const uid = 'sp' + nextUid();
  const svg = E('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true', class: 'viz-spark' });
  container.appendChild(svg);
  const defs = E('defs', {}, svg);
  const vals = idx.map((i) => values[i]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const n = values.length;
  const X = (i) => padX + (n > 1 ? (i / (n - 1)) * (w - padX * 2) : 0);
  const Y = (v) => padT + (1 - (v - min) / span) * plotH;

  // rounded plot backdrop; a clip keeps the tinted fill inside the soft corners
  const bx = padX - 7, by = padT - 4, bw = w - bx * 2, bh = baseY - by;
  E('rect', { x: bx, y: by, width: bw, height: bh, rx: 13 }, E('clipPath', { id: uid + 'c' }, defs));
  const plot = E('g', { 'clip-path': `url(#${uid}c)` }, svg);
  E('rect', { x: bx, y: by, width: bw, height: bh, style: `fill:${color};opacity:0.10` }, plot);

  const grad = E('linearGradient', { id: uid, x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
  E('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '0.38' }, grad);
  E('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0.04' }, grad);

  let d = '';
  idx.forEach((i, k) => { d += (k ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(values[i]).toFixed(1); });
  const first = idx[0], last = idx[idx.length - 1];
  E('path', { d: `${d}L${X(last).toFixed(1)},${baseY}L${X(first).toFixed(1)},${baseY}Z`, style: `fill:url(#${uid})` }, plot);
  E('path', { d, fill: 'none', style: `stroke:${color};stroke-width:2;stroke-linecap:round;stroke-linejoin:round` }, plot);
  // dots ride on top of the clip so their surface ring is never cut off
  for (const i of idx) {
    const isLast = i === last;
    E('circle', {
      cx: X(i), cy: Y(values[i]), r: isLast ? 3.6 : 2.4,
      style: `fill:${color};stroke:var(--surface);stroke-width:${isLast ? 2 : 1.5}`,
    }, svg);
  }
  (dayLabels || []).forEach((lab, i) => {
    if (i === n - 1) { // latest day gets a filled pill, like the app
      E('rect', { x: X(i) - 8, y: h - 13, width: 16, height: 13, rx: 6.5, style: `fill:${color};opacity:0.16` }, svg);
    }
    E('text', {
      x: X(i), y: h - 3, 'text-anchor': 'middle', class: 'axis-text',
      style: i === n - 1 ? 'font-weight:700;fill:var(--ink)' : '',
    }, svg).textContent = lab;
  });
}
