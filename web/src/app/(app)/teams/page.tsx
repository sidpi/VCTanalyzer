"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, LinkButton, SectionTitle } from "@/components/ui";
import {
  apiListMatches,
  apiListTeamPlayers,
  apiListTeams,
  ApiError,
  useRequireAuth,
  type ApiMatch,
  type ApiTeam,
} from "@/lib/api";

/* Team list from the live backend (Website Plan §10). */

interface TeamCard {
  team: ApiTeam;
  matches: number;
  rounds: number;
  players: number;
}

export default function TeamsPage() {
  const ready = useRequireAuth();
  const [cards, setCards] = useState<TeamCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const [teams, matches] = await Promise.all([
          apiListTeams(),
          apiListMatches(),
        ]);
        if (cancelled) return;
        const analyzed = matches.filter((m) => m.score_a > 0 || m.score_b > 0);
        const rosterSizes = new Map<string, number>();
        await Promise.all(
          teams.map(async (t) => {
            try {
              rosterSizes.set(t.id, (await apiListTeamPlayers(t.id)).length);
            } catch {
              rosterSizes.set(t.id, 0);
            }
          }),
        );
        if (cancelled) return;
        setCards(
          teams.map((team) => {
            const teamMatches = analyzed.filter(
              (m) => m.team_a_id === team.id || m.team_b_id === team.id,
            );
            const rounds = teamMatches.reduce(
              (a, m) => a + m.score_a + m.score_b,
              0,
            );
            return {
              team,
              matches: teamMatches.length,
              rounds,
              players: rosterSizes.get(team.id) ?? 0,
            };
          }),
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load teams.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="mt-0.5 text-[13px] text-text-dim">
            Persistent profiles that grow with every analyzed match.
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/teams/vlr">
            Browse vlr.gg teams
          </LinkButton>
          <LinkButton href="/teams/new" variant="primary">
            + Add Team
          </LinkButton>
        </div>
      </div>

      {error ? (
        <Card className="border-loss/40">
          <p className="text-[13px] text-loss">{error}</p>
          <p className="mt-2 text-[12px] text-text-dim">
            Start the backend with{" "}
            <code className="rounded bg-surface-2 px-1">docker compose up</code>.
          </p>
        </Card>
      ) : !cards ? (
        <Card>
          <p className="text-[13px] text-text-dim">Loading teams…</p>
        </Card>
      ) : cards.length === 0 ? (
        <Card>
          <SectionTitle>No teams yet</SectionTitle>
          <p className="mt-2 text-[13px] text-text-dim">
            Create your first team — or import a pro team with its full roster
            from vlr.gg. Matches, rosters, and analysis hang off teams.
          </p>
          <div className="mt-4">
            <LinkButton href="/teams/new" variant="primary">
              + Add Team
            </LinkButton>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ team, matches, rounds, players }) => (
            <Link key={team.id} href={`/teams/${team.id}`}>
              <Card className="transition-colors hover:border-line-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md border border-line-2 bg-surface-2 text-[15px] font-bold text-accent">
                    {initials(team.name)}
                  </div>
                  <div>
                    <div className="text-[15px] font-bold">{team.name}</div>
                    <div className="text-[12px] uppercase text-text-dim">
                      {team.region || "—"}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                  <div>
                    <div className="tabular text-[16px] font-bold">{matches}</div>
                    <div className="text-[11px] uppercase tracking-wide text-text-faint">
                      Matches
                    </div>
                  </div>
                  <div>
                    <div className="tabular text-[16px] font-bold">{rounds}</div>
                    <div className="text-[11px] uppercase tracking-wide text-text-faint">
                      Rounds
                    </div>
                  </div>
                  <div>
                    <div className="tabular text-[16px] font-bold">{players}</div>
                    <div className="text-[11px] uppercase tracking-wide text-text-faint">
                      Players
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
