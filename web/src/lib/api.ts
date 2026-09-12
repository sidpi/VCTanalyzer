/* ------------------------------------------------------------------ */
/* Typed API client for the VCTanalyzer backend (FastAPI).             */
/*                                                                     */
/* - JWT bearer auth stored in localStorage (MVP; httpOnly cookie      */
/*   later — Master Plan §49).                                         */
/* - Uploads go through XHR so the UI gets real progress events.       */
/* - Mappers convert API payloads into the frontend data model from    */
/*   lib/types.ts so existing components stay unchanged.               */
/* ------------------------------------------------------------------ */

"use client";

import { useEffect, useState } from "react";
import {
  type Match,
  type PlayerTrack,
  type PositionSample,
  type Round,
  type RoundEvent,
  type TeamSide,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

/* ---------------------------- token storage ------------------------ */

const TOKEN_KEY = "vct_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

/* ---------------------------- fetch helper ------------------------- */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the VCTanalyzer API. Is it running?");
  }

  if (res.status === 401) {
    setToken(null);
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

/* ---------------------------- auth --------------------------------- */

export interface AuthResponse {
  access_token: string;
  user_id: string;
  organization_id: string | null;
}

export async function apiLogin(email: string, password: string) {
  const res = await request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(res.access_token);
  return res;
}

export async function apiRegister(
  email: string,
  password: string,
  displayName: string,
  organizationName?: string,
) {
  const res = await request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      display_name: displayName,
      organization_name: organizationName ?? null,
    }),
  });
  setToken(res.access_token);
  return res;
}

export function apiLogout() {
  setToken(null);
}

/** Redirects to /login when unauthenticated after mount (client pages). */
export function useRequireAuth(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getToken()) window.location.href = "/login";
    else setReady(true);
  }, []);
  return ready;
}

/* ---------------------------- raw API types ------------------------ */

export interface ApiTeam {
  id: string;
  name: string;
  region: string;
  vlr_team_id: string | null;
  organization_id: string | null;
}

export interface ApiVod {
  id: string;
  match_id: string;
  source: "upload" | "twitch" | "youtube";
  source_url: string | null;
  source_channel: string | null;
  filename: string;
  size_bytes: number;
  content_type: string;
  duration_seconds: number | null;
}

export interface ApiMatch {
  id: string;
  team_a_id: string;
  team_b_id: string;
  map: string;
  type: string;
  played_at: string;
  score_a: number;
  score_b: number;
  notes: string;
  vlr_match_id: string | null;
  analysis_version: string;
  model_version: string;
  vod: ApiVod | null;
}

export interface ApiEvent {
  id: string;
  round_id: string;
  type: string;
  t_seconds: number;
  label: string;
  player_id: string | null;
  x: number | null;
  y: number | null;
  confidence: number;
}

export interface ApiRound {
  id: string;
  match_id: string;
  number: number;
  side: "attack" | "defense";
  winner_side: TeamSide;
  duration_seconds: number;
  vod_start_seconds: number | null;
  events: ApiEvent[];
}

export interface ApiJob {
  id: string;
  match_id: string;
  organization_id: string | null;
  vod_id: string | null;
  status: string;
  progress: number;
  frames_processed: number;
  total_frames: number;
  error: string | null;
  model_version: string;
}

export interface ApiPosition {
  player_id: string;
  team_side: TeamSide;
  t_seconds: number;
  x: number;
  y: number;
  confidence: number;
}

/* ---------------------------- endpoints ---------------------------- */

export function apiListTeams() {
  return request<ApiTeam[]>("/teams");
}

export function apiGetTeam(teamId: string) {
  return request<ApiTeam>(`/teams/${teamId}`);
}

export function apiCreateTeam(payload: { name: string; region: string }) {
  return request<ApiTeam>("/teams", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Import a team + full roster (real names, country, region) from vlr.gg. */
export function apiImportVlrTeam(vlrTeamId: string, name?: string) {
  return request<ApiTeam>("/teams/import-vlr", {
    method: "POST",
    body: JSON.stringify({ vlr_team_id: vlrTeamId, name: name ?? null }),
  });
}

export interface ApiVlrRankingRegion {
  region: string;
  teams: {
    name: string;
    id: number;
    logo: string;
    rank: number;
    points: number;
    country: string;
  }[];
}

export function apiVlrRankings() {
  return request<ApiVlrRankingRegion[]>("/ingest/vlr/rankings");
}

export interface ApiVlrTeamProfile {
  name: string;
  tag: string;
  country: string;
  region: string;
  rank: number;
  roster: {
    id: string;
    name: string | null;
    alias: string;
    role: string | null;
    img: string;
  }[];
}

/** Preview a VLR team profile before importing (via the VLR proxy). */
export function apiVlrTeamDetail(teamId: string) {
  return request<ApiVlrTeamProfile>(`/ingest/vlr/team/${teamId}`);
}

export interface ApiPlayer {
  id: string;
  name: string;
  real_name: string;
  country: string;
  agent: string;
  role: string;
  vlr_player_id: string | null;
}

export function apiListTeamPlayers(teamId: string) {
  return request<ApiPlayer[]>(`/teams/${teamId}/players`);
}

export function apiAddTeamPlayer(
  teamId: string,
  payload: { name: string; real_name?: string; country?: string; agent?: string; role?: string },
) {
  return request<ApiPlayer>(`/teams/${teamId}/players`, {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      real_name: payload.real_name ?? "",
      country: payload.country ?? "",
      agent: payload.agent ?? "",
      role: payload.role ?? "",
    }),
  });
}

/** Remove a player from the roster — the API returns 204 No Content. */
export async function apiRemoveTeamPlayer(teamId: string, playerId: string) {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}/teams/${teamId}/players/${playerId}`, {
    method: "DELETE",
    headers,
  });
  if (res.status === 401) {
    setToken(null);
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  if (!res.ok && res.status !== 204) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
}

export function apiGetMatch(matchId: string) {
  return request<ApiMatch>(`/matches/${matchId}`);
}

export function apiListMatches() {
  return request<ApiMatch[]>("/matches");
}

export function apiListRounds(matchId: string) {
  return request<ApiRound[]>(`/matches/${matchId}/rounds`);
}

export function apiListRoundPositions(roundId: string) {
  return request<ApiPosition[]>(`/rounds/${roundId}/positions`);
}

export function apiGetJob(jobId: string) {
  return request<ApiJob>(`/analysis/jobs/${jobId}`);
}

export function apiListMatchJobs(matchId: string) {
  return request<ApiJob[]>(`/matches/${matchId}/jobs`);
}

export function apiCancelJob(jobId: string) {
  return request<ApiJob>(`/analysis/jobs/${jobId}/cancel`, { method: "POST" });
}

export function apiRetryJob(jobId: string) {
  return request<ApiJob>(`/analysis/jobs/${jobId}/retry`, { method: "POST" });
}

export function apiCreateMatch(payload: {
  team_a_id: string;
  team_b_id: string;
  map: string;
  type: string;
  played_at: string;
  notes: string;
  vlr_match_id?: string | null;
}) {
  return request<ApiMatch>("/matches", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* ------------------------- external ingest (Twitch / VLR) ------------------ */

export interface ApiTwitchInfo {
  vod_id: string;
  provider: "video" | "clip";
  embed_url: string;
  title: string | null;
  channel: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  created_at: string | null;
  warnings: string[];
}

export function apiResolveTwitch(url: string) {
  return request<ApiTwitchInfo>("/ingest/twitch/resolve", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

/** Attach a Twitch VOD to a match and enqueue analysis. */
export function apiImportTwitch(matchId: string, url: string) {
  return request<ApiJob>("/ingest/twitch/import", {
    method: "POST",
    body: JSON.stringify({ match_id: matchId, url }),
  });
}

export interface ApiYoutubeInfo {
  vod_id: string;
  provider: "youtube";
  embed_url: string;
  title: string | null;
  channel: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  warnings: string[];
}

export function apiResolveYoutube(url: string) {
  return request<ApiYoutubeInfo>("/ingest/youtube/resolve", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

/** Attach a YouTube VOD to a match and enqueue analysis. */
export function apiImportYoutube(matchId: string, url: string) {
  return request<ApiJob>("/ingest/youtube/import", {
    method: "POST",
    body: JSON.stringify({ match_id: matchId, url }),
  });
}

export interface ApiVlrSearchResult {
  id: string;
  name: string;
  img: string;
  category: string;
  description: string | null;
}

export function apiVlrSearch(q: string) {
  return request<{ data: ApiVlrSearchResult[] }>(
    `/ingest/vlr/search?q=${encodeURIComponent(q)}`,
  );
}

export interface ApiVlrMatch {
  id: string;
  team1: { name: string; id?: string | null; score?: number | null };
  team2: { name: string; id?: string | null; score?: number | null };
  status: string;
  time: string;
  event: string;
  series: string;
}

export function apiVlrMatches(status?: "upcoming" | "completed" | "live") {
  const suffix = status ? `?status=${status}` : "";
  return request<{ data: ApiVlrMatch[] }>(`/ingest/vlr/matches${suffix}`);
}

export function apiVlrMatchDetail(matchId: string) {
  return request<Record<string, unknown>>(`/ingest/vlr/matches/${matchId}`);
}

/** Create/update a match from a VLR match — teams, map, date auto-filled. */
export function apiVlrAutofill(payload: {
  vlr_match_id: string;
  map?: string | null;
  type?: string;
  create_missing_teams?: boolean;
}) {
  return request<ApiMatch>("/ingest/vlr/autofill", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Attach/replace an external playback source on an existing VOD. */
export function apiAttachVodSource(
  vodId: string,
  payload: { source: "upload" | "twitch" | "youtube"; source_url: string; source_channel?: string | null },
) {
  return request<ApiVod>(`/vods/${vodId}/source`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Upload with real progress (Master Plan §4: upload progress). */
export function apiUploadVod(
  matchId: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<ApiJob> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/vods/upload?match_id=${matchId}`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as ApiJob);
      } else if (xhr.status === 401) {
        setToken(null);
        reject(new ApiError(401, "Session expired. Please sign in again."));
      } else {
        let detail = xhr.statusText;
        try {
          const body = JSON.parse(xhr.responseText);
          if (typeof body.detail === "string") detail = body.detail;
        } catch {
          /* keep statusText */
        }
        reject(new ApiError(xhr.status, detail));
      }
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "Cannot reach the VCTanalyzer API. Is it running?"));
    xhr.send(form);
  });
}

/* ---------------------------- mappers ------------------------------ */

const KNOWN_EVENT_TYPES = new Set([
  "kill",
  "first_blood",
  "death",
  "plant",
  "defuse",
  "mid_control",
  "execute",
  "retake",
  "rotation",
]);

export function mapApiEvent(e: ApiEvent): RoundEvent {
  return {
    id: e.id,
    type: KNOWN_EVENT_TYPES.has(e.type)
      ? (e.type as RoundEvent["type"])
      : "kill",
    time: e.t_seconds,
    label: e.label || e.type,
    playerId: e.player_id ?? undefined,
    x: e.x ?? undefined,
    y: e.y ?? undefined,
    confidence: e.confidence,
  };
}

export function mapApiRound(r: ApiRound): Round {
  // Convention (see app/tasks.py): the round's `side` is from team A's
  // perspective — team A attacks in the first half. First blood is won by
  // the attacking team in synthetic data; real CV output will replace this.
  const attackingSide: TeamSide = r.side === "attack" ? "team_a" : "team_b";
  const hasFirstBlood = r.events.some((e) => e.type === "first_blood");
  return {
    id: r.id,
    matchId: r.match_id,
    number: r.number,
    side: r.side,
    winnerSide: r.winner_side,
    won: r.winner_side === "team_a",
    duration: r.duration_seconds,
    firstBloodFor: hasFirstBlood ? attackingSide : null,
    planted: r.events.some((e) => e.type === "plant"),
    clutch: false,
    events: [...r.events]
      .sort((a, b) => a.t_seconds - b.t_seconds)
      .map(mapApiEvent),
  };
}

export function mapApiMatch(
  m: ApiMatch,
  teamsById: Map<string, ApiTeam>,
): Match {
  return {
    id: m.id,
    teamAId: m.team_a_id,
    teamBId: m.team_b_id,
    map: m.map,
    type: m.type === "official" ? "official" : "scrim",
    date: m.played_at,
    scoreA: m.score_a,
    scoreB: m.score_b,
    notes: m.notes || undefined,
  };
}

/** Build live PlayerTracks from /rounds/{id}/positions. */
export function mapPositionsToTracks(positions: ApiPosition[]): PlayerTrack[] {
  const byPlayer = new Map<string, PositionSample[]>();
  for (const p of positions) {
    const key = `${p.player_id}::${p.team_side}`;
    const list = byPlayer.get(key) ?? [];
    list.push({ t: p.t_seconds, x: p.x, y: p.y });
    byPlayer.set(key, list);
  }
  const tracks: PlayerTrack[] = [];
  for (const [key, samples] of byPlayer) {
    const [playerId, side] = key.split("::");
    samples.sort((a, b) => a.t - b.t);
    tracks.push({
      playerId,
      teamSide: side === "team_a" ? "team_a" : "team_b",
      agent: playerId.slice(0, 6),
      positions: samples,
    });
  }
  return tracks;
}
