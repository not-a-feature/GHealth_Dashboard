import { $, store } from './util.js';
import { CFG_KEY, TOK_KEY, THEME_KEY, OAUTH_KEY, REDIRECT_URI } from './constants.js';
import { show, banner, applyTheme } from './ui.js';
import { signIn, exchangeCode, signOut } from './oauth.js';
import { state, loadData } from './state.js';
import { navFlag } from './nav-state.js';
import { route, showDetailPage, METRIC_DETAILS } from './render/detail.js';
import { showWorkoutPage, wireWorkoutFilters } from './render/workouts.js';
import { renderAll, renderTrends } from './render/today-trends.js';
import { demoData } from './demo.js';

// ---------- dashboard bootstrap ----------
async function showDashboard() {
  if (state.demo) { // demo has no backend: refresh just regenerates the sample data
    state.data = demoData();
    state.loadedAt = new Date();
    route();
    return;
  }
  show('view-dashboard');
  banner(null);
  const loading = loadData(); // seeds cached/pending placeholders synchronously, then refetches all
  route(); // immediate paint from cache (dashboard or a #m/… deep link)
  try {
    await loading;
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/sign in again|Not signed in/i.test(msg)) {
      show('view-signin');
      banner(msg, true);
    } else {
      banner(`Couldn't load data: ${msg}`, true);
    }
  }
}

// Re-render whenever the content width actually changes — this covers window
// resizes AND layout shifts the window never reports (a scrollbar appearing,
// grid tracks reflowing as cards stream in), which used to leave charts
// rendered at a stale width overlapping their neighbors.
let lastMainWidth = 0;
let resizeTimer = null;
new ResizeObserver((entries) => {
  const w = Math.round(entries[0].contentRect.width);
  if (w === lastMainWidth) return;
  const first = lastMainWidth === 0;
  lastMainWidth = w;
  if (first || !state.data) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.currentWorkout != null) showWorkoutPage(state.currentWorkout);
    else if (state.currentDetail) showDetailPage(state.currentDetail);
    else renderAll();
  }, 150);
}).observe(document.querySelector('main'));

// ---------- wire up UI ----------
// Cloud Console deep links in the setup checklist: once the user pastes their
// project ID, every step opens directly inside that project.
function updateConsoleLinks() {
  const id = $('#in-project-id').value.trim();
  const q = id ? `?project=${encodeURIComponent(id)}` : '';
  $('#lnk-enable-api').href = `https://console.cloud.google.com/flows/enableapi?apiid=health.googleapis.com${id ? `&project=${encodeURIComponent(id)}` : ''}`;
  $('#lnk-consent').href = `https://console.cloud.google.com/apis/credentials/consent${q}`;
  $('#lnk-test-users').href = `https://console.cloud.google.com/auth/audience${q}`;
  $('#lnk-oauth-client').href = `https://console.cloud.google.com/apis/credentials/oauthclient${q}`;
}
$('#in-project-id').addEventListener('input', updateConsoleLinks);

$('#setup-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const clientId = $('#in-client-id').value.trim();
  const clientSecret = $('#in-client-secret').value.trim();
  if (!clientId) return;
  // projectId is only a convenience for the Console links, but keep it so
  // "Change API credentials" brings the user back to a fully filled form.
  store.set(CFG_KEY, { clientId, clientSecret, projectId: $('#in-project-id').value.trim() });
  show('view-signin');
  banner(null);
});
$('#btn-signin').addEventListener('click', () => signIn().catch((e) => banner(String(e.message || e), true)));
$('#btn-edit-config').addEventListener('click', () => {
  const cfg = store.get(CFG_KEY) || {};
  $('#in-client-id').value = cfg.clientId || '';
  $('#in-client-secret').value = cfg.clientSecret || '';
  $('#in-project-id').value = cfg.projectId || '';
  updateConsoleLinks();
  show('view-setup');
});
$('#btn-signout').addEventListener('click', () => {
  if (state.demo) { location.href = location.pathname; return; } // exit demo: drop ?demo and reload
  if (location.hash) history.replaceState({}, '', location.pathname);
  signOut();
});
$('#btn-back').addEventListener('click', () => {
  if (navFlag.internal) history.back();
  else location.hash = '';
});
$('#btn-refresh').addEventListener('click', () => showDashboard());
wireWorkoutFilters();
$('#range-picker').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-days]');
  if (!btn) return;
  state.range = Number(btn.dataset.days);
  for (const b of $('#range-picker').children) b.classList.toggle('active', b === btn);
  if (state.data) { renderTrends(); }
});

// ---------- boot ----------
async function boot() {
  // step 5 + hosting note show the URL that actually needs registering on the OAuth client
  for (const el of document.querySelectorAll('.setup-origin')) el.textContent = REDIRECT_URI;
  updateConsoleLinks();
  const qTheme = new URLSearchParams(location.search).get('theme');
  if (qTheme && ['auto', 'light', 'dark'].includes(qTheme)) localStorage.setItem(THEME_KEY, qTheme);
  applyTheme();
  if (new URLSearchParams(location.search).has('demo')) {
    state.demo = true;
    state.data = demoData();
    state.loadedAt = new Date();
    show('view-dashboard');
    $('#btn-signout').textContent = 'Exit demo';
    renderAll();
    banner('Demo mode — this is generated sample data. Use “Exit demo” (top right) to connect your Google account.');
    const qs = new URLSearchParams(location.search);
    const detail = qs.get('detail');
    if (detail && (METRIC_DETAILS[detail] || detail === 'sleep')) location.hash = 'm/' + detail;
    else if (qs.get('wo') != null) location.hash = 'w/' + qs.get('wo');
    else route();
    return;
  }
  // OAuth redirect lands back on this same page with ?code=… (works on any
  // host — no dedicated /callback route needed for static hosting)
  const q = new URLSearchParams(location.search);
  if (q.get('code') || q.get('error')) {
    history.replaceState({}, '', location.pathname === '/callback' ? '/' : location.pathname);
    if (q.get('error')) {
      show('view-signin');
      banner('Sign-in was not completed: ' + q.get('error'), true);
      return;
    }
    const pend = store.get(OAUTH_KEY);
    store.del(OAUTH_KEY);
    if (!pend || q.get('state') !== pend.state || Date.now() - pend.t > 15 * 60 * 1000) {
      show('view-signin');
      banner('Sign-in state mismatch — please try signing in again from this tab.', true);
      return;
    }
    try {
      await exchangeCode(q.get('code'), pend.verifier);
      return showDashboard();
    } catch (e) {
      show('view-signin');
      banner(String(e.message || e), true);
      return;
    }
  }
  if (store.get(TOK_KEY)) return showDashboard();
  if (store.get(CFG_KEY)) return show('view-signin');
  show('view-setup');
}

boot();
