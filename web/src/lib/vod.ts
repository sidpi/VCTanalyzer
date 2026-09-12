/* ------------------------------------------------------------------ */
/* VOD synchronization (Master Plan §23)                               */
/*                                                                     */
/*   VOD Timestamp  ↕  Round Timestamp  ↕  Event Timestamp  ↕  Map     */
/*                                                                     */
/* A round's events are recorded relative to round start (t=0). To     */
/* sync a full VOD, we need the VOD timestamp at which the round       */
/* started. In production this comes from round detection (CV); for    */
/* the mock dataset we derive a deterministic offset per round.        */
/* ------------------------------------------------------------------ */

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function seeded01(seed: number): number {
  let a = seed >>> 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * VOD timestamp (seconds into the full video) at which the given round
 * starts. Deterministic per match+round so the sync survives reloads.
 * Mock model: ~45s tactical timeout before the match, ~95s average round
 * cadence with variance, plus per-round buy-time jitter.
 */
export function roundStartTimeFor(matchId: string, roundNumber: number): number {
  const seed =
    matchId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 7) +
    roundNumber * 131;
  const beforeMatch = 38 + seeded01(seed) * 14; // agent select → barrier drop
  const priorRounds = (roundNumber - 1) * (89 + seeded01(seed + 1) * 12);
  return Math.round(beforeMatch + priorRounds);
}

/** Parse "mm:ss" (or bare seconds) into seconds. Returns null if invalid. */
export function parseTimeString(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(\d{1,2}):([0-5]?\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Average round duration used when a round's own duration is unknown. */
export const AVG_ROUND_SECONDS = 95;

/**
 * Estimated VOD start of a round when the exact offset is unknown — the
 * initial guess the user can correct. Deliberately simple so corrections
 * are predictable.
 */
export function estimateRoundStart(roundNumber: number): number {
  return Math.round(45 + (roundNumber - 1) * AVG_ROUND_SECONDS);
}

/** Format seconds as m:ss for compact UI labels. */
export function formatMinutesSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
