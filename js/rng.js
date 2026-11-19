// js/rng.js — small seeded PRNG (mulberry32) for anything that can change a match's
// outcome. Same seed + same inputs = same match, which keeps the simulation replayable
// and ready for rollback netcode later. Render-only randomness (particles, idle sway)
// may keep using Math.random().
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed: seed >>> 0,
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    chance: p => next() < p
  };
}
