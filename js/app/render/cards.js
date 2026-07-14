import { Charts } from '../../charts/index.js';
import { downloadCsv } from '../util.js';
import { goDetail } from './detail.js';

const csvName = (title) => String(title || 'data')
  .toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '') + '.csv';

export function makeCard(parent, { title, sub, legendItems, render, table, detailKey }) {
  const card = document.createElement('div');
  card.className = 'card';
  const head = document.createElement('div');
  head.className = 'card-head';
  const tw = document.createElement('div');
  const h = document.createElement('h3');
  h.className = 'card-title';
  if (detailKey) {
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'card-link';
    link.textContent = title;
    const chev = document.createElement('span');
    chev.className = 'card-chevron';
    chev.textContent = '›';
    link.appendChild(chev);
    link.addEventListener('click', () => goDetail(detailKey));
    h.appendChild(link);
  } else {
    h.textContent = title;
  }
  tw.appendChild(h);
  if (sub) {
    const s = document.createElement('div');
    s.className = 'card-sub';
    s.textContent = sub;
    tw.appendChild(s);
  }
  head.appendChild(tw);
  const tools = document.createElement('div');
  tools.className = 'card-tools';
  const csvBtn = document.createElement('button');
  csvBtn.className = 'tbl-toggle';
  csvBtn.textContent = 'CSV';
  csvBtn.title = 'Download this card’s data as CSV';
  csvBtn.addEventListener('click', () => {
    const t = table();
    downloadCsv(csvName(title), t.head, t.rows);
  });
  tools.appendChild(csvBtn);
  const btn = document.createElement('button');
  btn.className = 'tbl-toggle';
  btn.textContent = 'Table';
  btn.setAttribute('aria-pressed', 'false');
  tools.appendChild(btn);
  head.appendChild(tools);
  card.appendChild(head);
  const body = document.createElement('div');
  body.className = 'chart-body';
  card.appendChild(body);
  parent.appendChild(card);

  let mode = 'chart';
  const paint = () => {
    body.textContent = '';
    if (mode === 'chart') {
      render(body);
      if (legendItems) Charts.legend(body, legendItems);
    } else {
      const t = table();
      const scroll = document.createElement('div');
      scroll.className = 'table-scroll';
      const tbl = document.createElement('table');
      tbl.className = 'data-table';
      const thead = document.createElement('thead');
      const trh = document.createElement('tr');
      for (const c of t.head) {
        const th = document.createElement('th');
        th.textContent = c;
        trh.appendChild(th);
      }
      thead.appendChild(trh);
      tbl.appendChild(thead);
      const tbody = document.createElement('tbody');
      for (const r of t.rows) {
        const tr = document.createElement('tr');
        for (const c of r) {
          const td = document.createElement('td');
          td.textContent = c;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      scroll.appendChild(tbl);
      body.appendChild(scroll);
    }
  };
  btn.addEventListener('click', () => {
    mode = mode === 'chart' ? 'table' : 'chart';
    btn.classList.toggle('active', mode === 'table');
    btn.setAttribute('aria-pressed', String(mode === 'table'));
    paint();
  });
  paint();
}

export function statRow(el, items) {
  const row = document.createElement('div');
  row.className = 'stat-row';
  for (const it of items) {
    if (it.value == null || it.value === '—') continue;
    const b = document.createElement('div');
    b.className = 'stat-mini';
    const v = document.createElement('div');
    v.className = 'stat-mini-value';
    v.textContent = it.value;
    const l = document.createElement('div');
    l.className = 'stat-mini-label';
    l.textContent = it.label;
    b.append(v, l);
    row.appendChild(b);
  }
  el.appendChild(row);
}

export function seriesStats(series, fmt) {
  const vals = series.filter((r) => r.value != null);
  if (!vals.length) return [];
  const avg = (arr) => arr.reduce((a, b) => a + b.value, 0) / arr.length;
  const l = vals[vals.length - 1];
  return [
    { label: `latest (${Charts.shortDate(l.date)})`, value: fmt(l.value) },
    { label: '7-day avg', value: fmt(avg(vals.slice(-7))) },
    { label: '30-day avg', value: fmt(avg(vals.slice(-30))) },
    { label: '90-day min', value: fmt(Math.min(...vals.map((r) => r.value))) },
    { label: '90-day max', value: fmt(Math.max(...vals.map((r) => r.value))) },
  ];
}

export function appendTable(el, head, rows, title) {
  if (title) { // detail pages: offer the table as a CSV download
    const bar = document.createElement('div');
    bar.className = 'table-tools';
    const btn = document.createElement('button');
    btn.className = 'tbl-toggle';
    btn.textContent = 'Download CSV';
    btn.addEventListener('click', () => downloadCsv(csvName(title), head, rows));
    bar.appendChild(btn);
    el.appendChild(bar);
  }
  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const tbl = document.createElement('table');
  tbl.className = 'data-table';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const c of head) {
    const th = document.createElement('th');
    th.textContent = c;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    for (const c of r) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  scroll.appendChild(tbl);
  el.appendChild(scroll);
}

export const cardWrap = (body) => {
  const card = document.createElement('div');
  card.className = 'card';
  const cb = document.createElement('div');
  cb.className = 'chart-body';
  card.appendChild(cb);
  body.appendChild(card);
  return cb;
};

export function errCard(parent, title, err) {
  const msg = String((err && err.message) || err);
  makeCard(parent, {
    title,
    render: (body) => Charts.emptyNote(body, `Couldn't load: ${msg}`),
    table: () => ({ head: ['Error'], rows: [[msg]] }),
  });
}

export function loadingCard(parent, title) {
  makeCard(parent, {
    title,
    render: (body) => Charts.emptyNote(body, 'Loading…'),
    table: () => ({ head: [], rows: [] }),
  });
}
