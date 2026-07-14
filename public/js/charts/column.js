import { E, M, frame, drawYAxis, xTickIndexes, roundedTopBar, emptyNote, makeTip, tipTitle, tipRow, compact, shortDate, longDate, yScale } from './core.js';

// data: [{date, value}]; color: CSS color/var; fmt: value formatter
export function columnChart(container, { data, color, height = 210, fmt = compact, unit = '', xFmt = shortDate, titleFmt = longDate, onBarClick }) {
  if (!data || !data.some((d) => d.value != null)) return emptyNote(container);
  const { svg, pw, ph } = frame(container, height);
  const tip = makeTip(container);
  const scale = yScale(data.map((d) => d.value), { zeroBase: true });
  drawYAxis(svg, scale, ph, pw, fmt);

  const n = data.length;
  const band = pw / n;
  const barW = Math.min(24, Math.max(2, band - 2));
  const k = ph / (scale.hi - scale.lo);
  const bars = [];

  for (let i = 0; i < n; i++) {
    const v = data[i].value;
    const x = M.l + i * band + (band - barW) / 2;
    let bar = null;
    if (v != null && v > 0) {
      const h = Math.max(1.5, v * k);
      bar = E('path', { d: roundedTopBar(x, M.t + ph - h, barW, h), style: `fill:${color}` }, svg);
    }
    bars.push(bar);
  }
  for (const i of xTickIndexes(n)) {
    E('text', {
      x: M.l + i * band + band / 2, y: M.t + ph + 16,
      'text-anchor': 'middle', class: 'axis-text',
    }, svg).textContent = xFmt(data[i].date);
  }
  // hit targets: the full band, focusable for keyboard users
  for (let i = 0; i < n; i++) {
    const hit = E('rect', {
      x: M.l + i * band, y: M.t, width: band, height: ph,
      fill: 'transparent', class: 'bar-hit' + (onBarClick ? ' bar-click' : ''), tabindex: 0,
      'aria-label': `${titleFmt(data[i].date)}: ${fmt(data[i].value)}${unit ? ' ' + unit : ''}`,
    }, svg);
    if (onBarClick) {
      hit.addEventListener('click', () => onBarClick(i));
      hit.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onBarClick(i); }
      });
    }
    const show = () => {
      if (bars[i]) bars[i].classList.add('lift');
      tip.show(M.l + i * band + band / 2, M.t + 10, (el) => {
        tipTitle(el, titleFmt(data[i].date));
        tipRow(el, { color, value: `${fmt(data[i].value)}${unit ? ' ' + unit : ''}` });
      });
    };
    const hide = () => { if (bars[i]) bars[i].classList.remove('lift'); tip.hide(); };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hide);
  }
}
