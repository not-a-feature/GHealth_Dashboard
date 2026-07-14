import { E, emptyNote, makeTip, tipTitle, tipRow } from './core.js';

const minLabel = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};
const clock = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// Sleep hypnogram: per-stage tracks with rounded segments.
// stages: [{key,name,color}] top→bottom; segments: [{key,startMs,endMs}]
export function stageTracks(container, { segments, stages, startMs, endMs }) {
  container.querySelectorAll(':scope > svg, :scope > .empty-note').forEach((n) => n.remove());
  if (!segments || !segments.length || !(endMs > startMs)) return emptyNote(container, 'No stage detail available.');
  const w = Math.max(container.clientWidth, 240);
  const rowH = 14, rowGap = 34, padX = 2;
  const h = stages.length * (rowH + rowGap) + 20;
  const svg = E('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img', class: 'viz-fluid' }, undefined);
  container.appendChild(svg);
  const tip = makeTip(container);
  const X = (t) => padX + ((t - startMs) / (endMs - startMs)) * (w - padX * 2);

  stages.forEach((st, i) => {
    const yLab = i * (rowH + rowGap) + 14;
    const yTrack = yLab + 8;
    const total = segments
      .filter((s) => s.key === st.key)
      .reduce((a, s) => a + (s.endMs - s.startMs) / 60000, 0);
    const lab = E('text', { x: padX, y: yLab, class: 'track-label' }, svg);
    lab.textContent = `${st.name} · ${minLabel(total)}`;
    E('rect', { x: padX, y: yTrack, width: w - padX * 2, height: rowH, rx: rowH / 2, style: 'fill:var(--track)' }, svg);
    for (const s of segments) {
      if (s.key !== st.key) continue;
      const x1 = X(s.startMs);
      const wid = Math.max(3, X(s.endMs) - x1);
      const seg = E('rect', {
        x: x1, y: yTrack, width: wid, height: rowH, rx: Math.min(rowH / 2, wid / 2),
        style: `fill:${st.color}`, tabindex: 0, class: 'bar-hit',
        'aria-label': `${st.name} ${clock(s.startMs)}–${clock(s.endMs)}`,
      }, svg);
      const show = () => tip.show(x1 + wid / 2, yTrack - 6, (el) => {
        tipTitle(el, `${clock(s.startMs)} – ${clock(s.endMs)}`);
        tipRow(el, { color: st.color, value: minLabel((s.endMs - s.startMs) / 60000), name: st.name });
      });
      seg.addEventListener('pointerenter', show);
      seg.addEventListener('pointerleave', () => tip.hide());
      seg.addEventListener('focus', show);
      seg.addEventListener('blur', () => tip.hide());
    }
  });
  const yAxis = h - 4;
  const times = [startMs, (startMs + endMs) / 2, endMs];
  times.forEach((t, i) => {
    const anchor = i === 0 ? 'start' : i === times.length - 1 ? 'end' : 'middle';
    const txt = E('text', { x: X(t), y: yAxis, 'text-anchor': anchor, class: 'axis-text' }, svg);
    txt.textContent = clock(t);
  });
}
