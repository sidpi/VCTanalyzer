"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  SectionTitle,
  Select,
  StatCard,
  Tabs,
  TextInput,
} from "@/components/ui";
import {
  apiAddTeamPlayer,
  apiGetTeam,
  apiListMatches,
  apiListRounds,
  apiListTeamPlayers,
  apiListTeams,
  apiRemoveTeamPlayer,
  ApiError,
  useRequireAuth,
  type ApiMatch,
  type ApiPlayer,
  type ApiRound,
  type ApiTeam,
} from "@/lib/api";
import { apiGetPatterns, type ApiPattern } from "@/lib/analytics";
import { MAPS } from "@/lib/types";

/* Team overview from the live backend (Website Plan §11-12, Master Plan §24). */

const TABS = ["Overview", "Matches", "Maps", "Players", "Patterns"];

const AGENTS = [
  "Jett", "Raze", "Neon", "Yoru", "Phoenix", "Reyna", "Iso",
  "Omen", "Astra", "Brimstone", "Harbor", "Clove", "Viper",
  "Sova", "Fade", "Gekko", "Breach", "Skye", "KAY/O", "Cypher", "Killjoy", "Chamber", "Deadlock", "Vyse",
];

const ROLES = [
  { value: "duelist", label: "Duelist" },
  { value: "controller", label: "Controller" },
  { value: "initiator", label: "Initiator" },
  { value: "sentinel", label: "Sentinel" },
  { value: "flex", label: "Flex" },
];

export default function TeamOverviewPage() {
  const ready = useRequireAuth();
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;

  const [team, setTeam] = useState<ApiTeam | null>(null);
  const [teamNames, setTeamNames] = useState<Map<string, string>>(new Map());
  const [matches, setMatches] = useState<ApiMatch[] | null>(null);
  const [roundsCount, setRoundsCount] = useState(0);
  const [players, setPlayers] = useState<ApiPlayer[] | null>(null);
  const [patterns, setPatterns] = useState<ApiPattern[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("Overview");

  // roster form
  const [newName, setNewName] = useState("");
  const [newRealName, setNewRealName] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [newAgent, setNewAgent] = useState("");
  const [newRole, setNewRole] = useState("duelist");
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const [t, m, allTeams, roster] = await Promise.all([
          apiGetTeam(teamId),
          apiListMatches(),
          apiListTeams(),
          apiListTeamPlayers(teamId),
        ]);
        if (cancelled) return;
        setTeam(t);
        setTeamNames(new Map(allTeams.map((x) => [x.id, x.name])));
        setMatches(m.filter((x) => x.team_a_id === teamId || x.team_b_id === teamId));
        setPlayers(roster);

        const analyzed = m.filter(
          (x) =>
            (x.team_a_id === teamId || x.team_b_id === teamId) &&
            (x.score_a > 0 || x.score_b > 0),
        );
        let rounds = 0;
        await Promise.all(
          analyzed.map(async (x) => {
            const rs: ApiRound[] = await apiListRounds(x.id);
            rounds += rs.length;
          }),
        );
        if (cancelled) return;
        setRoundsCount(rounds);

        const p = await apiGetPatterns();
        if (!cancelled) setPatterns(p);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load team.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, teamId]);

  if (!ready) return null;

  if (error) {
    return (
      <Card className="border-loss/40">
        <p className="text-[13px] text-loss">{error}</p>
        <p className="mt-2 text-[12px] text-text-dim">
          Start the backend with{" "}
          <code className="rounded bg-surface-2 px-1">docker compose up</code>.
        </p>
      </Card>
    );
  }

  if (!team || !matches || !players) {
    return (
      <Card>
        <p className="text-[13px] text-text-dim">Loading team…</p>
      </Card>
    );
  }

  const teamMatches = matches;
  const analyzed = teamMatches.filter((m) => m.score_a > 0 || m.score_b > 0);
  const wins = analyzed.filter((m) =>
    m.team_a_id === teamId ? m.score_a > m.score_b : m.score_b > m.score_a,
  ).length;
  const winRate = analyzed.length > 0 ? Math.round((wins / analyzed.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-line-2 bg-surface-2 text-[19px] font-bold text-accent">
          {initials(team.name)}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {team.name}
            {team.vlr_team_id ? (
              <Badge tone="info" className="ml-2 align-middle">
                vlr.gg
              </Badge>
            ) : null}
          </h1>
          <p className="text-[13px] text-text-dim">
            {(team.region || "—").toUpperCase()} · Matches: {analyzed.length} ·
            Rounds: {roundsCount} · Players: {players.length}
          </p>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onSelect={setTab} />

      {tab === "Overview" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Matches analyzed" value={analyzed.length} />
            <StatCard
              label="Win rate"
              value={analyzed.length ? `${winRate}%` : "—"}
              tone={winRate >= 50 ? "win" : undefined}
            />
            <StatCard label="Rounds analyzed" value={roundsCount || "—"} />
            <StatCard label="Roster size" value={players.length} />
          </div>

          <Card>
            <SectionTitle>Recent matches</SectionTitle>
            {analyzed.length === 0 ? (
              <p className="mt-3 text-[13px] text-text-dim">
                No analyzed matches yet — upload a VOD involving this team.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-line">
                {analyzed.slice(0, 6).map((m) => {
                  const won =
                    m.team_a_id === teamId
                      ? m.score_a > m.score_b
                      : m.score_b > m.score_a;
                  const opponentId =
                    m.team_a_id === teamId ? m.team_b_id : m.team_a_id;
                  const score =
                    m.team_a_id === teamId
                      ? `${m.score_a}—${m.score_b}`
                      : `${m.score_b}—${m.score_a}`;
                  return (
                    <Link
                      key={m.id}
                      href={`/matches/${m.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-surface-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Badge tone={won ? "success" : "danger"}>
                          {won ? "Win" : "Loss"}
                        </Badge>
                        <span className="truncate text-[13.5px] font-semibold">
                          vs {teamNames.get(opponentId) ?? "opponent"}
                        </span>
                        <Badge>{m.map}</Badge>
                      </div>
                      <span className="tabular text-[13px] text-text-dim">
                        {score}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "Matches" ? (
        <Card padded={false}>
          {teamMatches.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-text-dim">
              No matches involving this team yet.
            </p>
          ) : (
            <div className="divide-y divide-line">
              {teamMatches.map((m) => {
                const won =
                  m.team_a_id === teamId
                    ? m.score_a > m.score_b
                    : m.score_b > m.score_a;
                const isAnalyzed = m.score_a > 0 || m.score_b > 0;
                return (
                  <Link
                    key={m.id}
                    href={`/matches/${m.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <div className="flex items-center gap-3">
                      <Badge tone={!isAnalyzed ? "info" : won ? "success" : "danger"}>
                        {!isAnalyzed ? "Pending" : won ? "Win" : "Loss"}
                      </Badge>
                      <span className="text-[13.5px] font-semibold">{m.map}</span>
                      <span className="text-[12px] capitalize text-text-dim">
                        {m.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[13px]">
                      <span className="tabular text-text-dim">{m.played_at || "—"}</span>
                      <span className="tabular w-14 text-right font-semibold">
                        {m.team_a_id === teamId
                          ? `${m.score_a}—${m.score_b}`
                          : `${m.score_b}—${m.score_a}`}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      ) : null}

      {tab === "Maps" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MAPS.map((map) => {
            const count = analyzed.filter((m) => m.map === map.id).length;
            return (
              <Card key={map.id} className={count === 0 ? "opacity-50" : ""}>
                <div className="text-[14px] font-semibold">{map.name}</div>
                <div className="tabular mt-2 text-2xl font-bold">{count}</div>
                <div className="text-[12px] text-text-dim">matches analyzed</div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {tab === "Players" ? (
        <div className="space-y-4">
          <Card>
            <SectionTitle>Roster</SectionTitle>
            {players.length === 0 ? (
              <p className="mt-3 text-[13px] text-text-dim">
                No players on the roster yet — add them below. Rosters feed the
                tracker so positions/events get attributed to players.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-line">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <Link
                      href={`/players/${p.id}`}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <span className="truncate text-[13.5px] font-semibold text-info hover:underline">
                        {p.name}
                      </span>
                      {p.real_name ? (
                        <span className="truncate text-[12px] text-text-dim">
                          {p.real_name}
                        </span>
                      ) : null}
                      {p.country ? (
                        <span className="text-[12px] text-text-faint">
                          {p.country}
                        </span>
                      ) : null}
                      {p.agent ? <Badge tone="accent">{p.agent}</Badge> : null}
                      {p.role ? (
                        <span className="text-[12px] capitalize text-text-dim">
                          {p.role}
                        </span>
                      ) : null}
                    </Link>
                    <Button
                      variant="ghost"
                      disabled={rosterBusy}
                      onClick={async () => {
                        setRosterBusy(true);
                        setRosterError(null);
                        try {
                          await apiRemoveTeamPlayer(teamId, p.id);
                          setPlayers((prev) =>
                            prev ? prev.filter((x) => x.id !== p.id) : prev,
                          );
                        } catch (err) {
                          setRosterError(
                            err instanceof ApiError
                              ? err.message
                              : "Failed to remove player.",
                          );
                        } finally {
                          setRosterBusy(false);
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionTitle>Add player</SectionTitle>
            <form
              className="mt-3 grid gap-3 sm:grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto]"
              onSubmit={async (e) => {
                e.preventDefault();
                if (rosterBusy || !newName.trim()) return;
                setRosterBusy(true);
                setRosterError(null);
                try {
                  const player = await apiAddTeamPlayer(teamId, {
                    name: newName.trim(),
                    real_name: newRealName.trim(),
                    country: newCountry.trim(),
                    agent: newAgent,
                    role: newRole,
                  });
                  setPlayers((prev) => (prev ? [...prev, player] : [player]));
                  setNewName("");
                  setNewRealName("");
                  setNewCountry("");
                  setNewAgent("");
                } catch (err) {
                  setRosterError(
                    err instanceof ApiError
                      ? err.message
                      : "Failed to add player.",
                  );
                } finally {
                  setRosterBusy(false);
                }
              }}
            >
              <Field label="Name">
                <TextInput
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Boaster"
                  maxLength={120}
                />
              </Field>
              <Field label="Real name">
                <TextInput
                  value={newRealName}
                  onChange={(e) => setNewRealName(e.target.value)}
                  placeholder="e.g. Jake Howlett"
                  maxLength={120}
                />
              </Field>
              <Field label="Country">
                <TextInput
                  value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value)}
                  placeholder="e.g. UK"
                  maxLength={60}
                />
              </Field>
              <Field label="Agent">
                <Select
                  options={[
                    { value: "", label: "—" },
                    ...AGENTS.map((a) => ({ value: a, label: a })),
                  ]}
                  value={newAgent}
                  onChange={(e) => setNewAgent(e.target.value)}
                />
              </Field>
              <Field label="Role">
                <Select
                  options={ROLES}
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <Button type="submit" variant="primary" disabled={rosterBusy}>
                  {rosterBusy ? "…" : "Add"}
                </Button>
              </div>
            </form>
            {rosterError ? (
              <p className="mt-2 text-[13px] text-loss">{rosterError}</p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === "Patterns" ? (
        <div className="space-y-4">
          {!patterns ? (
            <Card>
              <p className="text-[13px] text-text-dim">Loading patterns…</p>
            </Card>
          ) : patterns.length === 0 ? (
            <Card>
              <p className="text-[13px] text-text-dim">
                No patterns detected yet — they appear after analyzed matches
                exist.
              </p>
            </Card>
          ) : (
            patterns.map((p) => (
              <Card key={p.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[14px] font-semibold text-accent">
                    {p.name}
                  </div>
                  <Badge tone="info">
                    {p.map} · {p.side}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-text-dim">
                  <span>
                    Frequency:{" "}
                    <span className="tabular text-text">
                      {p.frequency}/{p.totalRounds} rounds
                    </span>
                  </span>
                  <span>
                    Confidence:{" "}
                    <span className="tabular text-text">
                      {Math.round(p.confidence * 100)}%
                    </span>
                  </span>
                  <span>
                    Avg timing:{" "}
                    <span className="tabular text-text">{p.avgTiming}</span>
                  </span>
                </div>
              </Card>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------- helpers ------------------------------ */

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
