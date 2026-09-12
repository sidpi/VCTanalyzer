"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Field,
  ProgressBar,
  SectionTitle,
  Select,
  TextInput,
} from "@/components/ui";
import {
  apiCreateMatch,
  apiImportTwitch,
  apiImportYoutube,
  apiListTeams,
  apiResolveTwitch,
  apiResolveYoutube,
  apiUploadVod,
  apiVlrMatches,
  apiVlrAutofill,
  ApiError,
  useRequireAuth,
  type ApiMatch,
  type ApiTeam,
  type ApiTwitchInfo,
  type ApiVlrMatch,
  type ApiYoutubeInfo,
} from "@/lib/api";

/* VOD ingestion (Website Plan §13-14 + Twitch/VLR integration):
   - Auto-fill match metadata (teams, map, date) from vlr.gg
   - Import a Twitch VOD URL, or upload a file manually
   - Both paths enqueue the same analysis job pipeline. */

const FORMATS = ["MP4", "MKV", "MOV", "WebM"];
const MAPS = [
  { value: "ascent", label: "Ascent" },
  { value: "haven", label: "Haven" },
  { value: "bind", label: "Bind" },
  { value: "split", label: "Split" },
];
const MAX_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB

function formatBytes(bytes: number): string {
  if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes > 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatVlrDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Phase = "editing" | "working" | "done";
type Source = "twitch" | "youtube" | "upload";

export default function NewMatchPage() {
  const ready = useRequireAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [teams, setTeams] = useState<ApiTeam[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [source, setSource] = useState<Source>("upload");
  const [phase, setPhase] = useState<Phase>("editing");
  const [uploadPct, setUploadPct] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // VLR auto-fill state
  const [vlrMatches, setVlrMatches] = useState<ApiVlrMatch[] | null>(null);
  const [vlrError, setVlrError] = useState<string | null>(null);
  const [vlrFilter, setVlrFilter] = useState("");
  const [autofilled, setAutofilled] = useState<ApiMatch | null>(null);
  const [autofilling, setAutofilling] = useState<string | null>(null);

  // Twitch import state
  const [twitchUrl, setTwitchUrl] = useState("");
  const [twitchInfo, setTwitchInfo] = useState<ApiTwitchInfo | null>(null);
  const [resolving, setResolving] = useState(false);

  // YouTube import state
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeInfo, setYoutubeInfo] = useState<ApiYoutubeInfo | null>(null);
  const [resolvingYt, setResolvingYt] = useState(false);

  // Manual upload state
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Smart-paste state: one field accepts a Twitch OR YouTube URL, detects
  // the platform, switches the source, and resolves automatically.
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteInfo, setPasteInfo] = useState<ApiTwitchInfo | ApiYoutubeInfo | null>(null);
  const [pasteResolving, setPasteResolving] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const detectPlatform = (url: string): "twitch" | "youtube" | null => {
    const u = url.trim();
    if (!u) return null;
    if (/^(https?:\/\/)?(www\.)?(twitch\.tv|clips\.twitch\.tv)\//i.test(u)) return "twitch";
    if (/^(https?:\/\/)?(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(u)) return "youtube";
    return null;
  };

  const resolvePasted = async (raw: string) => {
    const url = raw.trim();
    const platform = detectPlatform(url);
    if (!platform) {
      setPasteError(
        "Paste a Twitch or YouTube VOD URL (twitch.tv/videos/…, a clip link, or youtube.com/watch?v=…).",
      );
      return;
    }
    setPasteResolving(true);
    setPasteError(null);
    setPasteInfo(null);
    try {
      if (platform === "twitch") {
        setSource("twitch");
        setTwitchUrl(url);
        setYoutubeUrl("");
        setYoutubeInfo(null);
        const info = await apiResolveTwitch(url);
        setTwitchInfo(info);
        setPasteInfo(info);
      } else {
        setSource("youtube");
        setYoutubeUrl(url);
        setTwitchUrl("");
        setTwitchInfo(null);
        const info = await apiResolveYoutube(url);
        setYoutubeInfo(info);
        setPasteInfo(info);
      }
    } catch (err) {
      setPasteError(
        err instanceof ApiError ? err.message : "Could not resolve that URL.",
      );
    } finally {
      setPasteResolving(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    apiListTeams()
      .then(setTeams)
      .catch((e) =>
        setLoadError(e instanceof ApiError ? e.message : "Failed to load teams."),
      );
    apiVlrMatches("completed")
      .then((res) => setVlrMatches(res.data))
      .catch((e) =>
        setVlrError(
          e instanceof ApiError ? e.message : "Could not load VLR matches.",
        ),
      );
  }, [ready]);

  const handleFile = useCallback((f: File) => {
    setFileError(null);
    const ext = f.name.split(".").pop()?.toUpperCase() ?? "";
    if (!FORMATS.includes(ext)) {
      setFileError(
        `This video format isn't supported. Supported formats: ${FORMATS.join(", ")}.`,
      );
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError("File exceeds the 20 GB limit.");
      return;
    }
    setFile(f);
  }, []);

  const autofillFromVlr = async (m: ApiVlrMatch) => {
    setAutofilling(m.id);
    setSubmitError(null);
    try {
      const match = await apiVlrAutofill({ vlr_match_id: m.id, type: "official" });
      setAutofilled(match);
      // Prefill the smart-paste field when VLR lists an official VOD; the
      // resolver routes it to the right flow (Twitch or YouTube).
      if (match.vod?.source_url && !pasteUrl) {
        setPasteUrl(match.vod.source_url);
        resolvePasted(match.vod.source_url);
      }
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : "VLR auto-fill failed.",
      );
    } finally {
      setAutofilling(null);
    }
  };

  const resolveTwitch = async () => {
    setResolving(true);
    setTwitchInfo(null);
    setSubmitError(null);
    try {
      setTwitchInfo(await apiResolveTwitch(twitchUrl));
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : "Could not resolve that URL.",
      );
    } finally {
      setResolving(false);
    }
  };

  const resolveYoutube = async () => {
    setResolvingYt(true);
    setYoutubeInfo(null);
    setSubmitError(null);
    try {
      setYoutubeInfo(await apiResolveYoutube(youtubeUrl));
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : "Could not resolve that URL.",
      );
    } finally {
      setResolvingYt(false);
    }
  };

  /** Create a match from the manual form (used when no VLR match selected). */
  const createManualMatch = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const teamA = String(data.get("teamA") ?? "");
    const teamB = String(data.get("teamB") ?? "");
    if (!teamA || !teamB || teamA === teamB) {
      setSubmitError("Select two different teams.");
      return null;
    }
    return apiCreateMatch({
      team_a_id: teamA,
      team_b_id: teamB,
      map: String(data.get("map") ?? "ascent"),
      type: String(data.get("type") ?? "scrim"),
      played_at: String(data.get("date") ?? ""),
      notes: String(data.get("notes") ?? ""),
    });
  };

  const startTwitchImport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!twitchInfo) return;
    setSubmitError(null);
    setPhase("working");
    try {
      const match =
        autofilled ?? (await createManualMatch(e.currentTarget));
      if (!match) {
        setPhase("editing");
        return;
      }
      const job = await apiImportTwitch(match.id, twitchUrl);
      setPhase("done");
      router.push(`/matches/${match.id}/processing?job=${job.id}`);
    } catch (err) {
      setPhase("editing");
      setSubmitError(
        err instanceof ApiError ? err.message : "Twitch import failed.",
      );
    }
  };

  const startYoutubeImport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!youtubeInfo) return;
    setSubmitError(null);
    setPhase("working");
    try {
      const match =
        autofilled ?? (await createManualMatch(e.currentTarget));
      if (!match) {
        setPhase("editing");
        return;
      }
      const job = await apiImportYoutube(match.id, youtubeUrl);
      setPhase("done");
      router.push(`/matches/${match.id}/processing?job=${job.id}`);
    } catch (err) {
      setPhase("editing");
      setSubmitError(
        err instanceof ApiError ? err.message : "YouTube import failed.",
      );
    }
  };

  const startUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return;
    setSubmitError(null);
    setPhase("working");
    setUploadPct(0);
    try {
      const match =
        autofilled ?? (await createManualMatch(e.currentTarget));
      if (!match) {
        setPhase("editing");
        return;
      }
      const job = await apiUploadVod(match.id, file, setUploadPct);
      setPhase("done");
      router.push(`/matches/${match.id}/processing?job=${job.id}`);
    } catch (err) {
      setPhase("editing");
      setSubmitError(
        err instanceof ApiError ? err.message : "Upload failed. Try again.",
      );
    }
  };

  if (!ready) return null;

  const filteredVlr = (vlrMatches ?? []).filter((m) => {
    if (!vlrFilter.trim()) return true;
    const q = vlrFilter.toLowerCase();
    return (
      m.team1.name.toLowerCase().includes(q) ||
      m.team2.name.toLowerCase().includes(q) ||
      m.event.toLowerCase().includes(q)
    );
  });

  const needsManualTeams =
    !autofilled && (!teams || teams.length < 2) && source === "upload";
  const needsManualTeamsTwitch =
    !autofilled && (!teams || teams.length < 2) && source === "twitch";
  const needsManualTeamsYoutube =
    !autofilled && (!teams || teams.length < 2) && source === "youtube";
  const needsTeamsForSource =
    (source === "upload" && needsManualTeams) ||
    (source === "twitch" && needsManualTeamsTwitch) ||
    (source === "youtube" && needsManualTeamsYoutube);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Add Match VOD</h1>
        <p className="mt-0.5 text-[13px] text-text-dim">
          Import from Twitch or YouTube, or upload a recording — auto-fill the
          teams, map, and date from vlr.gg.
        </p>
      </div>

      {loadError ? (
        <Card className="border-loss/40">
          <p className="text-[13px] text-loss">{loadError}</p>
          <p className="mt-2 text-[12px] text-text-dim">
            Start the backend with{" "}
            <code className="rounded bg-surface-2 px-1">docker compose up</code> —
            see the README.
          </p>
        </Card>
      ) : null}

      {/* 1 — Auto-fill from vlr.gg */}
      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle>Auto-fill from vlr.gg</SectionTitle>
          <Badge tone="info">Online</Badge>
        </div>
        <p className="mt-1 text-[12px] text-text-dim">
          Pick a recent completed match to create the teams, map, and date
          automatically. Optional — skip ahead to enter everything manually.
        </p>

        {vlrError ? (
          <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
            {vlrError}
            <span className="mt-1 block text-[11.5px] text-text-dim">
              Run the{" "}
              <a
                className="text-info hover:underline"
                href="https://github.com/akhilnarang/vlrgg-scraper"
                target="_blank"
                rel="noreferrer"
              >
                vlrgg-scraper
              </a>{" "}
              service and set <code>VLR_BASE_URL</code> on the API to enable
              auto-fill.
            </span>
          </div>
        ) : vlrMatches === null ? (
          <p className="mt-3 text-[12.5px] text-text-faint">
            Loading recent matches…
          </p>
        ) : (
          <>
            <div className="mt-3">
              <TextInput
                placeholder="Filter by team or event…"
                value={vlrFilter}
                onChange={(e) => setVlrFilter(e.target.value)}
              />
            </div>
            <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {filteredVlr.slice(0, 25).map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">
                      {m.team1.name}{" "}
                      <span className="text-text-faint">vs</span>{" "}
                      {m.team2.name}
                      {m.team1.score != null && m.team2.score != null ? (
                        <span className="ml-2 font-mono text-[12px] text-text-dim">
                          {m.team1.score}–{m.team2.score}
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-[11px] text-text-faint">
                      {m.event} · {formatVlrDate(m.time)}
                    </div>
                  </div>
                  <Button
                    disabled={autofilling !== null}
                    onClick={() => autofillFromVlr(m)}
                  >
                    {autofilling === m.id ? "Filling…" : "Use"}
                  </Button>
                </li>
              ))}
              {filteredVlr.length === 0 ? (
                <li className="px-1 py-2 text-[12.5px] text-text-faint">
                  No matches match that filter.
                </li>
              ) : null}
            </ul>
          </>
        )}

        {autofilled ? (
          <div className="mt-3 rounded-md border border-win/40 bg-win/10 px-3 py-2 text-[12.5px]">
            <span className="font-semibold text-win">
              Match created from VLR ✓
            </span>
            <span className="ml-2 text-text-dim">
              {autofilled.map} · {autofilled.played_at || "date from VLR"}
              {autofilled.vod?.source_url ? " · official VOD link found" : ""}
            </span>
          </div>
        ) : null}
      </Card>

      {/* 2 — Smart URL paste (detects Twitch vs YouTube) */}
      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle>Paste a VOD URL</SectionTitle>
          <Badge tone="accent">Auto-detect</Badge>
        </div>
        <p className="mt-1 text-[12px] text-text-dim">
          Paste a Twitch VOD/clip or YouTube link — the platform is detected
          automatically and the VOD is resolved for you.
        </p>
        <div className="mt-3 flex gap-2">
          <div className="flex-1">
            <TextInput
              placeholder="https://www.twitch.tv/videos/… or https://youtube.com/watch?v=…"
              value={pasteUrl}
              onChange={(e) => {
                setPasteUrl(e.target.value);
                setPasteInfo(null);
                setPasteError(null);
              }}
              disabled={phase !== "editing"}
            />
          </div>
          <Button
            type="button"
            disabled={!pasteUrl.trim() || pasteResolving || phase !== "editing"}
            onClick={() => resolvePasted(pasteUrl)}
          >
            {pasteResolving ? "Resolving…" : "Resolve"}
          </Button>
        </div>
        {pasteError ? (
          <p className="mt-2 text-[12.5px] text-warning">{pasteError}</p>
        ) : null}
        {pasteInfo ? (
          <div className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2.5">
            <div className="text-[13px] font-semibold">
              {pasteInfo.title ?? `${pasteInfo.provider} ${pasteInfo.vod_id}`}
            </div>
            <div className="mt-0.5 text-[11.5px] text-text-dim">
              {pasteInfo.channel ? `${pasteInfo.channel} · ` : ""}
              {pasteInfo.duration_seconds
                ? `${Math.round(pasteInfo.duration_seconds / 60)} min · `
                : ""}
              {pasteInfo.provider === "clip"
                ? "Twitch clip"
                : pasteInfo.provider === "youtube"
                  ? "YouTube"
                  : "Twitch VOD"}
            </div>
            {"warnings" in pasteInfo && pasteInfo.warnings.length > 0
              ? pasteInfo.warnings.map((w) => (
                  <div key={w} className="mt-1 text-[11px] text-warning">
                    ⚠ {w}
                  </div>
                ))
              : null}
          </div>
        ) : null}
      </Card>

      {/* 3 — Video source */}
      <Card>
        <SectionTitle>Video source</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(
            [
              {
                key: "twitch" as const,
                title: "Import from Twitch",
                desc: "Paste a Twitch VOD or clip URL. Streams inline — no download.",
              },
              {
                key: "youtube" as const,
                title: "Import from YouTube",
                desc: "Paste a YouTube VOD URL. Streams inline — no download.",
              },
              {
                key: "upload" as const,
                title: "Upload file",
                desc: "Drag & drop a recording (MP4, MKV, MOV, WebM — max 20 GB).",
              },
            ]
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              disabled={phase !== "editing"}
              onClick={() => setSource(opt.key)}
              className={`cursor-pointer rounded-lg border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed ${
                source === opt.key
                  ? "border-accent bg-accent-soft/40"
                  : "border-line-2 bg-surface-2 hover:border-line-2/80"
              }`}
            >
              <div
                className={`text-[13.5px] font-semibold ${
                  source === opt.key ? "text-accent" : ""
                }`}
              >
                {opt.title}
              </div>
              <div className="mt-1 text-[11.5px] leading-relaxed text-text-dim">
                {opt.desc}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* 3a — Twitch import */}
      {source === "twitch" ? (
        needsManualTeamsTwitch ? (
          <Card className="border-warning/40">
            <p className="text-[13px] text-warning">
              You need at least two teams in your organization before importing
              a Twitch VOD — or use the vlr.gg auto-fill above, which creates
              them for you.
            </p>
          </Card>
        ) : (
          <form className="space-y-6" onSubmit={startTwitchImport}>
            <Card>
              <SectionTitle>Twitch VOD</SectionTitle>
              <div className="mt-3 flex gap-2">
                <div className="flex-1">
                  <TextInput
                    placeholder="https://www.twitch.tv/videos/123456789"
                    value={twitchUrl}
                    onChange={(e) => {
                      setTwitchUrl(e.target.value);
                      setTwitchInfo(null);
                      setPasteUrl(e.target.value);
                      setPasteInfo(null);
                    }}
                    disabled={phase !== "editing"}
                  />
                </div>
                <Button
                  type="button"
                  disabled={!twitchUrl.trim() || resolving || phase !== "editing"}
                  onClick={resolveTwitch}
                >
                  {resolving ? "Resolving…" : "Resolve"}
                </Button>
              </div>

              {twitchInfo ? (
                <div className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2.5">
                  <div className="text-[13px] font-semibold">
                    {twitchInfo.title ?? `Twitch ${twitchInfo.provider} ${twitchInfo.vod_id}`}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-text-dim">
                    {twitchInfo.channel ? `${twitchInfo.channel} · ` : ""}
                    {twitchInfo.duration_seconds
                      ? `${Math.round(twitchInfo.duration_seconds / 60)} min · `
                      : ""}
                    {twitchInfo.provider === "clip" ? "clip" : "VOD"}
                  </div>
                  {twitchInfo.warnings.map((w) => (
                    <div key={w} className="mt-1 text-[11px] text-warning">
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              ) : null}

              {!autofilled ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Team 1">
                    <Select
                      name="teamA"
                      required
                      disabled={phase !== "editing"}
                      options={[
                        { value: "", label: "Select team" },
                        ...(teams ?? []).map((t) => ({ value: t.id, label: t.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Team 2">
                    <Select
                      name="teamB"
                      required
                      disabled={phase !== "editing"}
                      options={[
                        { value: "", label: "Select team" },
                        ...(teams ?? []).map((t) => ({ value: t.id, label: t.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Map">
                    <Select name="map" options={MAPS} defaultValue="ascent" disabled={phase !== "editing"} />
                  </Field>
                  <Field label="Match type">
                    <Select
                      name="type"
                      options={[
                        { value: "scrim", label: "Scrim" },
                        { value: "official", label: "Official" },
                      ]}
                      defaultValue="official"
                      disabled={phase !== "editing"}
                    />
                  </Field>
                  <Field label="Date">
                    <TextInput
                      name="date"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      disabled={phase !== "editing"}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Notes" hint="Optional context for analysts.">
                      <TextInput name="notes" disabled={phase !== "editing"} />
                    </Field>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[12px] text-text-dim">
                  Importing into the VLR match —{" "}
                  <strong>{autofilled.map}</strong>
                  {autofilled.vod?.source_url && twitchUrl === autofilled.vod.source_url
                    ? " using the official VOD link found on vlr.gg"
                    : ""}
                  .
                </p>
              )}
            </Card>

            {submitError ? (
              <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-[13px] text-loss">
                {submitError}
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={!twitchInfo || phase !== "editing"}
              >
                {phase === "editing" ? "Import & Analyze" : "Importing…"}
              </Button>
            </div>
          </form>
        )
      ) : source === "youtube" ? (
        /* 3b — YouTube import */
        needsManualTeamsYoutube ? (
          <Card className="border-warning/40">
            <p className="text-[13px] text-warning">
              You need at least two teams in your organization before importing
              a YouTube VOD — or use the vlr.gg auto-fill above, which creates
              them for you.
            </p>
          </Card>
        ) : (
          <form className="space-y-6" onSubmit={startYoutubeImport}>
            <Card>
              <SectionTitle>YouTube VOD</SectionTitle>
              <div className="mt-3 flex gap-2">
                <div className="flex-1">
                  <TextInput
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={youtubeUrl}
                    onChange={(e) => {
                      setYoutubeUrl(e.target.value);
                      setYoutubeInfo(null);
                      setPasteUrl(e.target.value);
                      setPasteInfo(null);
                    }}
                    disabled={phase !== "editing"}
                  />
                </div>
                <Button
                  type="button"
                  disabled={!youtubeUrl.trim() || resolvingYt || phase !== "editing"}
                  onClick={resolveYoutube}
                >
                  {resolvingYt ? "Resolving…" : "Resolve"}
                </Button>
              </div>

              {youtubeInfo ? (
                <div className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2.5">
                  <div className="text-[13px] font-semibold">
                    {youtubeInfo.title ?? `YouTube video ${youtubeInfo.vod_id}`}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-text-dim">
                    {youtubeInfo.channel ? `${youtubeInfo.channel} · ` : ""}
                    {youtubeInfo.duration_seconds
                      ? `${Math.round(youtubeInfo.duration_seconds / 60)} min · `
                      : ""}
                    video
                  </div>
                  {youtubeInfo.warnings.map((w) => (
                    <div key={w} className="mt-1 text-[11px] text-warning">
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              ) : null}

              {!autofilled ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Team 1">
                    <Select
                      name="teamA"
                      required
                      disabled={phase !== "editing"}
                      options={[
                        { value: "", label: "Select team" },
                        ...(teams ?? []).map((t) => ({ value: t.id, label: t.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Team 2">
                    <Select
                      name="teamB"
                      required
                      disabled={phase !== "editing"}
                      options={[
                        { value: "", label: "Select team" },
                        ...(teams ?? []).map((t) => ({ value: t.id, label: t.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Map">
                    <Select name="map" options={MAPS} defaultValue="ascent" disabled={phase !== "editing"} />
                  </Field>
                  <Field label="Match type">
                    <Select
                      name="type"
                      options={[
                        { value: "scrim", label: "Scrim" },
                        { value: "official", label: "Official" },
                      ]}
                      defaultValue="official"
                      disabled={phase !== "editing"}
                    />
                  </Field>
                  <Field label="Date">
                    <TextInput
                      name="date"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      disabled={phase !== "editing"}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Notes" hint="Optional context for analysts.">
                      <TextInput name="notes" disabled={phase !== "editing"} />
                    </Field>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[12px] text-text-dim">
                  Importing into the VLR match — <strong>{autofilled.map}</strong>.
                </p>
              )}
            </Card>

            {submitError ? (
              <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-[13px] text-loss">
                {submitError}
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={!youtubeInfo || phase !== "editing"}
              >
                {phase === "editing" ? "Import & Analyze" : "Importing…"}
              </Button>
            </div>
          </form>
        )
      ) : (
        /* 3c — Manual upload */
        needsManualTeams && !loadError ? (
          <Card>
            <SectionTitle>Teams needed</SectionTitle>
            <p className="mt-2 text-[13px] text-text-dim">
              You need at least two teams in your organization before uploading
              a match — or use the vlr.gg auto-fill above, which creates them
              for you.
            </p>
          </Card>
        ) : (
          <form className="space-y-6" onSubmit={startUpload}>
            <Card>
              <SectionTitle>VOD file</SectionTitle>
              <div
                className="mt-3 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line-2 px-6 py-12 text-center transition-colors hover:border-line-2/80"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
              >
                {file ? (
                  <>
                    <div className="text-[14px] font-semibold">{file.name}</div>
                    <div className="mt-1 text-[12px] text-text-dim">
                      {formatBytes(file.size)}
                    </div>
                    {phase === "editing" ? (
                      <button
                        type="button"
                        className="mt-3 cursor-pointer text-[12px] text-info hover:underline"
                        onClick={() => setFile(null)}
                      >
                        Remove file
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="text-[14px] font-semibold text-text-dim">
                      Drag &amp; Drop VOD Here
                    </div>
                    <div className="my-2 text-[12px] text-text-faint">or</div>
                    <Button onClick={() => inputRef.current?.click()}>
                      Browse Files
                    </Button>
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".mp4,.mkv,.mov,.webm,video/mp4,video/x-matroska,video/quicktime,video/webm"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                      }}
                    />
                  </>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {FORMATS.map((f) => (
                  <Badge key={f}>{f}</Badge>
                ))}
                <span className="ml-1 self-center text-[11px] text-text-faint">
                  Max 20 GB
                </span>
              </div>

              {fileError ? (
                <div className="mt-3 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-[13px] text-loss">
                  {fileError}
                </div>
              ) : null}

              {phase !== "editing" ? (
                <div className="mt-4 space-y-1">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-text-dim">
                      {phase === "done"
                        ? "Upload complete ✓ — analysis queued"
                        : "Uploading…"}
                    </span>
                    <span className="tabular">{uploadPct}%</span>
                  </div>
                  <ProgressBar
                    value={uploadPct}
                    tone={phase === "done" ? "win" : "accent"}
                  />
                </div>
              ) : null}

              {!autofilled ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Team 1">
                    <Select
                      name="teamA"
                      required
                      disabled={phase !== "editing"}
                      options={[
                        { value: "", label: "Select team" },
                        ...(teams ?? []).map((t) => ({ value: t.id, label: t.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Team 2">
                    <Select
                      name="teamB"
                      required
                      disabled={phase !== "editing"}
                      options={[
                        { value: "", label: "Select team" },
                        ...(teams ?? []).map((t) => ({ value: t.id, label: t.name })),
                      ]}
                    />
                  </Field>
                  <Field label="Map">
                    <Select name="map" options={MAPS} defaultValue="ascent" disabled={phase !== "editing"} />
                  </Field>
                  <Field label="Match type">
                    <Select
                      name="type"
                      options={[
                        { value: "scrim", label: "Scrim" },
                        { value: "official", label: "Official" },
                      ]}
                      defaultValue="scrim"
                      disabled={phase !== "editing"}
                    />
                  </Field>
                  <Field label="Date">
                    <TextInput
                      name="date"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      disabled={phase !== "editing"}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Notes" hint="Optional context for analysts.">
                      <TextInput
                        name="notes"
                        placeholder="e.g. testing new A execute"
                        disabled={phase !== "editing"}
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[12px] text-text-dim">
                  Uploading into the VLR match — <strong>{autofilled.map}</strong>
                  {autofilled.played_at ? ` · ${autofilled.played_at}` : ""}.
                </p>
              )}
            </Card>

            {submitError ? (
              <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-[13px] text-loss">
                {submitError}
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={!file || phase !== "editing"}
              >
                {phase === "editing" ? "Start Analysis" : "Uploading…"}
              </Button>
            </div>
          </form>
        )
      )}

      <div className="text-right">
        <Link href="/matches" className="text-[12px] text-text-dim hover:text-text">
          View all matches →
        </Link>
      </div>
    </div>
  );
}
