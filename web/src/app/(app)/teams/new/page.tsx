"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, SectionTitle, Select, TextInput } from "@/components/ui";
import {
  apiCreateTeam,
  apiVlrSearch,
  apiVlrTeamDetail,
  apiImportVlrTeam,
  ApiError,
  useRequireAuth,
  type ApiVlrSearchResult,
  type ApiVlrTeamProfile,
} from "@/lib/api";

/* Team creation: manual (POST /teams) or import from vlr.gg with the full
   roster — alias, real name, role — plus region/country (Master Plan §42). */

const REGIONS = [
  { value: "eu", label: "Europe" },
  { value: "na", label: "Americas" },
  { value: "kr", label: "Pacific" },
  { value: "cn", label: "China" },
  { value: "", label: "Other / unspecified" },
];

type Mode = "manual" | "vlr";

export default function NewTeamPage() {
  const ready = useRequireAuth();
  const router = useRouter();

  // Manual state
  const [mode, setMode] = useState<Mode>("manual");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("eu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // VLR import state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiVlrSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApiVlrTeamProfile | null>(null);
  const [previewId, setPreviewId] = useState<string>("");
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (mode !== "vlr" || query.trim().length < 3) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      apiVlrSearch(query.trim())
        .then((res) =>
          setResults(res.data.filter((r) => r.category === "teams")),
        )
        .catch((e) =>
          setSearchError(
            e instanceof ApiError ? e.message : "VLR search failed.",
          ),
        )
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(t);
  }, [query, mode]);

  const previewTeam = async (r: ApiVlrSearchResult) => {
    setPreviewing(r.id);
    setError(null);
    try {
      setPreview(await apiVlrTeamDetail(r.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load that team.");
    } finally {
      setPreviewing(null);
    }
  };

  const importTeam = async () => {
    if (!preview || !previewId) return;
    setImporting(true);
    setError(null);
    try {
      const team = await apiImportVlrTeam(previewId);
      router.push(`/teams/${team.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  if (!ready) return null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Add Team</h1>

      <div className="grid grid-cols-2 gap-3">
        {(
          [
            {
              key: "manual" as const,
              title: "Create manually",
              desc: "Name and region — add players on the team page.",
            },
            {
              key: "vlr" as const,
              title: "Import from vlr.gg",
              desc: "Pulls the team profile and full roster automatically.",
            },
          ]
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setMode(opt.key)}
            className={`cursor-pointer rounded-lg border px-4 py-3 text-left transition-colors ${
              mode === opt.key
                ? "border-accent bg-accent-soft/40"
                : "border-line-2 bg-surface-2 hover:border-line-2/80"
            }`}
          >
            <div
              className={`text-[13.5px] font-semibold ${
                mode === opt.key ? "text-accent" : ""
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

      {error ? (
        <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-[13px] text-loss">
          {error}
        </div>
      ) : null}

      {mode === "manual" ? (
        <Card>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError(null);
              try {
                const team = await apiCreateTeam({
                  name: name.trim(),
                  region,
                });
                router.push(`/teams/${team.id}`);
              } catch (err) {
                setError(
                  err instanceof ApiError ? err.message : "Failed to create team.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Team name">
              <TextInput
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. FNATIC"
                maxLength={120}
              />
            </Field>
            <Field label="Region">
              <Select
                options={REGIONS}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              />
            </Field>
            <p className="text-[12px] text-text-faint">
              Teams belong to your organization (Master Plan §51). For real
              teams, the vlr.gg import also fills rosters with real names,
              countries, and roles.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" onClick={() => router.push("/teams")}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Creating…" : "Create Team"}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card>
          <SectionTitle>Import from vlr.gg</SectionTitle>
          <p className="mt-1 text-[12px] text-text-dim">
            Search for a team, preview its roster, then import. Requires the
            vlrgg-scraper service (`VLR_BASE_URL`).
          </p>
          <div className="mt-3">
            <TextInput
              placeholder="Search teams on vlr.gg…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {searchError ? (
            <p className="mt-2 text-[12.5px] text-warning">{searchError}</p>
          ) : null}

          {searching ? (
            <p className="mt-3 text-[12.5px] text-text-faint">Searching…</p>
          ) : null}

          {results && results.length > 0 ? (
            <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {results.slice(0, 12).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">
                      {r.name}
                    </div>
                    {r.description ? (
                      <div className="truncate text-[11px] text-text-faint">
                        {r.description}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    disabled={previewing !== null}
                    onClick={() => {
                      setPreviewId(r.id);
                      previewTeam(r);
                    }}
                  >
                    {previewing === r.id ? "…" : "Preview"}
                  </Button>
                </li>
              ))}
            </ul>
          ) : results && query.trim().length >= 3 ? (
            <p className="mt-3 text-[12.5px] text-text-faint">
              No teams found for that query.
            </p>
          ) : null}

          {preview ? (
            <div className="mt-4 rounded-md border border-line bg-surface-2 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[14px] font-bold">{preview.name}</div>
                  <div className="text-[11.5px] text-text-dim">
                    {preview.region || "region unknown"} ·{" "}
                    {preview.country || "—"} · rank #{preview.rank}
                  </div>
                </div>
                <Badge tone="info">{preview.tag}</Badge>
              </div>
              <div className="mt-3 space-y-1 border-t border-line pt-2">
                {preview.roster.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-[12.5px]"
                  >
                    <span className="font-medium">{p.alias}</span>
                    <span className="text-text-dim">
                      {p.name || "—"}
                      {p.role ? ` · ${p.role}` : ""}
                    </span>
                  </div>
                ))}
                {preview.roster.length === 0 ? (
                  <p className="text-[12px] text-text-faint">
                    No roster listed.
                  </p>
                ) : null}
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="primary"
                  disabled={importing}
                  onClick={importTeam}
                >
                  {importing ? "Importing…" : "Import team + roster"}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
