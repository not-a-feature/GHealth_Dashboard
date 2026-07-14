import { emptyNote } from './core.js';

// Route map (Leaflet + OpenStreetMap-based CARTO raster tiles). Leaflet is
// lazy-loaded from the CDN only when a route is actually shown, so the rest
// of the dashboard stays dependency-free. Note: tile requests reveal the
// route's map area to the CARTO CDN (unlike every other chart, which renders
// purely locally).

let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    // Wait for the stylesheet too: if L.map() runs before leaflet.css is
    // applied, the container has no Leaflet layout and the map renders blank
    // or with the tiles stacked in the corner.
    const cssReady = new Promise((res) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.onload = res;
      css.onerror = res; // a missing stylesheet shouldn't block the map entirely
      document.head.appendChild(css);
    });
    const jsReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = res;
      s.onerror = () => rej(new Error('map library failed to load'));
      document.head.appendChild(s);
    });
    Promise.all([jsReady, cssReady])
      .then(() => resolve(window.L))
      .catch((e) => { leafletPromise = null; reject(e); });
  });
  return leafletPromise;
}

const mapIsDark = () => {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
const tileUrl = () => `https://{s}.basemaps.cartocdn.com/${mapIsDark() ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`;

// Leaflet writes colors as SVG attributes, where var(...) doesn't resolve.
const resolveColor = (c, fallback) => {
  const m = /^var\((--[\w-]+)\)$/.exec(String(c || '').trim());
  const v = m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : c;
  return v || fallback;
};

export function routeMap(container, { points, color, height = 300 }) {
  container.querySelectorAll(':scope > .map-box, :scope > .empty-note').forEach((n) => n.remove());
  if (!points || points.length < 2) return emptyNote(container, 'No GPS track for this activity.');
  const box = document.createElement('div');
  box.className = 'map-box';
  box.style.height = height + 'px';
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', 'Route map');
  container.appendChild(box);
  loadLeaflet().then((L) => {
    if (!box.isConnected) return;
    const map = L.map(box, { scrollWheelZoom: false }); // wheel keeps scrolling the page
    map.attributionControl.setPrefix(false);
    const tiles = L.tileLayer(tileUrl(), {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    // swap the tile style when the app theme changes; self-cleans once the
    // map has left the DOM
    const retheme = () => {
      if (!box.isConnected) {
        themeWatch.disconnect();
        mq.removeEventListener('change', retheme);
        return;
      }
      tiles.setUrl(tileUrl());
    };
    const themeWatch = new MutationObserver(retheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', retheme);

    const line = L.polyline(points.map((p) => [p.lat, p.lon]), {
      color: resolveColor(color, '#3b82f6'), weight: 3.5, opacity: 0.95, lineJoin: 'round', lineCap: 'round',
    }).addTo(map);
    const marker = (p, fill) => L.circleMarker([p.lat, p.lon], {
      radius: 6, weight: 2, color: '#ffffff', fillColor: fill, fillOpacity: 1,
    }).addTo(map);
    marker(points[0], resolveColor('var(--good)', '#16a34a'));
    marker(points[points.length - 1], resolveColor('var(--bad)', '#dc2626'));
    map.invalidateSize(); // ensure Leaflet has the container's real size before fitting
    map.fitBounds(line.getBounds(), { padding: [24, 24] });
  }).catch((e) => {
    if (!box.isConnected) return;
    box.remove();
    emptyNote(container, `Map unavailable (${e.message}).`);
  });
}
