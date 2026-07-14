import { parseIso, addDays } from './util.js';
import { metric } from './cache.js';
import { dailyRollup, listPoints, rollupToSeries, dailyTypeToSeries } from './api.js';
import { dateFilters, timeFilters } from './filters.js';
import { normalizeSleep, normalizeWeight, normalizeExercise, normalizeIntradayHr, normalizeBodyFat, normalizeHrZones } from './normalize.js';

export function fetchers(todayIso, startIso, endExIso) {
  const today = parseIso(todayIso);
  return {
    steps: metric(`steps:${startIso}:${todayIso}`, async () =>
      rollupToSeries(await dailyRollup('steps', startIso, endExIso)).filter((r) => r.date <= todayIso)),
    azm: metric(`azm:${startIso}:${todayIso}`, async () =>
      rollupToSeries(await dailyRollup('active-zone-minutes', startIso, endExIso)).filter((r) => r.date <= todayIso)),
    energy: metric(`energy:${startIso}:${todayIso}`, async () =>
      rollupToSeries(await dailyRollup('active-energy-burned', startIso, endExIso)).filter((r) => r.date <= todayIso)),
    distance: metric(`distance:${startIso}:${todayIso}`, async () =>
      rollupToSeries(await dailyRollup('distance', startIso, endExIso))
        .map((r) => ({ date: r.date, value: r.value != null ? r.value / 1e6 : null })) // mm → km
        .filter((r) => r.date <= todayIso)),
    floors: metric(`floors:${startIso}:${todayIso}`, async () =>
      rollupToSeries(await dailyRollup('floors', startIso, endExIso)).filter((r) => r.date <= todayIso)),

    rhr: metric(`rhr:${startIso}:${todayIso}`, async () =>
      dailyTypeToSeries(
        await listPoints('daily-resting-heart-rate', dateFilters('daily-resting-heart-rate', startIso, endExIso)),
        ['beatsPerMinute'],
      ).filter((r) => r.date >= startIso && r.date <= todayIso)),

    hrv: metric(`hrv:${startIso}:${todayIso}`, async () =>
      dailyTypeToSeries(
        await listPoints('daily-heart-rate-variability', dateFilters('daily-heart-rate-variability', startIso, endExIso)),
        ['averageHeartRateVariabilityMilliseconds', 'deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds'],
      ).filter((r) => r.date >= startIso && r.date <= todayIso)),

    spo2: metric(`spo2:${startIso}:${todayIso}`, async () =>
      dailyTypeToSeries(
        await listPoints('daily-oxygen-saturation', dateFilters('daily-oxygen-saturation', startIso, endExIso)),
        ['averagePercentage'],
      ).filter((r) => r.date >= startIso && r.date <= todayIso)),

    rr: metric(`rr:${startIso}:${todayIso}`, async () =>
      dailyTypeToSeries(
        await listPoints('daily-respiratory-rate', dateFilters('daily-respiratory-rate', startIso, endExIso)),
        ['breathsPerMinute', 'breathsPerMinuteAverage', 'averageBreathsPerMinute'],
      ).filter((r) => r.date >= startIso && r.date <= todayIso)),

    vo2max: metric(`vo2max:${startIso}:${todayIso}`, async () =>
      dailyTypeToSeries(
        await listPoints('daily-vo2-max', dateFilters('daily-vo2-max', startIso, endExIso)),
        ['vo2Max', 'vo2MaxMillilitersPerMinuteKilogram', 'millilitersPerKilogramPerMinute'],
      ).filter((r) => r.date >= startIso && r.date <= todayIso)),

    hrzones: metric(`hrzones:${startIso}:${todayIso}`, async () =>
      normalizeHrZones(
        await listPoints('daily-heart-rate-zones', dateFilters('daily-heart-rate-zones', startIso, endExIso)),
        startIso, todayIso,
      )),

    bodyfat: metric(`bodyfat:${startIso}:${todayIso}`, async () => {
      const startUtc = parseIso(startIso).toISOString();
      const endUtc = parseIso(endExIso).toISOString();
      const filters = timeFilters('body-fat', 'sample_time.physical_time', startUtc, endUtc);
      const points = await listPoints('body-fat', filters);
      return normalizeBodyFat(points, startIso, todayIso);
    }),

    sleep: metric(`sleep:${startIso}:${todayIso}`, async () => {
      const startUtc = parseIso(startIso).toISOString();
      const endUtc = parseIso(endExIso).toISOString();
      const filters = [
        ...timeFilters('sleep', 'interval.civil_end_time', `${startIso}T00:00:00`, `${endExIso}T00:00:00`),
        ...timeFilters('sleep', 'interval.civil_end_time', startIso, endExIso),
        ...timeFilters('sleep', 'interval.end_time', startUtc, endUtc),
      ];
      const points = await listPoints('sleep', filters, { pageSize: 25, maxPages: 8 });
      return normalizeSleep(points, startIso, todayIso);
    }),

    weight: metric(`weight:${startIso}:${todayIso}`, async () => {
      const startUtc = parseIso(startIso).toISOString();
      const endUtc = parseIso(endExIso).toISOString();
      const filters = timeFilters('weight', 'sample_time.physical_time', startUtc, endUtc);
      const points = await listPoints('weight', filters);
      return normalizeWeight(points, startIso, todayIso);
    }),

    exercise: metric(`exercise:${startIso}:${todayIso}`, async () => {
      const startUtc = parseIso(startIso).toISOString();
      const endUtc = parseIso(endExIso).toISOString();
      const filters = [
        ...timeFilters('exercise', 'interval.start_time', startUtc, endUtc),
        ...timeFilters('exercise', 'interval.civil_start_time', `${startIso}T00:00:00`, `${endExIso}T00:00:00`),
      ];
      const points = await listPoints('exercise', filters, { pageSize: 25, maxPages: 8 });
      return normalizeExercise(points, startIso, endExIso);
    }),

    hrToday: metric(`hr:${todayIso}`, async () => {
      const startUtc = today.toISOString();
      const endUtc = addDays(today, 1).toISOString();
      const filters = timeFilters('heart-rate', 'sample_time.physical_time', startUtc, endUtc);
      const points = await listPoints('heart-rate', filters, { pageSize: 10000, maxPages: 4 });
      return normalizeIntradayHr(points, todayIso);
    }),
  };
}
