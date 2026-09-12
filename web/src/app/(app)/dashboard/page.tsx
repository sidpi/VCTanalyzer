"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, LinkButton, ProgressBar, SectionTitle, StatCard } from "@/components/ui";
import {
  apiListMatchJobs,
  apiListMatches,
  apiListTeams,
  ApiError,
  useRequireAuth,
  type ApiMatch,
  type ApiTeam,
} from "@/lib/api";
import {
  apiGetPatterns,
  buildTeamPerformance,
  loadOrgDataset,
  type ApiPattern,
} from "@/lib/analytics";

/* Dashboard from the live backend (Website Plan §9). */

interface JobView {
  matchId: string;
  matchLabel: string;
  status: string;
  progress: number;
}

export default function DashboardPage() {
  const ready = useRequireAuth();
  const [matches, setMatches] = useState<ApiMatch[] | null>(null);
  const [teams, setTeams] = useState<Map<string, ApiTeam> | null>(null);
  const [perf, setPerf] = useState<ReturnType<typeof buildTeamPerformance>>([]);
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [pattern, setPattern] = useState<ApiPattern | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPct, setLoadingPct] = useState<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const [m, t] = await Promise.all([apiListMatches(), apiListTeams()]);
        if (cancelled) return;
        setMatches(m);
        setTeams(new Map(t.map((x) => [x.id, x])));

        // Jobs for the recent list.
        const jobLists = await Promise.all(
          m.slice(0, 6).map(async (match) => {
            const js = await apiListMatchJobs(match.id);
            const j = js[0];
            return j
              ? {
                  matchId: match.id,
                  matchLabel: `${teamsLabel(match, t)} — ${match.map}`,
                  status: j.status,
                  progress: j.progress,
                }
              : null;
          }),
        );
        if (cancelled) return;
        setJobs(jobLists.filter((x): x is JobView => x !== null));

        // Dataset-backed aggregates (positions/events). May be empty.
        const dataset = await loadOrgDataset((p) => !cancelled && setLoadingPct(p));
        if (cancelled) return;
        setPerf(buildTeamPerformance(dataset));
        const patterns = await apiGetPatterns();
        if (!cancelled) setPattern(patterns[0] ?? null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load dashboard.");
        }
      } finally {
        if (!cancelled) setLoadingPct(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null;

  const analyzed = (matches ?? []).filter((m) => m.score_a > 0 || m.score_b > 0);
  const mapsCovered = new Set(analyzed.map((m) => m.map)).size;
  const activeJobs = (jobs ?? []).filter(
    (j) => !["COMPLETED", "FAILED", "CANCELLED"].includes(j.status),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-0.5 text-[13px] text-text-dim">
            Your organization&apos;s tactical intelligence workspace.
          </p>
        </div>
        <LinkButton href="/matches/new" variant="primary">
          Upload VOD
        </LinkButton>
      </div>

      {error ? (
        <Card className="border-loss/40">
          <p className="text-[13px] text-loss">{error}</p>
          <p className="mt-2 text-[12px] text-text-dim">
            Start the backend with{" "}
            <code className="rounded bg-surface-2 px-1">docker compose up</code>.
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Matches analyzed" value={analyzed.length} />
        <StatCard
          label="Rounds analyzed"
          value={perf.reduce((a, t) => a + t.rounds, 0) || "—"}
        />
        <StatCard label="Teams tracked" value={(teams?.size ?? 0) || "—"} />
        <StatCard label="Maps covered" value={mapsCovered || "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <SectionTitle>Recent matches</SectionTitle>
            <Link href="/matches" className="text-[12px] text-info hover:underline">
              All matches →
            </Link>
          </div>
          {!matches ? (
            <p className="mt-3 text-[13px] text-text-dim">Loading…</p>
          ) : matches.length === 0 ? (
            <p className="mt-3 text-[13px] text-text-dim">
              No matches yet — upload your first VOD.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-line">
              {matches.slice(0, 6).map((m) => {
                const analyzedNow = m.score_a > 0 || m.score_b > 0;
                return (
                  <Link
                    key={m.id}
                    href={`/matches/${m.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="tabular text-[12px] text-text-faint">
                        {m.played_at || "—"}
                      </span>
                      <span className="truncate text-[13.5px] font-semibold">
                        {teams?.get(m.team_a_id)?.name ?? "Team A"}{" "}
                        <span className="text-text-faint">vs</span>{" "}
                        {teams?.get(m.team_b_id)?.name ?? "Team B"}
                      </span>
                      <Badge>{m.map}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular text-[13px] text-text-dim">
                        {m.score_a}—{m.score_b}
                      </span>
                      <Badge tone={analyzedNow ? "success" : "info"}>
                        {analyzedNow ? "Analyzed" : "Pending"}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <SectionTitle>Processing jobs</SectionTitle>
            {!jobs ? (
              <p className="mt-3 text-[13px] text-text-dim">Loading…</p>
            ) : jobs.length === 0 ? (
              <p className="mt-3 text-[13px] text-text-dim">No analysis jobs yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {jobs.slice(0, 4).map((j) => {
                  const done = j.status === "COMPLETED";
                  return (
                    <div key={j.matchId}>
                      <div className="mb-1 flex justify-between text-[12px]">
                        <Link
                          href={`/matches/${j.matchId}/processing`}
                          className="truncate font-medium text-info hover:underline"
                        >
                          {j.matchLabel}
                        </Link>
                        <span className="tabular text-text-dim">{j.progress}%</span>
                      </div>
                      <ProgressBar
                        value={j.progress}
                        tone={done ? "win" : "info"}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>Team performance</SectionTitle>
            {!perf.length ? (
              <p className="mt-3 text-[13px] text-text-dim">
                No analyzed matches yet.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {perf.map((t) => (
                  <div key={t.teamId} className="flex items-center justify-between text-[13px]">
                    <span className="font-medium">{t.name}</span>
                    <span className="tabular text-[12px] text-text-dim">
                      {t.matches} matches · {Math.round(t.winRate * 100)}% win
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <SectionTitle>Latest pattern detected</SectionTitle>
        {pattern ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[14px] font-semibold text-accent">
                {pattern.name}
              </div>
              <div className="mt-1 text-[12px] text-text-dim">
                {pattern.frequency} of {pattern.totalRounds} rounds ·{" "}
                {pattern.map} · confidence {Math.round(pattern.confidence * 100)}% ·
                avg {pattern.avgTiming}
              </div>
            </div>
            <LinkButton href="/analytics/patterns">View pattern</LinkButton>
          </div>
          ) : (
          <p className="mt-3 text-[13px] text-text-dim">
            Patterns appear after your first analyzed match.
          </p>
        )}
      </Card>

      {loadingPct != null ? (
        <p className="text-[11.5px] text-text-faint">
          Loading analytics dataset… {loadingPct}%
        </p>
      ) : null}
    </div>
  );
}

function teamsLabel(m: ApiMatch, teams: ApiTeam[]): string {
  const a = teams.find((t) => t.id === m.team_a_id)?.name ?? "Team A";
  const b = teams.find((t) => t.id === m.team_b_id)?.name ?? "Team B";
  return `${a} vs ${b}`;
}
