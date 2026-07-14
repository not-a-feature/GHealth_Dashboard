import { store } from './util.js';
import { CACHE_KEY } from './constants.js';

// The cache is a "last known values" store. Dashboard metrics use it for
// stale-while-revalidate: a reload paints the cached values instantly and
// then always refetches from the API (see loadData). Long-lived lazy fetches
// (workout HR/route) still use the TTL-respecting `cached` below.
function cacheLoad() { return store.get(CACHE_KEY) || {}; }
function cacheGet(key) { const hit = cacheLoad()[key]; return hit ? hit.v : undefined; }
function cachePut(key, v) {
  const c = cacheLoad();
  c[key] = { t: Date.now(), v };
  try { store.set(CACHE_KEY, c); } catch { /* quota — skip caching */ }
}
export async function cached(key, ttlMs, fn) {
  const hit = cacheLoad()[key];
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cachePut(key, v);
  return v;
}

// A dashboard metric: expose the last cached value (for an instant stale
// paint) alongside a loader that always fetches fresh and updates the cache.
export const metric = (key, loader) => ({
  cached: cacheGet(key),
  load: async () => { const v = await loader(); cachePut(key, v); return v; },
});
