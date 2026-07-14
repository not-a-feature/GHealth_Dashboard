import { E, M, frame, drawYAxis, xTickIndexes, roundedTopBar, emptyNote, makeTip, tipTitle, tipRow, shortDate, longDate, yScale } from './core.js';

// data: [{date, parts: {key: minutes}}]; series: [{key, name, color}] bottom→top
export function stackedColumns(container, { data, series, height = 230, fmt, unit = '', titleFmt = longDate, onBarClick }) {
  const totals = data.map((d) => series.reduce((s, sd) => s + (d.parts[sd.key] || 0), 0));
  if (!totals.some((t) => t > 0)) return emptyNote(container);
  const { svg, pw, ph } = frame(container, height);
  const tip = makeTip(container);
  const scale = yScale(totals, { zeroBase: true });
  drawYAxis(svg, scale, ph, pw, fmt);

  const n = data.length;
  const band = pw / n;
  const barW = Math.min(24, Math.max(2, band - 2));
  const k = ph / (scale.hi - scale.lo);
  const colGroups = [];

  for (let i = 0; i < n; i++) {
    const x = M.l + i * band + (band - barW) / 2;
    const g = E('g', {}, svg);
    let cum = 0;
    const segs = series
      .map((sd) => ({ sd, v: data[i].parts[sd.key] || 0 }))
      .filter((s) => s.v > 0);
    segs.forEach((s, si) => {
      const h = s.v * k;
      const y = M.t + ph - cum - h;
      if (si === segs.length - 1) {
        E('path', { d: roundedTopBar(x, y, barW, h), style: `fill:${s.sd.color}` }, g);
      } else {
        E('rect', { x, y, width: barW, height: h, style: `fill:${s.sd.color}` }, g);
      }
      cum += h;
    });
    // 2px surface gaps at internal stage boundaries
    let cy = 0;
    for (let si = 0; si < segs.length - 1; si++) {
      cy += segs[si].v * k;
      E('rect', {
        x: x - 0.5, y: M.t + ph - cy - 1, width: barW + 1, height: 2,
        style: 'fill:var(--surface)',
      }, g);
    }
    colGroups.push(g);
  }
  for (const i of xTickIndexes(n)) {
    E('text', {
      x: M.l + i * band + band / 2, y: M.t + ph + 16,
      'text-anchor': 'middle', class: 'axis-text',
    }, svg).textContent = shortDate(data[i].date);
  }
  for (let i = 0; i < n; i++) {
    const label = series
      .map((sd) => `${sd.name} ${fmt(data[i].parts[sd.key] || 0)}`)
      .join(', ');
    const hit = E('rect', {
      x: M.l + i * band, y: M.t, width: band, height: ph,
      fill: 'transparent', class: 'bar-hit' + (onBarClick ? ' bar-click' : ''), tabindex: 0,
      'aria-label': `${titleFmt(data[i].date)}: ${label}`,
    }, svg);
    if (onBarClick) {
      hit.addEventListener('click', () => onBarClick(i));
      hit.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onBarClick(i); }
      });
    }
    const show = () => {
      colGroups[i].classList.add('lift');
      tip.show(M.l + i * band + band / 2, M.t + 10, (el) => {
        tipTitle(el, titleFmt(data[i].date));
        for (let s = series.length - 1; s >= 0; s--) {
          const sd = series[s];
          tipRow(el, { color: sd.color, value: fmt(data[i].parts[sd.key] || 0), name: sd.name });
        }
        tipRow(el, { value: fmt(totals[i]), name: 'total' });
      });
    };
    const hide = () => { colGroups[i].classList.remove('lift'); tip.hide(); };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hide);
  }
}
