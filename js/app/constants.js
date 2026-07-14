// All Google endpoints are called directly from the browser (they support
// CORS), so the app is a plain static site — host it anywhere.
export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const API_BASE = 'https://health.googleapis.com';
export const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.location.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
].join(' ');
// Works for localhost (Desktop clients accept any loopback path) and for
// static hosts, where this exact URL must be registered on the Web client.
export const REDIRECT_URI = location.origin + location.pathname.replace(/index\.html$/, '');

export const CFG_KEY = 'ghd_config';
export const TOK_KEY = 'ghd_tokens';
export const CACHE_KEY = 'ghd_cache_v3';
export const THEME_KEY = 'ghd_theme';
export const OAUTH_KEY = 'ghd_oauth_pending';

export const DAY_MS = 86400000;
export const FETCH_DAYS = 89; // one rollup request must stay within the API's 90-day cap

// Heart-rate zones (fixed bpm bands, rest → peak) used to color the intraday
// heart-rate line the way the Google Health app does.
export const HR_ZONES = [
  { upTo: 114, color: 'var(--hr-z1)', name: 'Resting' },
  { upTo: 138, color: 'var(--hr-z2)', name: 'Fat burn' },
  { upTo: 162, color: 'var(--hr-z3)', name: 'Cardio' },
  { upTo: Infinity, color: 'var(--hr-z4)', name: 'Peak' },
];
