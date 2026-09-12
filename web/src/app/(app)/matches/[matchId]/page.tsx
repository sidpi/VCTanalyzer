"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, Card, LinkButton, SectionTitle, StatCard } from "@/components/ui";
import {
  apiListRounds,
  apiListTeams,
  apiGetMatch,
  ApiError,
  mapApiRound,
  useRequireAuth,
  type ApiMatch,
  type ApiRound,
  type ApiTeam,
} from "@/lib/api";
import { formatTime } from "@/lib/format";

/* Match overview + round explorer from the live backend
   (Website Plan §16-17, Master Plan §21). */

const ROUND_FILTERS = [
  "All",
  "Wins",
  "Losses",
  "Attack",
  "Defense",
  "First Blood",
  "Plant",
] as const;

export default function MatchPage() {
  const ready = useRequireAuth();
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;

  const [match, setMatch] = useState<ApiMatch | null>(null);
  const [teams, setTeams] = useState<Map<string, ApiTeam> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof ROUND_FILTERS)[number]>("All");

  useEffect(() => {
    if (!ready) return;
    Promise.all([apiGetMatch(matchId), apiListTeams()])
      .then(([m, t]) => {
        setMatch(m);
        setTeams(new Map(t.map((x) => [x.id, x])));
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Failed to load match."),
      );
  }, [ready, matchId]);

  const rounds = useRounds(matchId, ready, setError);
  const mapped = useMemo(() => rounds?.map(mapApiRound) ?? null, [rounds]);

  if (!ready) return null;

  if (error) {
    return (
      <Card className="border-loss/40">
        <p className="text-[13px] text-loss">{error}</p>
        <div className="mt-3">
          <LinkButton href="/matches">Back to matches</LinkButton>
        </div>
      </Card>
    );
  }
  if (!match || !mapped) {
    return <p className="text-[13px] text-text-dim">Loading match…</p>;
  }

  const teamA = teams?.get(match.team_a_id);
  const teamB = teams?.get(match.team_b_id);

  const filtered = mapped.filter((r) => {
    switch (filter) {
      case "Wins":
        return r.winnerSide === "team_a";
      case "Losses":
        return r.winnerSide === "team_b";
      case "Attack":
        return r.side === "attack";
      case "Defense":
        return r.side === "defense";
      case "First Blood":
        return r.firstBloodFor != null;
      case "Plant":
        return r.planted;
      default:
        return true;
    }
  });

  const fbA = mapped.filter((r) => r.firstBloodFor === "team_a").length;
  const fbB = mapped.filter((r) => r.firstBloodFor === "team_b").length;
  const plants = mapped.filter((r) => r.planted).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tabular">
            {teamA?.name ?? "Team A"}{" "}
            <span className="text-accent">
              {match.score_a} — {match.score_b}
            </span>{" "}
            {teamB?.name ?? "Team B"}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-text-dim">
            <Badge>{match.map}</Badge>
            <span className="capitalize">{match.type}</span>
            {match.played_at ? <span>· {match.played_at}</span> : null}
            <span className="font-mono text-[11px] text-text-faint">
              {match.model_version}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton href={`/matches/${match.id}/rounds/1`} variant="primary">
            Open tactical viewer
          </LinkButton>
        </div>
      </div>

      {/* Match stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={`First bloods — ${teamA?.name ?? "A"}`} value={fbA} tone="info" />
        <StatCard label={`First bloods — ${teamB?.name ?? "B"}`} value={fbB} />
        <StatCard label="Plants" value={plants} tone="warning" />
        <StatCard label="Rounds" value={mapped.length} />
      </div>

      {/* Round explorer */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>Rounds</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {ROUND_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`cursor-pointer rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  filter === f
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-line text-text-dim hover:text-text"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-12">
          {filtered.map((r) => (
            <Link
              key={r.id}
              href={`/matches/${match.id}/rounds/${r.number}`}
              className="group"
            >
              <div
                className={`rounded-md border px-2 py-2 text-center transition-colors group-hover:border-line-2 ${
                  r.winnerSide === "team_a"
                    ? "border-win/40 bg-win/5"
                    : "border-loss/40 bg-loss/5"
                }`}
              >
                <div className="text-[13px] font-bold">R{r.number}</div>
                <div
                  className={`text-[10px] font-semibold uppercase ${
                    r.winnerSide === "team_a" ? "text-win" : "text-loss"
                  }`}
                >
                  {r.winnerSide === "team_a" ? "Won" : "Lost"}
                </div>
                <div className="mt-1 flex justify-center gap-0.5">
                  {r.planted ? <span className="text-[9px] text-warning">✦</span> : null}
                  {r.firstBloodFor != null ? (
                    <span className="text-[9px] text-accent">•</span>
                  ) : null}
                </div>
                <div className="tabular mt-0.5 text-[9.5px] text-text-faint">
                  {formatTime(r.duration)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>VOD</SectionTitle>
        <p className="mt-2 text-[13px] text-text-dim">
          The VOD is synchronized with the tactical timeline — clicking any
          event or round jumps both the map and the video to that timestamp
          (Master Plan §23). Each round carries its detected VOD start offset
          so sync works across the full recording.
        </p>
      </Card>
    </div>
  );
}

/** Shared rounds loader with poll-until-present for the processing race. */
function useRounds(
  matchId: string,
  ready: boolean,
  setError: (msg: string | null) => void,
) {
  const [rounds, setRounds] = useState<ApiRound[] | null>(null);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let attempts = 0;
    const load = async () => {
      try {
        const data = await apiListRounds(matchId);
        if (cancelled) return;
        if (data.length === 0 && attempts < 20) {
          // Job may still be processing — retry briefly.
          attempts += 1;
          setTimeout(load, 1500);
          return;
        }
        setRounds(data);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof ApiError ? e.message : "Failed to load rounds.",
          );
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [matchId, ready, setError]);
  return rounds;
}
