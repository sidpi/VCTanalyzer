/* ------------------------------------------------------------------ */
/* Client-side analytics over the live API (Master Plan §18).          */
/*                                                                     */
/* Loads the organization's rounds/events/positions once, caches the   */
/* promise module-level, and derives heatmaps + movement statistics.   */
/* Heavy aggregation intentionally lives client-side for the MVP; when */
/* datasets grow this moves behind server endpoints (§47 performance). */
/* ------------------------------------------------------------------ */

"use client";

import {
  apiListMatches,
  apiListRoundPositions,
  apiListRounds,
  apiListTeams,
  type ApiEvent,
  type ApiMatch,
  type ApiPosition,
  type ApiRound,
  type ApiTeam,
} from "./api";
import { areaForPosition, type TeamSide } from "./types";

/* ---------------------------- patterns API ------------------------- */

export interface ApiPattern {
  id: string;
  name: string;
  steps: string[];
  teamId: string | null;
  map: string;
  side: "attack" | "defense";
  frequency: number;
  totalRounds: number;
  confidence: number;
  avgTiming: string;
  matches: number;
}

export function apiGetPatterns() {
  return import("./api").then(({ API_BASE, getToken }) =>
    fetch(`${API_BASE}/analytics/patterns`, {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }).then(async (res) => {
      if (!res.ok) throw new Error(`Patterns request failed (${res.status})`);
      return (await res.json()) as ApiPattern[];
    }),
  );
}

/* ---------------------------- dataset loader ----------------------- */

export interface PositionRow {
  matchId: string;
  map: string;
  roundNumber: number;
  side: "attack" | "defense";
  winnerSide: TeamSide;
  playerId: string;
  teamSide: TeamSide;
  t: number;
  x: number;
  y: number;
}

export interface EventRow {
  matchId: string;
  map: string;
  roundNumber: number;
  side: "attack" | "defense";
  winnerSide: TeamSide;
  event: ApiEvent;
}

export interface OrgDataset {
  teams: Map<string, ApiTeam>;
  matches: ApiMatch[];
  roundsByMatch: Map<string, ApiRound[]>;
  positions: PositionRow[];
  events: EventRow[];
  roundsTotal: number;
}

let datasetPromise: Promise<OrgDataset> | null = null;

/** Load (and memoize) the whole org dataset. `onProgress` reports 0-100. */
export function loadOrgDataset(
  onProgress?: (pct: number) => void,
): Promise<OrgDataset> {
  if (datasetPromise) return datasetPromise;

  datasetPromise = (async () => {
    const report = (p: number) => onProgress?.(Math.round(p));
    const [matches, teams] = await Promise.all([
      apiListMatches(),
      apiListTeams(),
    ]);
    report(10);
    if (matches.length === 0) {
      return {
        teams: new Map(teams.map((t) => [t.id, t])),
        matches,
        roundsByMatch: new Map(),
        positions: [],
        events: [],
        roundsTotal: 0,
      };
    }

    const roundsByMatch = new Map<string, ApiRound[]>();
    const roundsAll: ApiRound[] = [];
    for (let i = 0; i < matches.length; i++) {
      const rounds = await apiListRounds(matches[i].id);
      roundsByMatch.set(matches[i].id, rounds);
      roundsAll.push(...rounds);
      report(10 + (40 * (i + 1)) / matches.length);
    }

    const positions: PositionRow[] = [];
    const events: EventRow[] = [];
    const metaByRound = new Map(
      roundsAll.map((r) => {
        const m = matches.find((x) => x.id === r.match_id)!;
        return [
          r.id,
          {
            matchId: r.match_id,
            map: m.map,
            roundNumber: r.number,
            side: r.side,
            winnerSide: r.winner_side,
          },
        ] as const;
      }),
    );

    // Positions per round, batched to keep the network queue sane.
    const BATCH = 6;
    for (let i = 0; i < roundsAll.length; i += BATCH) {
      const slice = roundsAll.slice(i, i + BATCH);
      const results = await Promise.all(
        slice.map((r) => apiListRoundPositions(r.id)),
      );
      results.forEach((pos, idx) => {
        const meta = metaByRound.get(slice[idx].id)!;
        for (const p of pos) {
          positions.push({
            matchId: meta.matchId,
            map: meta.map,
            roundNumber: meta.roundNumber,
            side: meta.side,
            winnerSide: meta.winnerSide,
            playerId: p.player_id,
            teamSide: p.team_side,
            t: p.t_seconds,
            x: p.x,
            y: p.y,
          });
        }
      });
      report(50 + (45 * (i + slice.length)) / roundsAll.length);
    }

    for (const r of roundsAll) {
      const meta = metaByRound.get(r.id)!;
      for (const e of r.events) {
        events.push({ ...meta, event: e });
      }
    }
    report(100);

    return {
      teams: new Map(teams.map((t) => [t.id, t])),
      matches,
      roundsByMatch,
      positions,
      events,
      roundsTotal: roundsAll.length,
    };
  })();

  return datasetPromise;
}

/** Force a reload on the next load (after a new analysis completes). */
export function clearOrgDatasetCache() {
  datasetPromise = null;
}

/* ---------------------------- heatmap builder ---------------------- */

export interface HeatPoint {
  x: number;
  y: number;
  weight: number;
}

export type HeatKind = "presence" | "kills" | "deaths" | "first_contact";

/**
 * Build normalized heat points. Presence uses tracked positions; kill /
 * death / first-contact use real event coordinates, falling back to the
 * nearest tracked position when the event lacks coordinates.
 */
export function buildHeatPoints(
  data: OrgDataset,
  opts: {
    mapId: string;
    side: "attack" | "defense" | "all";
    teamSide?: TeamSide | "all";
    kind: HeatKind;
  },
): HeatPoint[] {
  const sideOk = (s: "attack" | "defense") =>
    opts.side === "all" || s === opts.side;

  if (opts.kind === "presence") {
    const teamFilter = opts.teamSide ?? "all";
    return data.positions
      .filter(
        (p) =>
          p.map === opts.mapId &&
          sideOk(p.side) &&
          (teamFilter === "all" || p.teamSide === teamFilter),
      )
      .map((p) => ({ x: p.x, y: p.y, weight: 1 }));
  }

  const killTypes = new Set(["kill", "first_blood"]);
  const points: HeatPoint[] = [];
  // Index positions per (match, round) for the coordinate fallback.
  const posIndex = new Map<string, PositionRow[]>();
  for (const p of data.positions) {
    if (p.map !== opts.mapId) continue;
    const key = `${p.matchId}:${p.roundNumber}`;
    (posIndex.get(key) ?? posIndex.set(key, []).get(key)!).push(p);
  }

  for (const row of data.events) {
    if (row.map !== opts.mapId || !sideOk(row.side)) continue;
    const isKill = killTypes.has(row.event.type);
    if (!isKill) continue;

    // Kills belong to the attacker's side; deaths to the victims'.
    const relevantSide: TeamSide =
      opts.kind === "deaths"
        ? row.side === "attack"
          ? "team_b"
          : "team_a"
        : row.side === "attack"
          ? "team_a"
          : "team_b";
    if (opts.teamSide && opts.teamSide !== "all" && relevantSide !== opts.teamSide) {
      continue;
    }
    if (opts.kind === "first_contact" && row.event.type !== "first_blood") {
      continue;
    }

    const e = row.event;
    const weight = e.type === "first_blood" ? 1.6 : 1;
    if (e.x != null && e.y != null) {
      points.push({ x: e.x, y: e.y, weight });
    } else {
      const near = posIndex.get(`${row.matchId}:${row.roundNumber}`)?.[0];
      if (near) points.push({ x: near.x, y: near.y, weight });
    }
  }
  return points;
}

/* ---------------------------- movement stats ----------------------- */

export interface MovementStats {
  areaTime: { area: string; pct: number }[];
  entryRoutes: { route: string; share: number }[];
  avgFirstContact: string | null;
  roundsConsidered: number;
}

/**
 * Movement statistics for one side of one map (Master Plan §19).
 * Area time = share of tracked samples; entry route = first area before
 * the first blood event; first contact = mean time of first bloods.
 * Pass `playerId` to scope everything to a single player (Master Plan §27).
 */
export function buildMovementStats(
  data: OrgDataset,
  opts: {
    mapId: string;
    side: "attack" | "defense";
    teamSide: TeamSide;
    playerId?: string;
  },
): MovementStats {
  const rows = data.positions.filter(
    (p) =>
      p.map === opts.mapId &&
      p.side === opts.side &&
      p.teamSide === opts.teamSide &&
      (opts.playerId === undefined || p.playerId === opts.playerId),
  );
  const roundsConsidered = new Set(rows.map((r) => `${r.matchId}:${r.roundNumber}`))
    .size;

  // Area time
  const areaCounts = new Map<string, number>();
  for (const p of rows) {
    const area = areaForPosition(opts.mapId, p.x, p.y);
    areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
  }
  const totalSamples = rows.length || 1;
  const areaTime = [...areaCounts.entries()]
    .filter(([area]) => area !== "Unknown")
    .map(([area, n]) => ({ area, pct: (n / totalSamples) * 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  // Entry routes: area at t<=8s → area at first blood (same player).
  const routeCounts = new Map<string, number>();
  let routeRounds = 0;
  const fbByRound = new Map<string, number>();
  for (const row of data.events) {
    if (
      row.map === opts.mapId &&
      row.side === opts.side &&
      row.event.type === "first_blood" &&
      // With a player filter, only their own first bloods define contact.
      (opts.playerId === undefined || row.event.player_id === opts.playerId)
    ) {
      fbByRound.set(`${row.matchId}:${row.roundNumber}`, row.event.t_seconds);
    }
  }
  const byRoundPlayer = new Map<string, PositionRow[]>();
  for (const p of rows) {
    const key = `${p.matchId}:${p.roundNumber}:${p.playerId}`;
    (byRoundPlayer.get(key) ?? byRoundPlayer.set(key, []).get(key)!).push(p);
  }
  for (const [key, samples] of byRoundPlayer) {
    const rk = key.split(":").slice(0, 2).join(":");
    const fbT = fbByRound.get(rk);
    if (fbT == null) continue;
    const sorted = [...samples].sort((a, b) => a.t - b.t);
    const start = sorted.find((s) => s.t <= 8) ?? sorted[0];
    const atContact = [...sorted].reverse().find((s) => s.t <= fbT);
    if (!start || !atContact) continue;
    const a0 = areaForPosition(opts.mapId, start.x, start.y);
    const a1 = areaForPosition(opts.mapId, atContact.x, atContact.y);
    if (a0 === "Unknown" || a1 === "Unknown" || a0 === a1) continue;
    routeCounts.set(`${a0} → ${a1}`, (routeCounts.get(`${a0} → ${a1}`) ?? 0) + 1);
    routeRounds += 1;
  }
  const entryRoutes = [...routeCounts.entries()]
    .map(([route, n]) => ({ route, share: (n / Math.max(1, routeRounds)) * 100 }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 5);

  // First contact timing
  const fbTimes = [...fbByRound.values()];
  const avgFirstContact =
    fbTimes.length > 0 ? fmtMS(fbTimes.reduce((a, b) => a + b, 0) / fbTimes.length) : null;

  return { areaTime, entryRoutes, avgFirstContact, roundsConsidered };
}

/* ---------------------------- player aggregation ------------------- */

export interface PlayerSummary {
  roundsTracked: number;
  presenceSamples: number;
  mapsPlayed: string[];
  firstBloods: number;
  firstBloodRate: number; // share of tracked rounds with this player's FB
  avgFirstBloodTime: string | null;
  teamSide: TeamSide | null;
  teamName: string | null;
  agent: string | null;
}

function fmtMS(total: number) {
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Player-level aggregates over the org dataset (Master Plan §27). Honest
 * MVP metrics only: everything is derived from tracked positions and
 * events attributed to this player — nothing invented.
 */
export function buildPlayerSummary(
  data: OrgDataset,
  playerId: string,
): PlayerSummary {
  const rows = data.positions.filter((p) => p.playerId === playerId);
  const roundKeys = new Set(rows.map((r) => `${r.matchId}:${r.roundNumber}`));
  const maps = [...new Set(rows.map((r) => r.map))];

  const teamSideCounts = new Map<TeamSide, number>();
  for (const r of rows) {
    teamSideCounts.set(r.teamSide, (teamSideCounts.get(r.teamSide) ?? 0) + 1);
  }
  const teamSide =
    teamSideCounts.size > 0
      ? [...teamSideCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

  const fbTimes: number[] = [];
  let fbRounds = 0;
  for (const row of data.events) {
    if (row.event.type === "first_blood" && row.event.player_id === playerId) {
      fbTimes.push(row.event.t_seconds);
      fbRounds += 1;
    }
  }

  // Team + agent identity from rosters seen in matches involving this player.
  let teamName: string | null = null;
  let agent: string | null = null;
  const teamIds = new Set<string>();
  for (const m of data.matches) {
    if (roundKeys.size === 0) break;
    const key = `${m.id}:`;
    const involved = [...roundKeys].some((k) => k.startsWith(key));
    if (!involved) continue;
    teamIds.add(m.team_a_id);
    teamIds.add(m.team_b_id);
  }
  if (teamIds.size > 0 && teamSide) {
    // The team on the player's side in the most recent analyzed match.
    for (const m of [...data.matches].reverse()) {
      const candidate = teamSide === "team_a" ? m.team_a_id : m.team_b_id;
      if (teamIds.has(candidate)) {
        teamName = data.teams.get(candidate)?.name ?? null;
        break;
      }
    }
  }
  agent = playerId.slice(0, 6);

  return {
    roundsTracked: roundKeys.size,
    presenceSamples: rows.length,
    mapsPlayed: maps,
    firstBloods: fbRounds,
    firstBloodRate:
      roundKeys.size > 0 ? fbRounds / roundKeys.size : 0,
    avgFirstBloodTime:
      fbTimes.length > 0
        ? fmtMS(fbTimes.reduce((a, b) => a + b, 0) / fbTimes.length)
        : null,
    teamSide,
    teamName,
    agent,
  };
}

/* ---------------------------- team aggregation --------------------- */

export interface TeamPerformance {
  teamId: string;
  name: string;
  matches: number;
  maps: number;
  rounds: number;
  wins: number;
  winRate: number;
}

/** Per-team aggregates across the org's analyzed matches. */
export function buildTeamPerformance(data: OrgDataset): TeamPerformance[] {
  const acc = new Map<string, TeamPerformance>();
  for (const t of data.teams.values()) {
    acc.set(t.id, {
      teamId: t.id,
      name: t.name,
      matches: 0,
      maps: 0,
      rounds: 0,
      wins: 0,
      winRate: 0,
    });
  }
  for (const m of data.matches) {
    const analyzed = m.score_a > 0 || m.score_b > 0;
    if (!analyzed) continue;
    const a = acc.get(m.team_a_id);
    const b = acc.get(m.team_b_id);
    const rounds = data.roundsByMatch.get(m.id) ?? [];
    if (a) {
      a.matches += 1;
      a.rounds += rounds.length;
      a.wins += m.score_a > m.score_b ? 1 : 0;
    }
    if (b) {
      b.matches += 1;
      b.rounds += rounds.length;
      b.wins += m.score_b > m.score_a ? 1 : 0;
    }
  }
  const out = [...acc.values()];
  for (const t of out) {
    const mapSet = new Set(
      data.matches
        .filter(
          (m) =>
            (m.team_a_id === t.teamId || m.team_b_id === t.teamId) &&
            (m.score_a > 0 || m.score_b > 0),
        )
        .map((m) => m.map),
    );
    t.maps = mapSet.size;
    t.winRate = t.matches > 0 ? t.wins / t.matches : 0;
  }
  return out
    .filter((t) => t.matches > 0)
    .sort((a, b) => b.matches - a.matches);
}
