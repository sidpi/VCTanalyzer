"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, LinkButton, ProgressBar, SectionTitle } from "@/components/ui";
import {
  apiCancelJob,
  apiGetJob,
  apiListMatchJobs,
  apiRetryJob,
  ApiError,
  useRequireAuth,
  type ApiJob,
} from "@/lib/api";
import { JOB_STAGE_ORDER, JOB_STAGE_LABELS, type JobStatus } from "@/lib/types";

/* Analysis processing page — polls the live job (Website Plan §15,
   Master Plan §39/§48). Job states come straight from the worker. */

const STAGE_INDEX: Record<string, number> = {
  UPLOADING: 0,
  QUEUED: 1,
  PREPROCESSING: 2,
  DETECTING_ROUNDS: 3,
  TRACKING_PLAYERS: 4,
  DETECTING_EVENTS: 5,
  GENERATING_ANALYTICS: 6,
  COMPLETED: 7,
  FAILED: -1,
  CANCELLED: -1,
};

function ProcessingInner() {
  const ready = useRequireAuth();
  const params = useParams<{ matchId: string }>();
  const search = useSearchParams();
  const matchId = params.matchId;
  const jobIdParam = search.get("job");

  const [job, setJob] = useState<ApiJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resolveJob = useCallback(async () => {
    try {
      if (jobIdParam) {
        return await apiGetJob(jobIdParam);
      }
      const jobs = await apiListMatchJobs(matchId);
      return jobs[0] ?? null;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load job.");
      return null;
    }
  }, [jobIdParam, matchId]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const tick = async () => {
      const j = await resolveJob();
      if (cancelled) return;
      setJob(j);
      const finished =
        j &&
        ["COMPLETED", "FAILED", "CANCELLED"].includes(j.status);
      if (finished && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    tick();
    pollRef.current = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [ready, resolveJob]);

  const retry = async () => {
    if (!job) return;
    setActionBusy(true);
    try {
      const j = await apiRetryJob(job.id);
      setJob(j);
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          setJob(await apiGetJob(job.id));
        }, 1500);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Retry failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    setActionBusy(true);
    try {
      setJob(await apiCancelJob(job.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Cancel failed.");
    } finally {
      setActionBusy(false);
    }
  };

  if (!ready) return null;

  if (error) {
    return (
      <Card className="border-loss/40">
        <p className="text-[13px] text-loss">{error}</p>
        <div className="mt-3">
          <LinkButton href={`/matches/${matchId}`}>Back to match</LinkButton>
        </div>
      </Card>
    );
  }
  if (!job) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-[13px] text-text-dim">Loading job…</p>
      </div>
    );
  }

  const finished = ["COMPLETED", "FAILED", "CANCELLED"].includes(job.status);
  const failed = job.status === "FAILED";
  const stageIdx = STAGE_INDEX[job.status] ?? 1;
  const progress = job.status === "COMPLETED" ? 100 : job.progress;
  const frames = job.total_frames
    ? Math.round((progress / 100) * job.total_frames)
    : job.frames_processed;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analyzing Match</h1>
        <p className="mt-0.5 text-[13px] text-text-dim">
          Job <span className="font-mono">{job.id.slice(0, 8)}</span> · model{" "}
          <span className="font-mono">{job.model_version}</span>
        </p>
      </div>

      {failed ? (
        <Card className="border-loss/40">
          <div className="flex items-center gap-2">
            <Badge tone="danger">Analysis failed</Badge>
            <span className="tabular text-[12px] text-text-dim">
              {JOB_STAGE_LABELS[job.status as JobStatus] ?? job.status} ·{" "}
              {job.progress}%
            </span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-text">
            {job.error ?? "The analysis worker reported a failure."}
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={retry} disabled={actionBusy}>
              Retry analysis
            </Button>
            <LinkButton href={`/matches/${matchId}`}>Back to match</LinkButton>
          </div>
        </Card>
      ) : job.status === "CANCELLED" ? (
        <Card>
          <Badge>Cancelled</Badge>
          <p className="mt-3 text-[13px] text-text-dim">
            This analysis was cancelled. You can retry it at any time.
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={retry} disabled={actionBusy}>
              Retry analysis
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-semibold">
              {JOB_STAGE_LABELS[job.status as JobStatus] ?? job.status}
            </span>
            <span className="tabular text-[19px] font-bold text-accent">
              {progress}%
            </span>
          </div>
          <ProgressBar value={progress} className="mt-3" />

          <div className="mt-6 space-y-2.5">
            {JOB_STAGE_ORDER.map((stage, i) => {
              const state =
                i < stageIdx ? "done" : i === stageIdx ? "active" : "pending";
              return (
                <div key={stage} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    className={
                      state === "done"
                        ? "text-win"
                        : state === "active"
                          ? "animate-pulse-dot text-info"
                          : "text-text-faint"
                    }
                  >
                    {state === "done" ? "✓" : state === "active" ? "●" : "○"}
                  </span>
                  <span
                    className={
                      state === "done"
                        ? "text-text-dim"
                        : state === "active"
                          ? "font-semibold text-text"
                          : "text-text-faint"
                    }
                  >
                    {JOB_STAGE_LABELS[stage]}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
            <div>
              <div className="tabular text-[16px] font-bold">
                {frames.toLocaleString()}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-text-faint">
                Frames processed
              </div>
            </div>
            <div>
              <div className="tabular text-[16px] font-bold">
                {job.total_frames ? `${job.total_frames.toLocaleString()}` : "—"}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-text-faint">
                Total frames
              </div>
            </div>
            <div>
              <div className="tabular text-[16px] font-bold">
                {Math.round(job.progress)}%
              </div>
              <div className="text-[11px] uppercase tracking-wide text-text-faint">
                Job progress
              </div>
            </div>
          </div>

          {!finished ? (
            <div className="mt-5 flex justify-center">
              <Button onClick={cancel} disabled={actionBusy}>
                Cancel analysis
              </Button>
            </div>
          ) : null}
        </Card>
      )}

      {job.status === "COMPLETED" ? (
        <Card>
          <SectionTitle>Analysis complete</SectionTitle>
          <p className="mt-2 text-[13px] text-text-dim">
            {job.frames_processed.toLocaleString()} frames processed. Rounds,
            events, and player positions are ready to explore.
          </p>
          <div className="mt-4">
            <LinkButton href={`/matches/${matchId}`} variant="primary">
              Open match analysis
            </LinkButton>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export default function ProcessingPage() {
  return (
    <Suspense fallback={<p className="text-[13px] text-text-dim">Loading…</p>}>
      <ProcessingInner />
    </Suspense>
  );
}
