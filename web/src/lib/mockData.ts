/* ------------------------------------------------------------------ */
/* Mock dataset (Website Plan §43) — deterministic so every page and   */
/* the tactical viewer are consistent. Will be replaced by the real    */
/* API in Master Plan Phase 1+.                                        */
/* ------------------------------------------------------------------ */

import {
  areaForPosition,
  type AnalysisJob,
  type Match,
  type Pattern,
  type Player,
  type PlayerTrack,
  type PositionSample,
  type Round,
  type RoundEvent,
  type Team,
  type TeamSide,
} from "./types";

export const TEAMS: Team[] = [
  { id: "fnatic", name: "FNATIC", region: "Europe", logoInitials: "FN" },
  { id: "g2", name: "G2 Esports", region: "Europe", logoInitials: "G2" },
  { id: "prx", name: "Paper Rex", region: "Pacific", logoInitials: "PRX" },
  { id: "sen", name: "Sentinels", region: "Americas", logoInitials: "SEN" },
];

export const PLAYERS: Player[] = [
  { id: "p1", name: "Leo", agent: "Jett", teamId: "fnatic", role: "Duelist" },
  { id: "p2", name: "Chronicle", agent: "Viper", teamId: "fnatic", role: "Controller" },
  { id: "p3", name: "Boaster", agent: "Astra", teamId: "fnatic", role: "Controller" },
  { id: "p4", name: "Derke", agent: "Raze", teamId: "fnatic", role: "Duelist" },
  { id: "p5", name: "Mistic", agent: "Sova", teamId: "fnatic", role: "Initiator" },
  { id: "p6", name: "NiKo", agent: "Jett", teamId: "g2", role: "Duelist" },
  { id: "p7", name: "Mixwell", agent: "Omen", teamId: "g2", role: "Controller" },
  { id: "p8", name: "hoody", agent: "Skye", teamId: "g2", role: "Initiator" },
  { id: "p9", name: "koldamenta", agent: "Viper", teamId: "g2", role: "Controller" },
  { id: "p10", name: "zeek", agent: "Chamber", teamId: "g2", role: "Sentinel" },
  { id: "p11", name: "f0rsakeN", agent: "Raze", teamId: "prx", role: "Duelist" },
  { id: "p12", name: "Jinggg", agent: "Jett", teamId: "prx", role: "Duelist" },
  { id: "p13", name: "mindfreak", agent: "Astra", teamId: "prx", role: "Controller" },
  { id: "p14", name: "d4v41", agent: "Sova", teamId: "prx", role: "Initiator" },
  { id: "p15", name: "something", agent: "Chamber", teamId: "prx", role: "Sentinel" },
  { id: "p16", name: "TenZ", agent: "Jett", teamId: "sen", role: "Duelist" },
  { id: "p17", name: "ShahZaM", agent: "Omen", teamId: "sen", role: "Controller" },
  { id: "p18", name: "Sick", agent: "Skye", teamId: "sen", role: "Initiator" },
  { id: "p19", name: "zombs", agent: "Viper", teamId: "sen", role: "Controller" },
  { id: "p20", name: "dapr", agent: "Chamber", teamId: "sen", role: "Sentinel" },
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAP_IDS = ["ascent", "haven", "bind", "split"];

const MATCH_SEEDS: Array<{
  id: string;
  teamA: string;
  teamB: string;
  map: string;
  type: "scrim" | "official";
  date: string;
  scoreA: number;
  scoreB: number;
  tournament?: string;
}> = [
  { id: "m1", teamA: "fnatic", teamB: "g2", map: "ascent", type: "scrim", date: "2026-09-11", scoreA: 13, scoreB: 8 },
  { id: "m2", teamA: "fnatic", teamB: "prx", map: "haven", type: "official", date: "2026-09-08", scoreA: 11, scoreB: 13, tournament: "VCT EMEA Kickoff" },
  { id: "m3", teamA: "g2", teamB: "sen", map: "bind", type: "scrim", date: "2026-09-05", scoreA: 13, scoreB: 6 },
  { id: "m4", teamA: "prx", teamB: "sen", map: "split", type: "scrim", date: "2026-09-02", scoreA: 13, scoreB: 10 },
  { id: "m5", teamA: "fnatic", teamB: "sen", map: "ascent", type: "official", date: "2026-08-28", scoreA: 13, scoreB: 11, tournament: "VCT EMEA Kickoff" },
  { id: "m6", teamA: "g2", teamB: "prx", map: "ascent", type: "scrim", date: "2026-08-25", scoreA: 9, scoreB: 13 },
  { id: "m7", teamA: "fnatic", teamB: "g2", map: "haven", type: "scrim", date: "2026-08-21", scoreA: 13, scoreB: 4 },
  { id: "m8", teamA: "prx", teamB: "g2", map: "bind", type: "official", date: "2026-08-17", scoreA: 13, scoreB: 9, tournament: "VCT Pacific Kickoff" },
];

export const MATCHES: Match[] = MATCH_SEEDS.map((s) => ({
  id: s.id,
  teamAId: s.teamA,
  teamBId: s.teamB,
  map: s.map,
  type: s.type,
  date: s.date,
  scoreA: s.scoreA,
  scoreB: s.scoreB,
  tournament: s.tournament,
}));

/* ------------------------------------------------------------------ */
/* Rounds                                                              */
/* ------------------------------------------------------------------ */

function seededArea(rand: () => number, mapId: string): { x: number; y: number; area: string } {
  const base = MAP_IDS.includes(mapId) ? mapId : "ascent";
  const spots = [
    { x: 0.18, y: 0.36 },
    { x: 0.32, y: 0.4 },
    { x: 0.5, y: 0.48 },
    { x: 0.68, y: 0.6 },
    { x: 0.36, y: 0.6 },
    { x: 0.56, y: 0.3 },
  ];
  const spot = spots[Math.floor(rand() * spots.length)];
  const x = Math.min(0.97, Math.max(0.03, spot.x + (rand() - 0.5) * 0.1));
  const y = Math.min(0.97, Math.max(0.03, spot.y + (rand() - 0.5) * 0.1));
  return { x, y, area: areaForPosition(base, x, y) };
}

function buildRound(
  match: Match,
  number: number,
  rand: () => number,
): Round {
  // First 12 rounds: team A attacks. Deterministic score-driven winner.
  const side = number <= 12 ? "attack" : "defense";
  const total = match.scoreA + match.scoreB;
  let won: boolean;
  if (number <= match.scoreA) won = true;
  else if (number <= match.scoreA + match.scoreB) won = false;
  else won = rand() > 0.5;
  void total;

  const teamAWon = won;
  const firstBloodFor: TeamSide = rand() > 0.42 ? "team_a" : "team_b";
  const planted = won || rand() > 0.35;
  const clutch = rand() > 0.86;
  const duration = 62 + Math.floor(rand() * 68);

  const events: RoundEvent[] = [];
  let evId = 0;
  const ev = (
    type: RoundEvent["type"],
    time: number,
    label: string,
    playerId?: string,
  ) => {
    const pos = seededArea(rand, match.map);
    events.push({
      id: `e_${evId++}`,
      type,
      time: Math.round(time),
      label,
      playerId,
      x: pos.x,
      y: pos.y,
      confidence: 0.78 + rand() * 0.2,
    });
  };

  const timings = {
    mid: 8 + rand() * 10,
    fb: 22 + rand() * 14,
    exec: 40 + rand() * 12,
    plant: planted ? 50 + rand() * 12 : 0,
    defuse: planted && !won ? 92 + rand() * 18 : 0,
  };

  ev("mid_control", timings.mid, "Mid control", "p1");
  ev("first_blood", timings.fb, "First blood — Leo", firstBloodFor === "team_a" ? "p1" : "p6");
  ev("kill", timings.fb + 6 + rand() * 8, "Trade kill", "p4");
  ev("execute", timings.exec, "A execute", "p1");
  if (planted) ev("plant", timings.plant, "Spike planted — A Site", "p4");
  ev("kill", timings.exec + 14 + rand() * 10, "Retake kill", "p7");
  if (planted && !won) ev("defuse", timings.defuse, "Spike defused", "p10");
  ev("rotation", Math.min(duration - 4, timings.exec + 24), "Rotation to B", "p5");

  return {
    id: `r${number}`,
    matchId: match.id,
    number,
    side,
    winnerSide: teamAWon ? "team_a" : "team_b",
    won,
    duration,
    firstBloodFor,
    planted,
    clutch,
    events: events.sort((a, b) => a.time - b.time),
  };
}

export function getRounds(matchId: string): Round[] {
  const match = MATCHES.find((m) => m.id === matchId);
  if (!match) return [];
  const rand = mulberry32(
    matchId.split("").reduce((a, c) => a + c.charCodeAt(0), 7),
  );
  const total = match.scoreA + match.scoreB;
  return Array.from({ length: total }, (_, i) => buildRound(match, i + 1, rand));
}

/* ------------------------------------------------------------------ */
/* Player tracks — 10 tracked agents over one round                    */
/* ------------------------------------------------------------------ */

const TEAM_A_LINEUP = ["p1", "p2", "p3", "p4", "p5"];
const TEAM_B_LINEUP = ["p6", "p7", "p8", "p9", "p10"];

const AGENT_BY_PLAYER: Record<string, string> = {
  p1: "Jett",
  p2: "Viper",
  p3: "Astra",
  p4: "Raze",
  p5: "Sova",
  p6: "Jett",
  p7: "Omen",
  p8: "Skye",
  p9: "Viper",
  p10: "Chamber",
};

/** Smooth, area-aware movement path for one player across a round. */
function buildTrack(
  playerId: string,
  side: TeamSide,
  rand: () => number,
  duration: number,
): PlayerTrack {
  // Attackers push from spawn toward a site; defenders hold then rotate.
  const waypoints: PositionSample[] =
    side === "team_a"
      ? [
          { t: 0, x: 0.14, y: 0.82 },
          { t: 0.18, x: 0.2, y: 0.66 },
          { t: 0.38, x: 0.24, y: 0.44 },
          { t: 0.55, x: 0.34, y: 0.38 },
          { t: 0.72, x: 0.42, y: 0.36 },
          { t: 0.88, x: 0.46, y: 0.4 },
          { t: 1, x: 0.5, y: 0.44 },
        ]
      : [
          { t: 0, x: 0.78, y: 0.24 },
          { t: 0.2, x: 0.72, y: 0.32 },
          { t: 0.4, x: 0.62, y: 0.4 },
          { t: 0.6, x: 0.56, y: 0.5 },
          { t: 0.78, x: 0.6, y: 0.58 },
          { t: 1, x: 0.66, y: 0.62 },
        ];
  const n = 26;
  const positions: PositionSample[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const seg = t * (waypoints.length - 1);
    const idx = Math.min(waypoints.length - 2, Math.floor(seg));
    const frac = seg - idx;
    const a = waypoints[idx];
    const b = waypoints[idx + 1];
    const x = a.x + (b.x - a.x) * frac + (rand() - 0.5) * 0.03;
    const y = a.y + (b.y - a.y) * frac + (rand() - 0.5) * 0.03;
    positions.push({
      t: Math.round(t * duration),
      x: Math.min(0.97, Math.max(0.03, x)),
      y: Math.min(0.97, Math.max(0.03, y)),
    });
  }
  return {
    playerId,
    teamSide: side,
    agent: AGENT_BY_PLAYER[playerId] ?? "Jett",
    positions,
  };
}

export function getTracks(matchId: string, roundNumber: number): PlayerTrack[] {
  void roundNumber;
  const match = MATCHES.find((m) => m.id === matchId);
  if (!match) return [];
  const rand = mulberry32(
    matchId.split("").reduce((a, c) => a + c.charCodeAt(0), 11) + roundNumber,
  );
  const rounds = getRounds(matchId);
  const round = rounds.find((r) => r.number === roundNumber);
  const duration = round ? round.duration : 100;
  return [
    ...TEAM_A_LINEUP.map((p) => buildTrack(p, "team_a", rand, duration)),
    ...TEAM_B_LINEUP.map((p) => buildTrack(p, "team_b", rand, duration)),
  ];
}

/* ------------------------------------------------------------------ */
/* Patterns (Master Plan §28)                                          */
/* ------------------------------------------------------------------ */

export const PATTERNS: Pattern[] = [
  {
    id: "pat1",
    name: "MID PRESSURE → A EXECUTE",
    steps: ["Mid control", "Enemy rotation", "A split", "A execute"],
    teamId: "fnatic",
    map: "ascent",
    side: "attack",
    frequency: 31,
    totalRounds: 84,
    confidence: 0.81,
    avgTiming: "00:47",
    matches: 27,
  },
  {
    id: "pat2",
    name: "A MAIN DEFAULT → MID ROTATION",
    steps: ["A main default", "Mid control", "Late rotation"],
    teamId: "fnatic",
    map: "ascent",
    side: "attack",
    frequency: 18,
    totalRounds: 84,
    confidence: 0.67,
    avgTiming: "00:52",
    matches: 22,
  },
  {
    id: "pat3",
    name: "FAST B EXECUTE",
    steps: ["B lobby stack", "B main entry", "Fast plant"],
    teamId: "g2",
    map: "ascent",
    side: "attack",
    frequency: 14,
    totalRounds: 61,
    confidence: 0.74,
    avgTiming: "00:35",
    matches: 19,
  },
  {
    id: "pat4",
    name: "RETAKE VIA MARKET",
    steps: ["Site lost", "Market rotate", "Retake attempt"],
    teamId: "fnatic",
    map: "ascent",
    side: "defense",
    frequency: 22,
    totalRounds: 96,
    confidence: 0.72,
    avgTiming: "01:10",
    matches: 25,
  },
];

/* ------------------------------------------------------------------ */
/* Analysis jobs (Master Plan §48)                                     */
/* ------------------------------------------------------------------ */

export const JOBS: AnalysisJob[] = [
  { id: "job1", matchId: "m1", status: "COMPLETED", progress: 100, framesProcessed: 184000, totalFrames: 184000, startedAt: "2026-09-11 14:02", durationSeconds: 1980, modelVersion: "model_v3" },
  { id: "job2", matchId: "m2", status: "COMPLETED", progress: 100, framesProcessed: 201500, totalFrames: 201500, startedAt: "2026-09-08 21:14", durationSeconds: 2410, modelVersion: "model_v3" },
  { id: "job3", matchId: "m3", status: "TRACKING_PLAYERS", progress: 62, framesProcessed: 96500, totalFrames: 155000, startedAt: "2026-09-12 09:40", durationSeconds: 640, modelVersion: "model_v4-rc" },
  { id: "job4", matchId: "m4", status: "COMPLETED", progress: 100, framesProcessed: 178200, totalFrames: 178200, startedAt: "2026-09-02 18:30", durationSeconds: 2015, modelVersion: "model_v3" },
  { id: "job5", matchId: "m6", status: "FAILED", progress: 38, framesProcessed: 52000, totalFrames: 136000, startedAt: "2026-08-25 13:55", durationSeconds: 420, modelVersion: "model_v3", error: "Minimap detection confidence below threshold (0.61 < 0.75). VOD resolution too low." },
];

/* ------------------------------------------------------------------ */
/* Heatmap sample points                                               */
/* ------------------------------------------------------------------ */

export interface HeatPoint {
  x: number;
  y: number;
  weight: number;
}

export function getHeatPoints(
  mapId: string,
  side: "attack" | "defense" | "all",
  kind: "presence" | "kills" | "deaths",
): HeatPoint[] {
  void kind;
  const seed = mapId.length * 131 + side.length * 17;
  const rand = mulberry32(seed);
  const clusters =
    side === "attack"
      ? [
          { x: 0.22, y: 0.4, w: 3 },
          { x: 0.34, y: 0.38, w: 2.4 },
          { x: 0.48, y: 0.34, w: 1.6 },
          { x: 0.14, y: 0.62, w: 1.2 },
        ]
      : side === "defense"
        ? [
            { x: 0.68, y: 0.3, w: 2.6 },
            { x: 0.6, y: 0.6, w: 2.2 },
            { x: 0.36, y: 0.52, w: 1.8 },
            { x: 0.82, y: 0.44, w: 1.4 },
          ]
        : [
            { x: 0.3, y: 0.4, w: 2.2 },
            { x: 0.56, y: 0.48, w: 2 },
            { x: 0.74, y: 0.36, w: 1.6 },
            { x: 0.2, y: 0.66, w: 1.2 },
          ];
  const points: HeatPoint[] = [];
  for (const c of clusters) {
    const n = 40 + Math.floor(rand() * 20);
    for (let i = 0; i < n; i++) {
      const x = Math.min(0.97, Math.max(0.03, c.x + (rand() - 0.5) * 0.22));
      const y = Math.min(0.97, Math.max(0.03, c.y + (rand() - 0.5) * 0.22));
      points.push({ x, y, weight: c.w * (0.6 + rand() * 0.8) });
    }
  }
  return points;
}

/* ------------------------------------------------------------------ */
/* Lookup helpers                                                      */
/* ------------------------------------------------------------------ */

export function getTeam(id: string): Team | undefined {
  return TEAMS.find((t) => t.id === id);
}

export function getPlayer(id: string): Player | undefined {
  return PLAYERS.find((p) => p.id === id);
}

export function getMatch(id: string): Match | undefined {
  return MATCHES.find((m) => m.id === id);
}

export function getJobForMatch(matchId: string): AnalysisJob | undefined {
  return JOBS.find((j) => j.matchId === matchId);
}

export function getPatternsForTeam(teamId: string): Pattern[] {
  return PATTERNS.filter((p) => p.teamId === teamId);
}

export function getTeamStats(teamId: string) {
  const teamMatches = MATCHES.filter(
    (m) => m.teamAId === teamId || m.teamBId === teamId,
  );
  const roundsAnalyzed = teamMatches.reduce(
    (acc, m) => acc + m.scoreA + m.scoreB,
    0,
  );
  const maps = new Set(teamMatches.map((m) => m.map));
  return {
    matches: teamMatches.length,
    maps: maps.size,
    rounds: roundsAnalyzed,
  };
}
