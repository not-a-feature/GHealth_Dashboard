import { isoDate, addDays } from './util.js';
import { FETCH_DAYS } from './constants.js';
import { axisDates } from './series.js';

// ---------- demo mode (?demo=1): generated sample data, no account needed ----------
export function demoData() {
  const now = new Date();
  const todayIso = isoDate(now);
  const startIso = isoDate(addDays(now, -FETCH_DAYS));
  const axis = axisDates(startIso, todayIso);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const daySeries = (fn) => axis.map((date, i) => ({ date, value: fn(i, new Date(date + 'T00:00:00').getDay()) }));
  const ok = (v) => ({ ok: true, v });

  const steps = daySeries((i, dow) => Math.round(rnd(4500, 9000) + (dow === 0 || dow === 6 ? rnd(1500, 6000) : rnd(0, 3000))));
  const sleep = axis.map((date) => {
    const deep = Math.round(rnd(55, 110)), light = Math.round(rnd(190, 260));
    const rem = Math.round(rnd(75, 130)), awake = Math.round(rnd(25, 60));
    const asleep = deep + light + rem;
    return { date, deep, light, rem, awake, asleep, inPeriod: asleep + awake };
  });
  const weight = axis.filter((_, i) => i % 3 === 0)
    .map((date, i) => ({ date, value: +(79.5 - i * 0.04 + rnd(-0.4, 0.4)).toFixed(1) }));
  const hrToday = [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (let slot = 0; slot <= nowMin; slot += 5) {
    const h = slot / 60;
    let base = h < 7 ? 54 : h < 9 ? 75 : h < 18 ? 68 : 62;
    if (h >= 17 && h < 18) base = 118; // evening workout
    hrToday.push({ slot, value: Math.round(base + rnd(-6, 8)) });
  }
  const woTypes = [
    { name: 'Run', dur: [1500, 3600], km: [4, 10], hr: [138, 158] },
    { name: 'Ride', dur: [2400, 5400], km: [15, 40], hr: [120, 145] },
    { name: 'Strength Training', dur: [1800, 3000], km: null, hr: [95, 120] },
    { name: 'Walk', dur: [1800, 4200], km: [2, 6], hr: [85, 105] },
  ];
  const exercise = [];
  for (let i = 2; i < FETCH_DAYS; i += Math.round(rnd(2, 5))) {
    const t = woTypes[Math.floor(rnd(0, woTypes.length))];
    const durSec = Math.round(rnd(t.dur[0], t.dur[1]));
    const km = t.km ? +rnd(t.km[0], t.km[1]).toFixed(2) : null;
    exercise.push({
      dateIso: isoDate(addDays(now, -i)),
      timeStr: `${String(Math.floor(rnd(6, 20))).padStart(2, '0')}:${String(Math.floor(rnd(0, 59))).padStart(2, '0')}`,
      name: t.name, durSec,
      distanceKm: km,
      kcal: Math.round(durSec / 60 * rnd(6, 11)),
      avgHr: Math.round(rnd(t.hr[0], t.hr[1])),
      steps: t.name === 'Run' || t.name === 'Walk' ? Math.round((km || 3) * 1300) : null,
      azm: Math.round(durSec / 60 * rnd(0.5, 1.8)),
      elevM: t.name === 'Ride' || t.name === 'Run' ? Math.round(rnd(20, 300)) : null,
      paceSecPerKm: km && t.name !== 'Ride' ? durSec / km : null,
    });
  }
  // a few short activities so the "hide short" filter has something to hide
  exercise.push(
    { dateIso: isoDate(addDays(now, -1)), timeStr: '12:41', name: 'Walk', durSec: 190, distanceKm: 0.28, kcal: 14, avgHr: 92, steps: 390, azm: 0, elevM: null, paceSecPerKm: 680 },
    { dateIso: isoDate(addDays(now, -3)), timeStr: '09:12', name: 'Run', durSec: 240, distanceKm: 0.61, kcal: 33, avgHr: 131, steps: 610, azm: 2, elevM: 4, paceSecPerKm: 393 },
  );
  exercise.sort((a, b) => ((b.dateIso + b.timeStr) < (a.dateIso + a.timeStr) ? -1 : 1));

  // stage segments per night for the hypnogram (last 10 nights)
  const mkNight = (offset) => {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 7, Math.floor(rnd(20, 55))).getTime();
    const start = end - rnd(6.8, 8.6) * 3600 * 1000;
    const segments = [];
    let t = start;
    let n = 0;
    while (t < end - 5 * 60000 && n < 60) {
      const hrsIn = (t - start) / 3600000;
      let key = 'light';
      const r = Math.random();
      if (r < 0.07) key = 'awake';
      else if (hrsIn < 3.5 && r < 0.32) key = 'deep';
      else if (hrsIn > 2 && r < 0.35) key = 'rem';
      const dur = (key === 'awake' ? rnd(2, 8) : rnd(12, 45)) * 60000;
      segments.push({ key, startMs: t, endMs: Math.min(t + dur, end) });
      t += dur;
      n++;
    }
    return { dateIso: isoDate(new Date(end)), startMs: start, endMs: end, segments };
  };
  const sessions = [];
  for (let o = 9; o >= 0; o--) sessions.push(mkNight(o));

  return {
    todayIso, startIso,
    exercise: ok(exercise),
    steps: ok(steps),
    azm: ok(daySeries(() => Math.round(rnd(8, 75)))),
    energy: ok(daySeries(() => Math.round(rnd(320, 780)))),
    rhr: ok(daySeries((i) => Math.round(57 + Math.sin(i / 9) * 2 + rnd(-1.5, 1.5)))),
    hrv: ok(daySeries((i) => Math.round(44 + Math.sin(i / 6) * 6 + rnd(-5, 5)))),
    spo2: ok(daySeries(() => +rnd(94.8, 98.2).toFixed(1))),
    rr: ok(daySeries(() => +rnd(13.2, 15.8).toFixed(1))),
    hrzones: ok(axis.map((date, i) => {
      const active = i % 7 === 2 || i % 7 === 5; // "workout days" get real zone time
      return {
        date,
        light: Math.round(rnd(15, 45)),
        moderate: Math.round(active ? rnd(20, 40) : rnd(2, 12)),
        vigorous: Math.round(active ? rnd(10, 30) : rnd(0, 4)),
        peak: Math.round(active ? rnd(0, 8) : 0),
      };
    })),
    distance: ok(daySeries((i, dow) => +(rnd(2.5, 7) + (dow === 0 || dow === 6 ? rnd(1, 5) : 0)).toFixed(2))),
    floors: ok(daySeries(() => Math.round(rnd(3, 18)))),
    vo2max: ok(daySeries((i) => +(46 + i * 0.015 + Math.sin(i / 15) * 0.8 + rnd(-0.3, 0.3)).toFixed(1))),
    bodyfat: ok(axis.filter((_, i) => i % 3 === 1)
      .map((date, i) => ({ date, value: +(21.8 - i * 0.03 + rnd(-0.4, 0.4)).toFixed(1) }))),
    sleep: ok({ days: sleep, sessions }),
    weight: ok(weight),
    hrToday: ok(hrToday),
  };
}

// Synthetic per-workout series so the detail page works in demo mode.
export function demoWorkoutHr(w) {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const mins = Math.max(5, Math.round((w.durSec || 1800) / 60));
  const base = (w.avgHr || 120) - 8;
  const out = [];
  for (let m = 0; m <= mins; m++) {
    const warm = Math.min(1, m / 8);
    const surge = /run|hiit|cardio/i.test(w.name) && m % 12 < 4 ? 18 : 0;
    out.push({ slot: m, value: Math.round(base * (0.85 + 0.15 * warm) + surge + rnd(-4, 8)) });
  }
  return Promise.resolve(out);
}
export function demoRoute(w) {
  if (!w.distanceKm) return Promise.reject(new Error('no GPS on this activity'));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const points = [];
  const samples = [];
  const a1 = rnd(1.5, 3.5), a2 = rnd(2.5, 5.5), ph = rnd(0, Math.PI);
  const totalM = w.distanceKm * 1000;
  const durMs = (w.durSec || w.distanceKm * 360) * 1000;
  const t0 = (w.startMs || Date.now() - durMs);
  const baseAlt = rnd(250, 420);
  for (let i = 0; i <= 200; i++) {
    const t = (i / 200) * 2 * Math.PI;
    points.push({
      lat: 48.78 + 0.004 * Math.sin(t) + 0.0012 * Math.sin(a1 * t + ph),
      lon: 9.18 + 0.006 * Math.cos(t) + 0.0015 * Math.sin(a2 * t),
    });
    const frac = i / 200;
    samples.push({
      tMs: t0 + durMs * (frac + 0.03 * Math.sin(a1 * t)), // uneven pace per km
      distM: totalM * frac,
      altM: Math.round(baseAlt + 25 * Math.sin(a2 * t + ph) + 12 * Math.sin(3 * t)),
    });
  }
  return Promise.resolve({ points, samples });
}
