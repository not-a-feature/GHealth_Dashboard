# GHealth Dashboard

A private dashboard for your Google Health data — steps, sleep, heart rate,
workouts and more — pulled straight from the **Google Health API** into your
browser.

**Plain static site.** The `public/` files talk to Google's OAuth and Health
API directly from the browser. Your credentials, tokens and cached data live
only in local storage — no server involved.

**Demo mode:** append `?demo=1` to the URL to try the UI with sample data —
no Google account needed.

## Run it

```
python -m http.server 8180 -d public
# or: npx serve public
```

Or host `public/` anywhere (GitHub Pages, Netlify, your own server) and
register that exact URL in your OAuth client's origins/redirect URIs.

## One-time Google setup

1. [Google Cloud Console](https://console.cloud.google.com/) → create a
   project.
2. **APIs & Services → Library** → enable "Google Health API".
3. **APIs & Services → OAuth consent screen** → type **External** → add
   yourself as a **test user** (required, or sign-in fails with
   `access_denied`).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   **Desktop app** for localhost, **Web application** for a hosted site.
5. Paste the **Client ID**/**Secret** into the dashboard's setup screen, sign
   in. The "unverified app" warning is expected — choose *Continue*.

> In *Testing* mode, sign-in expires after ~7 days. Publishing the consent
> screen (still just for you) removes that limit.

## What you get

- **Today:** stat tiles (steps, active zone minutes, active energy, resting
  HR, sleep, weight) with trends, a weekly cardio-load ring, and today's
  intraday HR curve.
- **Trends (7/30/90 days):** steps, sleep stages, resting HR, weight, AZM,
  active energy, HRV, SpO₂, respiratory rate, HR zones, distance, floors,
  VO₂ max, body fat (when available). Click any tile for a 90-day
  drill-down; click a night for its hypnogram.
- **Workouts:** activity list with duration/distance/calories/HR; detail
  page adds an HR curve, GPS route map, pace splits and elevation profile.
- Every chart has a **Table** toggle and **CSV** export. Light/dark theme
  follows your system.

## Troubleshooting

- **"Couldn't load" / 403:** that data type may not exist for your
  account/device, or the API isn't enabled in your Cloud project.
- **Stale numbers:** it paints from cache then re-fetches; **Refresh**
  forces it.
- **Sleep without stages:** shown as "light" sleep (Google doesn't break it
  down).
- **Missing day:** a gap, not a zero — device likely wasn't worn/synced.
- **Sign-in fails in one browser only:** re-paste credentials via "Change
  API credentials…" or try another profile.
- Sign out (top right) revokes the token and clears local caches.

## Layout

```
public/index.html     app shell: setup → sign-in → dashboard → detail pages
public/styles.css     light/dark theme
public/js/app/        OAuth PKCE flow, API client, caching, rendering
public/js/charts/     hand-rolled SVG charts
```
