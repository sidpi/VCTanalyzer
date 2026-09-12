import { Badge, Card, SectionTitle, StatCard } from "@/components/ui";
import { JOBS, MATCHES, getTeam } from "@/lib/mockData";
import { JOB_STAGE_LABELS } from "@/lib/types";

/* Admin panel (Website Plan §37) */

function jobTone(status: string) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "FAILED") return "danger" as const;
  if (status === "CANCELLED") return "neutral" as const;
  return "info" as const;
}

export default function AdminPage() {
  const active = JOBS.filter(
    (j) => !["COMPLETED", "FAILED", "CANCELLED"].includes(j.status),
  ).length;
  const failed = JOBS.filter((j) => j.status === "FAILED").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="mt-0.5 text-[13px] text-text-dim">
          Analysis jobs, models, and system health.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active jobs" value={active} tone="info" />
        <StatCard label="Failed jobs" value={failed} tone={failed ? "loss" : "win"} />
        <StatCard label="Total matches" value={MATCHES.length} />
        <StatCard label="GPU workers online" value="2 / 2" tone="win" />
      </div>

      <Card padded={false}>
        <div className="border-b border-line px-4 py-3">
          <SectionTitle>Analysis jobs</SectionTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-text-faint">
                <th className="px-4 py-2 font-semibold">Job</th>
                <th className="px-4 py-2 font-semibold">Match</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Progress</th>
                <th className="px-4 py-2 font-semibold">Model</th>
                <th className="px-4 py-2 font-semibold">Duration</th>
                <th className="px-4 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {JOBS.map((j) => {
                const m = MATCHES.find((mm) => mm.id === j.matchId);
                const a = m ? getTeam(m.teamAId) : undefined;
                const b = m ? getTeam(m.teamBId) : undefined;
                return (
                  <tr key={j.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[12px]">{j.id}</td>
                    <td className="px-4 py-2.5">
                      {a?.name} vs {b?.name}
                      <span className="ml-2 text-[11px] text-text-faint">{m?.map}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={jobTone(j.status)}>
                        {JOB_STAGE_LABELS[j.status]}
                      </Badge>
                    </td>
                    <td className="tabular px-4 py-2.5">{j.progress}%</td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-text-dim">
                      {j.modelVersion}
                    </td>
                    <td className="tabular px-4 py-2.5 text-text-dim">
                      {Math.round(j.durationSeconds / 60)} min
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {j.status === "FAILED" ? (
                        <button className="cursor-pointer text-[12px] font-medium text-info hover:underline">
                          Retry
                        </button>
                      ) : j.status === "COMPLETED" ? (
                        <button className="cursor-pointer text-[12px] text-text-dim hover:text-text">
                          Re-run
                        </button>
                      ) : (
                        <button className="cursor-pointer text-[12px] text-loss hover:underline">
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <SectionTitle>Models</SectionTitle>
          <div className="mt-3 space-y-2 text-[13px]">
            {[
              ["model_v4-rc", "Minimap detector retrained · eval pending"],
              ["model_v3", "Production · tracking 96% · events 91%"],
              ["model_v2", "Archived"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0">
                <span className="font-mono text-[12.5px]">{k}</span>
                <span className="text-right text-text-dim">{v}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle>System health</SectionTitle>
          <div className="mt-3 space-y-2 text-[13px]">
            {[
              ["Queue depth", "1 job", "win"],
              ["Object storage", "412 GB used", "neutral"],
              ["PostgreSQL", "Healthy · 218 rounds", "win"],
              ["Redis", "Healthy", "win"],
              ["FFmpeg workers", "2 online", "win"],
            ].map(([k, v, tone]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0">
                <span className="text-text-dim">{k}</span>
                <Badge tone={tone === "win" ? "success" : "neutral"}>{v}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
