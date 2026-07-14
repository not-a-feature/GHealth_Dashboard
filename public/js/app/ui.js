import { $ } from './util.js';
import { THEME_KEY } from './constants.js';

export function banner(msg, isError) {
  const el = $('#banner');
  if (!msg) { el.classList.add('hidden'); return; }
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
  el.classList.remove('hidden');
}

// Inline SVGs (no icon font/deps) — sun, moon, and a half-sun/moon dial for
// "auto" so all three theme states read at a glance.
const THEME_ICONS = {
  light: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6"/></g></svg>',
  dark: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M20.6 15.2A8.7 8.7 0 0 1 8.8 3.4a8.9 8.9 0 1 0 11.8 11.8Z"/></svg>',
  auto: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="currentColor" d="M12 3a9 9 0 0 1 0 18Z"/></svg>',
};
export function applyTheme() {
  const t = localStorage.getItem(THEME_KEY) || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  $('#theme-icon').innerHTML = THEME_ICONS[t];
  $('#theme-label').textContent = t === 'auto' ? 'Auto' : t === 'light' ? 'Light' : 'Dark';
}
$('#btn-theme').addEventListener('click', () => {
  const order = ['auto', 'light', 'dark'];
  const cur = localStorage.getItem(THEME_KEY) || 'auto';
  localStorage.setItem(THEME_KEY, order[(order.indexOf(cur) + 1) % 3]);
  applyTheme();
});

export function show(view) {
  for (const id of ['view-setup', 'view-signin', 'view-dashboard', 'view-detail']) {
    document.getElementById(id).classList.toggle('hidden', id !== view);
  }
  const authed = view === 'view-dashboard' || view === 'view-detail';
  $('#btn-refresh').classList.toggle('hidden', !authed);
  $('#btn-signout').classList.toggle('hidden', !authed);
}
