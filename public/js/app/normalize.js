import { isoDate, civilToIso } from './util.js';
import { unionOf } from './api.js';

const STAGE_MAP = {
  DEEP: 'deep', LIGHT: 'light', REM: 'rem',
  AWAKE: 'awake', WAKE: 'awake', RESTLESS: 'awake',
  ASLEEP: 'light', // classic (no-stages) logs: count plain sleep as light
};

export function normalizeSleep(points, startIso, endIso) {
  const days = new Map(); // date -> {deep,light,rem,awake, asleep, inPeriod}
  const sessions = []; // every session keeps its raw stage segments for the hypnogram
  for (const p of points) {
    const s = p.sleep || unionOf(p);
    if (!s) continue;
    const iv = s.interval || {};
    let date = civilToIso(iv.civilEndTime);
    if (!date && iv.endTime) date = isoDate(new Date(iv.endTime));
    if (!date || date < startIso || date > endIso) continue;
    const day = days.get(date) || { deep: 0, light: 0, rem: 0, awake: 0, asleep: 0, inPeriod: 0 };
    const sum = s.summary || {};
    for (const st of sum.stagesSummary || []) {
      const key = STAGE_MAP[String(st.type || '').toUpperCase()];
      if (key) day[key] += Number(st.minutes || 0);
    }
    day.asleep += Number(sum.minutesAsleep || 0);
    day.inPeriod += Number(sum.minutesInSleepPeriod || 0) || (Number(sum.minutesAsleep || 0) + Number(sum.minutesAwake || 0));
    days.set(date, day);

    if (iv.startTime && iv.endTime) {
      const segments = (s.stages || [])
        .map((st) => ({
          key: STAGE_MAP[String(st.type || '').toUpperCase()],
          startMs: new Date(st.startTime).getTime(),
          endMs: new Date(st.endTime).getTime(),
        }))
        .filter((seg) => seg.key && seg.endMs > seg.startMs);
      sessions.push({
        dateIso: date,
        startMs: new Date(iv.startTime).getTime(),
        endMs: new Date(iv.endTime).getTime(),
        segments,
      });
    }
  }
  sessions.sort((a, b) => (a.dateIso + a.startMs < b.dateIso + b.startMs ? -1 : 1));
  const dayList = [...days.entries()]
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return { days: dayList, sessions };
}

export function normalizeWeight(points, startIso, endIso) {
  const byDate = new Map();
  for (const p of points) {
    const w = p.weight || unionOf(p);
    if (!w || w.weightGrams == null) continue;
    const st = w.sampleTime || {};
    let date = st.civilTime ? civilToIso(st.civilTime) : null;
    if (!date && st.physicalTime) date = st.physicalTime.slice(0, 10);
    if (!date || date < startIso || date > endIso) continue;
    byDate.set(date, Number(w.weightGrams) / 1000); // last log per day wins
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function normalizeBodyFat(points, startIso, endIso) {
  const byDate = new Map();
  for (const p of points) {
    const f = p.bodyFat || unionOf(p);
    if (!f) continue;
    const pct = f.percentage ?? f.bodyFatPercentage ?? f.percent;
    if (pct == null || Number.isNaN(Number(pct))) continue;
    const st = f.sampleTime || {};
    let date = st.civilTime ? civilToIso(st.civilTime) : null;
    if (!date && st.physicalTime) date = st.physicalTime.slice(0, 10);
    if (!date || date < startIso || date > endIso) continue;
    byDate.set(date, Number(pct)); // last log per day wins
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// daily-heart-rate-zones → [{date, light, moderate, vigorous, peak}].
// The zone payload shape isn't pinned down in the docs, so accept both an
// array form ([{type: 'LIGHT', minutes}]) and flat per-zone minute fields.
const ZONE_KEYS = ['light', 'moderate', 'vigorous', 'peak'];
export function normalizeHrZones(points, startIso, endIso) {
  const byDate = new Map();
  for (const p of points) {
    const u = unionOf(p);
    if (!u) continue;
    const date = civilToIso(u.date);
    if (!date || date < startIso || date > endIso) continue;
    const day = byDate.get(date) || { light: 0, moderate: 0, vigorous: 0, peak: 0 };
    const arr = Object.values(u).find((v) => Array.isArray(v)) || [];
    let found = false;
    for (const z of arr) {
      const key = String(z.type || z.zone || z.heartRateZone || '').toLowerCase();
      const min = Number(z.minutes ?? z.minutesInZone);
      if (ZONE_KEYS.includes(key) && !Number.isNaN(min)) { day[key] += min; found = true; }
    }
    if (!found) {
      for (const [k, v] of Object.entries(u)) {
        const m = ZONE_KEYS.find((zk) => k.toLowerCase().includes(zk));
        if (m && v != null && !Number.isNaN(Number(v))) day[m] += Number(v);
      }
    }
    byDate.set(date, day);
  }
  return [...byDate.entries()]
    .map(([date, d]) => ({ date, ...d }))
    .filter((r) => ZONE_KEYS.some((k) => r[k] > 0))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function normalizeIntradayHr(points, todayIso) {
  const buckets = new Map(); // minutes-of-day slot (5 min) -> {sum, n}
  for (const p of points) {
    const hrp = p.heartRate || unionOf(p);
    if (!hrp || hrp.beatsPerMinute == null) continue;
    const st = hrp.sampleTime || {};
    let mins = null;
    if (st.civilTime && st.civilTime.time) {
      mins = (st.civilTime.time.hours || 0) * 60 + (st.civilTime.time.minutes || 0);
    } else if (st.physicalTime) {
      const d = new Date(st.physicalTime);
      if (isoDate(d) !== todayIso) continue;
      mins = d.getHours() * 60 + d.getMinutes();
    }
    if (mins == null) continue;
    const slot = Math.floor(mins / 5) * 5;
    const b = buckets.get(slot) || { sum: 0, n: 0 };
    b.sum += Number(hrp.beatsPerMinute);
    b.n++;
    buckets.set(slot, b);
  }
  return [...buckets.entries()]
    .map(([slot, b]) => ({ slot, value: Math.round(b.sum / b.n) }))
    .sort((a, b) => a.slot - b.slot);
}

const parseDuration = (d) => { // proto Duration JSON: "3600s" / "3600.5s"
  if (d == null) return null;
  const n = parseFloat(String(d));
  return Number.isNaN(n) ? null : n;
};
const prettyType = (t) => String(t || '')
  .toLowerCase().replace(/_/g, ' ')
  .replace(/\b\w/g, (c) => c.toUpperCase());

export function normalizeExercise(points, startIso, endExIso) {
  const out = [];
  for (const p of points) {
    const ex = p.exercise || unionOf(p);
    if (!ex || !ex.interval) continue;
    const iv = ex.interval;
    let dateIso = civilToIso(iv.civilStartTime);
    let timeStr = null;
    if (iv.civilStartTime && iv.civilStartTime.time) {
      const t = iv.civilStartTime.time;
      timeStr = `${String(t.hours || 0).padStart(2, '0')}:${String(t.minutes || 0).padStart(2, '0')}`;
    } else if (iv.startTime) {
      const d = new Date(iv.startTime);
      dateIso = dateIso || isoDate(d);
      timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    if (!dateIso || dateIso < startIso || dateIso >= endExIso) continue;
    let durSec = parseDuration(ex.activeDuration);
    if (durSec == null && iv.startTime && iv.endTime) {
      durSec = (new Date(iv.endTime) - new Date(iv.startTime)) / 1000;
    }
    const ms = ex.metricsSummary || {};
    out.push({
      id: p.name ? String(p.name).split('/').pop() : null,
      startMs: iv.startTime ? new Date(iv.startTime).getTime() : null,
      endMs: iv.endTime ? new Date(iv.endTime).getTime() : null,
      dateIso,
      timeStr,
      name: ex.displayName || prettyType(ex.exerciseType) || 'Workout',
      durSec,
      distanceKm: ms.distanceMillimeters != null ? Number(ms.distanceMillimeters) / 1e6 : null,
      kcal: ms.caloriesKcal != null ? Math.round(Number(ms.caloriesKcal)) : null,
      avgHr: ms.averageHeartRateBeatsPerMinute != null ? Number(ms.averageHeartRateBeatsPerMinute) : null,
      steps: ms.steps != null ? Number(ms.steps) : null,
      azm: ms.activeZoneMinutes != null ? Number(ms.activeZoneMinutes) : null,
      elevM: ms.elevationGainMillimeters != null ? Number(ms.elevationGainMillimeters) / 1000 : null,
      paceSecPerKm: ms.averagePaceSecondsPerMeter != null ? Number(ms.averagePaceSecondsPerMeter) * 1000 : null,
    });
  }
  return out.sort((a, b) => ((b.dateIso + (b.timeStr || '')) < (a.dateIso + (a.timeStr || '')) ? -1 : 1));
}
