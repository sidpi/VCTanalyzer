"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, LinkButton, SectionTitle } from "@/components/ui";
import {
  apiListMatches,
  apiListTeams,
  ApiError,
  useRequireAuth,
  type ApiMatch,
  type ApiTeam,
} from "@/lib/api";

/* Match list from the live backend (Website Plan §5 — Matches). */

export default function MatchesPage() {
  const ready = useRequireAuth();
  const [matches, setMatches] = useState<ApiMatch[] | null>(null);
  const [teams, setTeams] = useState<Map<string, ApiTeam> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    Promise.all([apiListMatches(), apiListTeams()])
      .then(([m, t]) => {
        setMatches(m);
        setTeams(new Map(t.map((x) => [x.id, x])));
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Failed to load matches."),
      );
  }, [ready]);

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Matches</h1>
          <p className="mt-0.5 text-[13px] text-text-dim">
            All analyzed matches and scrims in your organization.
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
      ) : !matches ? (
        <Card>
          <p className="text-[13px] text-text-dim">Loading matches…</p>
        </Card>
      ) : matches.length === 0 ? (
        <Card>
          <SectionTitle>No matches yet</SectionTitle>
          <p className="mt-2 text-[13px] text-text-dim">
            Upload your first VOD to start building your team&apos;s dataset.
          </p>
          <div className="mt-4">
            <LinkButton href="/matches/new" variant="primary">
              Upload VOD
            </LinkButton>
          </div>
        </Card>
      ) : (
        <Card padded={false}>
          <div className="divide-y divide-line">
            {matches.map((m) => {
              const teamA = teams?.get(m.team_a_id);
              const teamB = teams?.get(m.team_b_id);
              const analyzed =
                m.score_a > 0 || m.score_b > 0 || m.analysis_version !== "v0";
              return (
                <Link
                  key={m.id}
                  href={`/matches/${m.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="tabular w-20 text-[12px] text-text-faint">
                      {m.played_at || "—"}
                    </span>
                    <span className="truncate text-[14px] font-semibold">
                      {teamA?.name ?? "Team A"}{" "}
                      <span className="text-text-faint">vs</span>{" "}
                      {teamB?.name ?? "Team B"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge>{m.map}</Badge>
                    <span className="text-[12px] capitalize text-text-dim">
                      {m.type}
                    </span>
                    <span className="tabular w-14 text-right text-[13px] font-semibold">
                      {m.score_a}—{m.score_b}
                    </span>
                    <Badge tone={analyzed ? "success" : "info"}>
                      {analyzed ? "Analyzed" : "Pending"}
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
