export const $ = (sel) => document.querySelector(sel);

export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem(k); },
};

export const isoDate = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const parseIso = (iso) => new Date(iso + 'T00:00:00');
export const civilDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y, month: m, day: d };
};
export const civilToIso = (c) => {
  const d = (c && c.date) || c;
  if (!d || !d.year) return null;
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
};
export const hm = (min) => {
  if (min == null) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

// Offer head+rows as a CSV download (all in-browser; the BOM keeps Excel
// reading UTF-8 like °/₂ correctly).
export function downloadCsv(filename, head, rows) {
  const esc = (c) => {
    const s = String(c == null ? '' : c);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
