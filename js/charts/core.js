/* Shared SVG scaffolding + formatting used by every chart type. */

export const NS = 'http://www.w3.org/2000/svg';
let uidSeq = 0; // unique ids for per-chart gradients / clip paths, shared across chart types
export const nextUid = () => ++uidSeq;

export function E(name, attrs = {}, parent) {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

export const fmtNum = (n, dec = 0) =>
  n == null || Number.isNaN(n)
    ? '—'
    : Number(n).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const compact = (n) => {
  if (n == null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 10000) return (n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'k';
  return fmtNum(n);
};

export const shortDate = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
export const longDate = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

// ---- scales -------------------------------------------------------------

export function niceStep(raw) {
  if (raw <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return s * p;
}

// Domain [lo, hi] with clean tick values. zeroBase forces lo = 0.
export function yScale(values, { zeroBase = false, tickCount = 4 } = {}) {
  const vals = values.filter((v) => v != null && !Number.isNaN(v));
  let min = vals.length ? Math.min(...vals) : 0;
  let max = vals.length ? Math.max(...vals) : 1;
  if (zeroBase) min = 0;
  if (min === max) { max = min + 1; if (!zeroBase) min = min - 1; }
  const pad = zeroBase ? 0 : (max - min) * 0.18;
  const step = niceStep((max + (zeroBase ? max * 0.05 : pad) - (min - pad)) / tickCount);
  const lo = zeroBase ? 0 : Math.floor((min - pad) / step) * step;
  let hi = lo + step * tickCount;
  while (hi < max) hi += step;
  const ticks = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);
  return { lo, hi, ticks };
}

// ---- tooltip ------------------------------------------------------------

export function makeTip(container) {
  let el = container.querySelector(':scope > .viz-tip');
  if (!el) {
    el = document.createElement('div');
    el.className = 'viz-tip';
    container.appendChild(el);
  }
  return {
    show(px, py, build) {
      el.textContent = '';
      build(el);
      el.style.display = 'block';
      const cw = container.clientWidth;
      const tw = el.offsetWidth;
      let x = px + 14;
      if (x + tw > cw - 4) x = px - tw - 14;
      if (x < 4) x = 4;
      let y = py - el.offsetHeight - 8;
      if (y < 0) y = py + 14;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    },
    hide() { el.style.display = 'none'; },
  };
}

export function tipTitle(el, text) {
  const d = document.createElement('div');
  d.className = 'tip-title';
  d.textContent = text;
  el.appendChild(d);
}
// Value leads, label follows; series keyed by a short color stroke.
export function tipRow(el, { color, value, name }) {
  const r = document.createElement('div');
  r.className = 'tip-row';
  if (color) {
    const k = document.createElement('span');
    k.className = 'tip-key';
    k.style.borderTopColor = color;
    r.appendChild(k);
  }
  const v = document.createElement('span');
  v.className = 'tip-val';
  v.textContent = value;
  r.appendChild(v);
  if (name) {
    const n = document.createElement('span');
    n.className = 'tip-name';
    n.textContent = name;
    r.appendChild(n);
  }
  el.appendChild(r);
}

// ---- shared scaffolding ---------------------------------------------------

export const M = { t: 14, r: 14, b: 24, l: 50 };

export function frame(container, height) {
  container.querySelectorAll(':scope > svg, :scope > .empty-note').forEach((n) => n.remove());
  const w = Math.max(container.clientWidth, 240);
  // viz-fluid: CSS scales the svg to the container so a stale width
  // measurement can never overflow the card; a ResizeObserver re-renders
  // crisply once the layout settles.
  const svg = E('svg', { width: w, height, viewBox: `0 0 ${w} ${height}`, role: 'img', class: 'viz-fluid' });
  container.appendChild(svg);
  return { svg, w, h: height, pw: w - M.l - M.r, ph: height - M.t - M.b };
}

export function drawYAxis(svg, scale, ph, pw, fmt) {
  for (const t of scale.ticks) {
    const y = M.t + ph - ((t - scale.lo) / (scale.hi - scale.lo)) * ph;
    if (t !== scale.lo) E('line', { x1: M.l, x2: M.l + pw, y1: y, y2: y, class: 'gridline' }, svg);
    E('text', { x: M.l - 8, y: y + 3.5, 'text-anchor': 'end', class: 'axis-text' }, svg)
      .textContent = fmt(t);
  }
  E('line', { x1: M.l, x2: M.l + pw, y1: M.t + ph, y2: M.t + ph, class: 'baseline' }, svg);
}

export function xTickIndexes(n, want = 5) {
  if (n <= want) return [...Array(n).keys()];
  const step = Math.ceil(n / want);
  const idx = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  return idx;
}

export function roundedTopBar(x, y, w, h, r = 4) {
  r = Math.max(0, Math.min(r, w / 2, h));
  const yb = y + h;
  return `M${x},${yb} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${yb} Z`;
}

export function emptyNote(container, msg) {
  container.querySelectorAll(':scope > svg, :scope > .empty-note').forEach((n) => n.remove());
  const d = document.createElement('div');
  d.className = 'empty-note';
  d.textContent = msg || 'No data for this range.';
  container.appendChild(d);
}
