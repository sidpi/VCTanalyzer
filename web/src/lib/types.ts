/* ------------------------------------------------------------------ */
/* VCTanalyzer core data model (Master Plan §14, Website Plan §44)     */
/* ------------------------------------------------------------------ */

export type Side = "attack" | "defense";
export type TeamSide = "team_a" | "team_b";

export interface Team {
  id: string;
  name: string;
  region: string;
  logoInitials: string;
}

export interface Player {
  id: string;
  name: string;
  agent: string;
  teamId: string;
  role: string;
}

export type MatchType = "scrim" | "official";

export interface Match {
  id: string;
  teamAId: string;
  teamBId: string;
  map: string;
  type: MatchType;
  date: string;
  scoreA: number;
  scoreB: number;
  tournament?: string;
  vodName?: string;
  notes?: string;
}

export interface Round {
  id: string;
  matchId: string;
  number: number;
  side: Side;
  winnerSide: TeamSide;
  won: boolean; // did team A win
  duration: number; // seconds
  firstBloodFor: TeamSide | null;
  planted: boolean;
  clutch: boolean;
  events: RoundEvent[];
}

export type RoundEventType =
  | "kill"
  | "first_blood"
  | "death"
  | "plant"
  | "defuse"
  | "mid_control"
  | "execute"
  | "retake"
  | "rotation";

export interface RoundEvent {
  id: string;
  type: RoundEventType;
  time: number; // seconds within round
  label: string;
  playerId?: string;
  x?: number;
  y?: number;
  confidence: number; // 0-1 — Master Plan §31
}

export interface PositionSample {
  t: number; // seconds
  x: number;
  y: number;
}

export interface PlayerTrack {
  playerId: string;
  teamSide: TeamSide;
  agent: string;
  positions: PositionSample[];
}

export interface Pattern {
  id: string;
  name: string;
  steps: string[];
  teamId: string;
  map: string;
  side: Side;
  frequency: number;
  totalRounds: number;
  confidence: number;
  avgTiming: string;
  matches: number;
}

/* ------------------------------------------------------------------ */
/* Maps (Master Plan §10-11) — normalized 0-1 coordinate space with    */
/* named areas so coordinates translate into meaningful callouts.      */
/* ------------------------------------------------------------------ */

export interface MapArea {
  name: string;
  // bounding box in normalized map coordinates
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GameMap {
  id: string;
  name: string;
  areas: MapArea[];
}

export const MAPS: GameMap[] = [
  {
    id: "ascent",
    name: "Ascent",
    areas: [
      { name: "A Lobby", x0: 0.04, y0: 0.06, x1: 0.3, y1: 0.26 },
      { name: "A Main", x0: 0.08, y0: 0.28, x1: 0.3, y1: 0.46 },
      { name: "A Site", x0: 0.26, y0: 0.3, x1: 0.48, y1: 0.52 },
      { name: "Mid", x0: 0.4, y0: 0.36, x1: 0.62, y1: 0.64 },
      { name: "Market", x0: 0.44, y0: 0.2, x1: 0.6, y1: 0.34 },
      { name: "B Main", x0: 0.62, y0: 0.56, x1: 0.86, y1: 0.74 },
      { name: "B Site", x0: 0.56, y0: 0.52, x1: 0.8, y1: 0.72 },
      { name: "B Lobby", x0: 0.7, y0: 0.76, x1: 0.94, y1: 0.94 },
      { name: "Mid Bottom", x0: 0.42, y0: 0.66, x1: 0.62, y1: 0.86 },
    ],
  },
  {
    id: "haven",
    name: "Haven",
    areas: [
      { name: "A Lobby", x0: 0.04, y0: 0.06, x1: 0.26, y1: 0.28 },
      { name: "A Long", x0: 0.08, y0: 0.3, x1: 0.3, y1: 0.44 },
      { name: "A Site", x0: 0.24, y0: 0.28, x1: 0.44, y1: 0.5 },
      { name: "Mid", x0: 0.38, y0: 0.34, x1: 0.6, y1: 0.6 },
      { name: "Garage", x0: 0.46, y0: 0.2, x1: 0.62, y1: 0.32 },
      { name: "B Site", x0: 0.5, y0: 0.42, x1: 0.68, y1: 0.62 },
      { name: "C Long", x0: 0.68, y0: 0.56, x1: 0.9, y1: 0.7 },
      { name: "C Site", x0: 0.58, y0: 0.54, x1: 0.8, y1: 0.76 },
      { name: "C Lobby", x0: 0.74, y0: 0.78, x1: 0.94, y1: 0.94 },
    ],
  },
  {
    id: "bind",
    name: "Bind",
    areas: [
      { name: "A Lobby", x0: 0.04, y0: 0.06, x1: 0.28, y1: 0.26 },
      { name: "Showers", x0: 0.1, y0: 0.28, x1: 0.3, y1: 0.44 },
      { name: "A Site", x0: 0.26, y0: 0.3, x1: 0.46, y1: 0.5 },
      { name: "Mid", x0: 0.4, y0: 0.36, x1: 0.58, y1: 0.6 },
      { name: "B Site", x0: 0.54, y0: 0.5, x1: 0.76, y1: 0.7 },
      { name: "B Long", x0: 0.66, y0: 0.6, x1: 0.88, y1: 0.76 },
      { name: "B Lobby", x0: 0.72, y0: 0.78, x1: 0.94, y1: 0.94 },
    ],
  },
  {
    id: "split",
    name: "Split",
    areas: [
      { name: "A Lobby", x0: 0.04, y0: 0.06, x1: 0.26, y1: 0.26 },
      { name: "A Main", x0: 0.08, y0: 0.28, x1: 0.28, y1: 0.46 },
      { name: "A Site", x0: 0.24, y0: 0.3, x1: 0.44, y1: 0.5 },
      { name: "Mid", x0: 0.4, y0: 0.34, x1: 0.6, y1: 0.62 },
      { name: "B Main", x0: 0.62, y0: 0.56, x1: 0.84, y1: 0.74 },
      { name: "B Site", x0: 0.56, y0: 0.52, x1: 0.78, y1: 0.72 },
      { name: "B Lobby", x0: 0.7, y0: 0.78, x1: 0.92, y1: 0.94 },
    ],
  },
];

export function getMap(id: string): GameMap | undefined {
  return MAPS.find((m) => m.id === id);
}

/** Translate normalized coordinates into a named area (Master Plan §11). */
export function areaForPosition(mapId: string, x: number, y: number): string {
  const map = getMap(mapId);
  if (!map) return "Unknown";
  const hit = map.areas.find(
    (a) => x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1,
  );
  return hit ? hit.name : "Unknown";
}

/* ------------------------------------------------------------------ */
/* Analysis job states (Master Plan §48)                               */
/* ------------------------------------------------------------------ */

export type JobStatus =
  | "UPLOADING"
  | "QUEUED"
  | "PREPROCESSING"
  | "DETECTING_ROUNDS"
  | "TRACKING_PLAYERS"
  | "DETECTING_EVENTS"
  | "GENERATING_ANALYTICS"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export const JOB_STAGE_ORDER: JobStatus[] = [
  "UPLOADING",
  "QUEUED",
  "PREPROCESSING",
  "DETECTING_ROUNDS",
  "TRACKING_PLAYERS",
  "DETECTING_EVENTS",
  "GENERATING_ANALYTICS",
  "COMPLETED",
];

export const JOB_STAGE_LABELS: Record<JobStatus, string> = {
  UPLOADING: "Uploading VOD",
  QUEUED: "Queued",
  PREPROCESSING: "Video processing",
  DETECTING_ROUNDS: "Round detection",
  TRACKING_PLAYERS: "Player tracking",
  DETECTING_EVENTS: "Event detection",
  GENERATING_ANALYTICS: "Tactical analysis",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export interface AnalysisJob {
  id: string;
  matchId: string;
  status: JobStatus;
  progress: number; // 0-100
  framesProcessed: number;
  totalFrames: number;
  startedAt: string;
  durationSeconds: number;
  modelVersion: string;
  error?: string;
}
