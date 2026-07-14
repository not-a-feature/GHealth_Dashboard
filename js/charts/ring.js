import { E } from './core.js';

// Progress ring (weekly goal): thin track, gradient arc that sweeps in on
// render, a tip dot riding the end of the arc, and a percent + sub-label readout.
let ringSeq = 0;
// Rings the sweep-in has already played for this page session, keyed by `key`.
// Stale-while-revalidate (and resize/theme) re-render the tiles several times
// per load; without this the arc would replay its animation on every render.
const swept = new Set();
export function progressRing(container, { value, goal, color, label, size = 96, stroke, sub, key }) {
  container.textContent = '';
  const sw = stroke || Math.max(6, Math.round(size / 11));
  const r = (size - sw) / 2 - 1;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? value / goal : 0;
  const frac = Math.max(0, Math.min(1, pct));
  const id = `ring-grad-${++ringSeq}`;
  const svg = E('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': label });
  container.appendChild(svg);
  const grad = E('linearGradient', { id, x1: '0%', y1: '0%', x2: '100%', y2: '100%' }, E('defs', {}, svg));
  E('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '0.45' }, grad);
  E('stop', { offset: '100%', 'stop-color': color }, grad);
  const g = E('g', { transform: `rotate(-90 ${size / 2} ${size / 2})` }, svg);
  E('circle', {
    cx: size / 2, cy: size / 2, r,
    fill: 'none', style: `stroke:var(--track);stroke-width:${Math.max(2, sw - 4)}`,
  }, g);
  const arc = E('circle', {
    cx: size / 2, cy: size / 2, r, fill: 'none', class: 'ring-arc',
    'stroke-dasharray': c.toFixed(2), 'stroke-dashoffset': c.toFixed(2),
    style: `stroke:url(#${id});stroke-width:${sw};stroke-linecap:round`,
  }, g);
  // tip dot starts at 12 o'clock and rotates to the end of the arc
  const tipG = E('g', { class: 'ring-tip' }, svg);
  E('circle', {
    cx: size / 2, cy: size / 2 - r, r: Math.max(2.5, sw / 2 - 1),
    style: `fill:${color};stroke:var(--surface);stroke-width:2`,
  }, tipG);
  const big = size >= 80;
  const vText = E('text', {
    x: size / 2, y: size / 2 + (sub ? 1 : (big ? 7 : 4)), 'text-anchor': 'middle',
    style: `fill:var(--ink);font-size:${big ? 20 : 13}px;font-weight:700;letter-spacing:-0.02em`,
  }, svg);
  vText.textContent = `${Math.round(pct * 100)}%`;
  if (sub) {
    E('text', {
      x: size / 2, y: size / 2 + (big ? 17 : 13), 'text-anchor': 'middle',
      style: 'fill:var(--muted);font-size:10px;font-weight:600',
    }, svg).textContent = sub;
  }
  const settle = () => {
    arc.style.strokeDashoffset = (c * (1 - frac)).toFixed(2);
    tipG.style.transform = `rotate(${(frac * 360).toFixed(1)}deg)`;
  };
  // Sweep in only the first time this ring appears (CSS transition on
  // .ring-arc / .ring-tip; no-op with reduced motion). On later re-renders the
  // final state is set synchronously — before the browser paints the start
  // frame — so the arc jumps straight to position without replaying.
  if (key && swept.has(key)) {
    settle();
  } else {
    if (key) swept.add(key);
    requestAnimationFrame(() => requestAnimationFrame(settle));
  }
}
