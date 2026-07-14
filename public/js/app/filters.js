// Candidate filter spellings: official docs show bare field paths, the
// reference CLI shows type-prefixed ones — the API accepts one of them.
export const dateFilters = (slug, startIso, endExIso) => {
  const f = slug.replace(/-/g, '_');
  return [
    `date >= "${startIso}" AND date < "${endExIso}"`,
    `${f}.date >= "${startIso}" AND ${f}.date < "${endExIso}"`,
  ];
};
export const timeFilters = (slug, field, startLit, endLit) => {
  const f = slug.replace(/-/g, '_');
  return [
    `${field} >= "${startLit}" AND ${field} < "${endLit}"`,
    `${f}.${field} >= "${startLit}" AND ${f}.${field} < "${endLit}"`,
  ];
};
