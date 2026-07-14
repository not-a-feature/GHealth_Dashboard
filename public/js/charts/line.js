import { E, M, frame, drawYAxis, xTickIndexes, emptyNote, makeTip, tipTitle, tipRow, fmtNum, shortDate, longDate, yScale, nextUid } from './core.js';

// labels: display label per index; series: [{name, color, values:[num|null]}]
export function lineChart(container, {
  labels, series, height = 210, fmt = (v) => fmtNum(v, 0), unit = '',
  area = false, zeroBase = false, dots = false, endLabel = true,
  tickLabels = null, titleForIndex = null, zones = null, onBarClick = null,
}) {
  const all = series.flatMap((s) => s.values);
  if (!all.some((v) => v != null)) return emptyNote(container);
  const { svg, pw, ph } = frame(container, height);
  const tip = makeTip(container);
  const scale = yScale(all, { zeroBase });
  drawYAxis(svg, scale, ph, pw, fmt);

  const n = labels.length;
  const stepX = n > 1 ? pw / (n - 1) : 0;
  const X = (i) => M.l + (n > 1 ? i * stepX : pw / 2);
  const Y = (v) => M.t + ph - ((v - scale.lo) / (scale.hi - scale.lo)) * ph;

  // heart-rate-style zones: color the line by which band each point sits in,
  // with a dotted threshold line at every band boundary that falls in view.
  const zoneAt = (v) => {
    if (!zones) return null;
    for (let z = 0; z < zones.length; z++) if (v < zones[z].upTo) return zones[z];
    return zones[zones.length - 1];
  };
  const lineColor = (s, v) => (zones ? zoneAt(v).color : s.color);
  if (zones) {
    for (let z = 0; z < zones.length - 1; z++) {
      const b = zones[z].upTo;
      if (b <= scale.lo || b >= scale.hi) continue;
      E('line', { x1: M.l, x2: M.l + pw, y1: Y(b), y2: Y(b), class: 'zone-line', style: `stroke:${zones[z + 1].color}` }, svg);
    }
  }

  const ticks = tickLabels || labels.map(shortDate);
  for (const i of xTickIndexes(n)) {
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    E('text', { x: X(i), y: M.t + ph + 16, 'text-anchor': anchor, class: 'axis-text' }, svg)
      .textContent = ticks[i];
  }

  for (const s of series) {
    // build path, skipping nulls (gaps are honest; sparse series just connect points)
    let d = '';
    let started = false;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const v = s.values[i];
      if (v == null) continue;
      pts.push(i);
      d += (started ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1);
      started = true;
    }
    if (area && pts.length > 1) {
      // soft vertical gradient under the line — warmer, app-style fill
      const areaColor = zones ? zones[0].color : s.color;
      const gid = 'la' + nextUid();
      const grad = E('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' }, E('defs', {}, svg));
      E('stop', { offset: '0%', 'stop-color': areaColor, 'stop-opacity': '0.22' }, grad);
      E('stop', { offset: '100%', 'stop-color': areaColor, 'stop-opacity': '0.02' }, grad);
      const areaD = d + `L${X(pts[pts.length - 1]).toFixed(1)},${M.t + ph}L${X(pts[0]).toFixed(1)},${M.t + ph}Z`;
      E('path', { d: areaD, style: `fill:url(#${gid})` }, svg);
    }
    if (zones) {
      // split each segment at the zone boundaries it crosses, coloring every
      // piece by the band its midpoint lands in
      for (let a = 0; a < pts.length - 1; a++) {
        const v0 = s.values[pts[a]], v1 = s.values[pts[a + 1]];
        const x0 = X(pts[a]), y0 = Y(v0), x1 = X(pts[a + 1]), y1 = Y(v1);
        const lo = Math.min(v0, v1), hi = Math.max(v0, v1);
        const cuts = [];
        for (let z = 0; z < zones.length - 1; z++) { const b = zones[z].upTo; if (b > lo && b < hi) cuts.push(b); }
        cuts.sort((p, q) => (v1 >= v0 ? p - q : q - p));
        let px = x0, py = y0, pv = v0;
        const emit = (nx, ny, midV) => {
          E('path', { d: `M${px.toFixed(1)},${py.toFixed(1)}L${nx.toFixed(1)},${ny.toFixed(1)}`, fill: 'none',
            style: `stroke:${lineColor(s, midV)};stroke-width:2;stroke-linecap:round` }, svg);
          px = nx; py = ny;
        };
        for (const b of cuts) {
          const t = (b - v0) / (v1 - v0);
          emit(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, (pv + b) / 2);
          pv = b;
        }
        emit(x1, y1, (pv + v1) / 2);
      }
    } else {
      E('path', {
        d, fill: 'none',
        style: `stroke:${s.color};stroke-width:2;stroke-linejoin:round;stroke-linecap:round`,
      }, svg);
    }
    // dots at every point when the range is short enough to read (app-style),
    // or whenever the caller asks for them
    if (dots || pts.length <= 14) {
      for (const i of pts) {
        E('circle', {
          cx: X(i), cy: Y(s.values[i]), r: 3.5,
          style: `fill:${lineColor(s, s.values[i])};stroke:var(--surface);stroke-width:2`,
        }, svg);
      }
    }
    if (pts.length) {
      const last = pts[pts.length - 1];
      E('circle', {
        cx: X(last), cy: Y(s.values[last]), r: 4,
        style: `fill:${lineColor(s, s.values[last])};stroke:var(--surface);stroke-width:2`,
      }, svg);
      if (endLabel) {
        const tx = Math.min(X(last) + 7, M.l + pw + 12);
        E('text', {
          x: tx, y: Y(s.values[last]) - 8,
          'text-anchor': tx > M.l + pw - 20 ? 'end' : 'start', class: 'end-label',
        }, svg).textContent = fmt(s.values[last]);
      }
    }
  }

  // crosshair + tooltip; snaps to nearest index that has any value
  const withData = [...Array(n).keys()].filter((i) => series.some((s) => s.values[i] != null));
  if (!withData.length) return;
  const cross = E('line', { y1: M.t, y2: M.t + ph, class: 'crosshair', style: 'display:none' }, svg);
  const hoverDots = series.map((s) =>
    E('circle', { r: 4, style: `display:none;fill:${s.color};stroke:var(--surface);stroke-width:2` }, svg));

  let curIdx = -1;
  const showAt = (i) => {
    curIdx = i;
    const x = X(i);
    cross.setAttribute('x1', x); cross.setAttribute('x2', x);
    cross.style.display = '';
    series.forEach((s, si) => {
      const v = s.values[i];
      if (v == null) { hoverDots[si].style.display = 'none'; return; }
      hoverDots[si].style.display = '';
      hoverDots[si].style.fill = lineColor(s, v);
      hoverDots[si].setAttribute('cx', x);
      hoverDots[si].setAttribute('cy', Y(v));
    });
    tip.show(x, M.t + 8, (el) => {
      tipTitle(el, titleForIndex ? titleForIndex(i) : longDate(labels[i]));
      for (const s of series) {
        const v = s.values[i];
        tipRow(el, {
          color: lineColor(s, v),
          value: v == null ? '—' : `${fmt(v)}${unit ? ' ' + unit : ''}`,
          name: zones && v != null ? zoneAt(v).name : (series.length > 1 ? s.name : undefined),
        });
      }
    });
  };
  const hideHover = () => {
    curIdx = -1;
    cross.style.display = 'none';
    hoverDots.forEach((d) => (d.style.display = 'none'));
    tip.hide();
  };
  const nearest = (px) => {
    let best = withData[0];
    let bd = Infinity;
    for (const i of withData) {
      const d = Math.abs(X(i) - px);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  const overlay = E('rect', {
    x: M.l, y: M.t, width: pw, height: ph, fill: 'transparent',
    tabindex: 0, class: 'bar-hit' + (onBarClick ? ' bar-click' : ''),
    'aria-label': onBarClick ? 'Chart: use arrow keys to inspect values, Enter to open details' : 'Chart: use arrow keys to inspect values',
  }, svg);
  overlay.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    showAt(nearest(ev.clientX - r.left));
  });
  overlay.addEventListener('pointerleave', hideHover);
  overlay.addEventListener('focus', () => showAt(withData[withData.length - 1]));
  overlay.addEventListener('blur', hideHover);
  overlay.addEventListener('keydown', (ev) => {
    if (onBarClick && ev.key === 'Enter') {
      ev.preventDefault();
      return onBarClick(curIdx >= 0 ? curIdx : withData[withData.length - 1]);
    }
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const pos = Math.max(0, withData.indexOf(curIdx));
    const next = ev.key === 'ArrowLeft' ? Math.max(0, pos - 1) : Math.min(withData.length - 1, pos + 1);
    showAt(withData[next]);
  });
  if (onBarClick) {
    overlay.addEventListener('click', (ev) => {
      const r = svg.getBoundingClientRect();
      onBarClick(nearest(ev.clientX - r.left));
    });
  }
}
