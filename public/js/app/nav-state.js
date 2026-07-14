// Shared flag: whether the current hash change came from an in-app link
// (goDetail/goWorkout) vs. a direct hash edit — used by the Back button to
// decide between history.back() and clearing the hash.
export const navFlag = { internal: false };
