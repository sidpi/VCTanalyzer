"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { TacticalMapViewer, type TacticalMapHandle } from "./TacticalMapViewer";
import { getRounds } from "@/lib/mockData";
import {
  formatMinutesSeconds,
  parseTimeString,
  roundStartTimeFor,
} from "@/lib/vod";
import { formatTime } from "@/lib/format";
import { API_BASE, getToken } from "@/lib/api";
import type { PlayerTrack, RoundEvent } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* RoundTheater — VOD-synchronized tactical replay (Master Plan §23)   */
/*                                                                     */
/*   VOD Timestamp ↕ Round Timestamp ↕ Event Timestamp ↕ Map State     */
/*                                                                     */
/* The VOD player is the single source of truth. One rAF clock reads   */
/* its time; the tactical map runs in controlled mode from the mapped  */
/* round time. Sources: uploaded file (streamed from the API) or a     */
/* Twitch VOD/clip (embedded player, SDK-synced when available). If    */
/* nothing can load (offline demo), a fallback wall-clock keeps the    */
/* experience working.                                                 */
/* ------------------------------------------------------------------ */

const DEMO_VOD_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const SPEEDS = [0.5, 1, 2, 4] as const;

/* ------------------------ YouTube iframe API ----------------------- */

/* We drive the privacy-enhanced youtube-nocookie iframe through its
   postMessage API (enablejsapi=1) instead of loading the full IFrame API
   script — one less dependency, same clock fidelity. */

interface YouTubePlayerLike {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(t: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setPlaybackRate(r: number): void;
}

function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  const w = window as unknown as {
    YT?: { Player?: unknown };
    onYouTubeIframeAPIReady?: () => void;
  };
  if (w.YT?.Player) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-vct-yt-api]",
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("yt api error")));
      return;
    }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.setAttribute("data-vct-yt-api", "1");
    s.onload = () => {
      /* onYouTubeIframeAPIReady fires */
    };
    s.onerror = () => reject(new Error("yt api error"));
    document.body.appendChild(s);
    // The API usually defines window.YT before the ready callback; if it's
    // already there when the script loads, resolve immediately.
    setTimeout(() => {
      if (w.YT?.Player) resolve();
    }, 1500);
  });
}

function extractYouTubeId(url: string): string | null {
  return (
    /[?&]v=([A-Za-z0-9_-]{6,20})/.exec(url)?.[1] ??
    /youtu\.be\/([A-Za-z0-9_-]{6,20})/.exec(url)?.[1] ??
    /youtube\.com\/(?:embed|live|shorts)\/([A-Za-z0-9_-]{6,20})/.exec(url)?.[1] ??
    null
  );
}

/* ------------------------- Twitch embed SDK ------------------------ */

interface TwitchPlayerLike {
  play(): void;
  pause(): void;
  seek(t: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  setPlaybackRate?(r: number): void;
  addEventListener(event: string, cb: () => void): void;
}

interface TwitchPlayerCtor {
  new (el: string, opts: Record<string, unknown>): TwitchPlayerLike;
  READY?: string;
}

declare global {
  interface Window {
    Twitch?: { Player: TwitchPlayerCtor };
  }
}

function loadTwitchSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.Twitch?.Player) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-vct-twitch-sdk]",
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("sdk error")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://embed.twitch.tv/embed/v1.js";
    s.async = true;
    s.setAttribute("data-vct-twitch-sdk", "1");
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("sdk error"));
    document.body.appendChild(s);
  });
}

export interface RoundTheaterHandle {
  jumpToEvent: (e: RoundEvent) => void;
  seekVod: (t: number) => void;
  pause: () => void;
}

function clamp(t: number, min: number, max: number) {
  return Math.max(min, Math.min(max, t));
}

export function RoundTheater({
  matchId,
  roundNumber,
  height = 460,
  ref,
  liveTracks = null,
  liveEvents = null,
  liveDuration = null,
  liveMapId = "ascent",
  liveVodStart = null,
  vodSource = null,
  vodFileId = null,
  vodEmbedUrl = null,
}: {
  matchId: string;
  roundNumber: number;
  height?: number;
  ref?: RefObject<RoundTheaterHandle | null>;
  /** Live API data — when provided, the mock dataset is not used. */
  liveTracks?: PlayerTrack[] | null;
  liveEvents?: RoundEvent[] | null;
  liveDuration?: number | null;
  liveMapId?: string;
  /** CV-derived round start in the VOD (Master Plan §23). */
  liveVodStart?: number | null;
  /** Where the VOD comes from: uploaded file, Twitch/YouTube link, or demo. */
  vodSource?: "upload" | "twitch" | "youtube" | null;
  /** VOD row id when source === "upload" (streamed from the API). */
  vodFileId?: string | null;
  /** Original Twitch URL when source === "twitch". */
  vodEmbedUrl?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mapRef = useRef<TacticalMapHandle | null>(null);
  const playerRef = useRef<TwitchPlayerLike | null>(null);
  const ytPlayerRef = useRef<YouTubePlayerLike | null>(null);

  const mockRound = useMemo(
    () => getRounds(matchId).find((r) => r.number === roundNumber) ?? null,
    [matchId, roundNumber],
  );
  const duration = liveDuration ?? mockRound?.duration ?? 100;

  // Round → VOD offset: real detection value when available, otherwise the
  // deterministic mock estimate, user-correctable either way (§44).
  const [detectedStart, setDetectedStart] = useState(() =>
    roundStartTimeFor(matchId, roundNumber),
  );
  const [offsetInput, setOffsetInput] = useState<string | null>(null);
  const roundStart =
    liveVodStart ??
    (offsetInput !== null
      ? (parseTimeString(offsetInput) ?? detectedStart)
      : detectedStart);

  const [vodTime, setVodTime] = useState(0);
  const [vodDuration, setVodDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [videoFailed, setVideoFailed] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.55);
  const [focusEventId, setFocusEventId] = useState<string | null>(null);

  /* ---------------- resolve the active playback source ---------------- */

  const twitchVideoId =
    vodSource === "twitch" && vodEmbedUrl
      ? (/twitch\.tv\/videos\/(\d+)/i.exec(vodEmbedUrl)?.[1] ?? null)
      : null;
  const twitchClipSlug =
    vodSource === "twitch" && vodEmbedUrl
      ? (/clips\.twitch\.tv\/([A-Za-z0-9_-]+)/i.exec(vodEmbedUrl)?.[1] ??
        /twitch\.tv\/[^/]+\/clip\/([A-Za-z0-9_-]+)/i.exec(vodEmbedUrl)?.[1] ??
        null)
      : null;
  const isTwitch =
    vodSource === "twitch" && !!(twitchVideoId || twitchClipSlug);
  const youtubeVideoId =
    vodSource === "youtube" && vodEmbedUrl ? extractYouTubeId(vodEmbedUrl) : null;
  const isYouTube = vodSource === "youtube" && !!youtubeVideoId;
  const isUpload = vodSource === "upload" && !!vodFileId;
  const usingDemo = !isTwitch && !isYouTube && !isUpload;

  const uploadSrc =
    isUpload && vodFileId
      ? `${API_BASE}/vods/${vodFileId}/file?token=${getToken() ?? ""}`
      : null;
  const videoSrc = uploadSrc ?? DEMO_VOD_URL;

  const [twitchReady, setTwitchReady] = useState(false);
  const [twitchFailed, setTwitchFailed] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const [ytFailed, setYtFailed] = useState(false);

  // Round changes: reset offset + transport (+ player state).
  useEffect(() => {
    setDetectedStart(roundStartTimeFor(matchId, roundNumber));
    setOffsetInput(null);
    setVodTime(0);
    setPlaying(false);
    setFocusEventId(null);
    setVideoFailed(false);
    setTwitchReady(false);
    setTwitchFailed(false);
    setYtReady(false);
    setYtFailed(false);
    setVodDuration(0);
  }, [matchId, roundNumber]);

  // Create the Twitch player once the SDK loads (guarded: if the embed is
  // blocked or READY never fires, fall back to the synthetic clock).
  useEffect(() => {
    if (!isTwitch) return;
    let cancelled = false;
    let ready = false;
    setTwitchReady(false);
    setTwitchFailed(false);

    loadTwitchSdk()
      .then(() => {
        if (cancelled) return;
        const Player = window.Twitch?.Player;
        if (!Player) throw new Error("Twitch SDK unavailable");
        const p = new Player("twitch-theater-embed", {
          video: twitchVideoId ?? undefined,
          clip: twitchClipSlug ?? undefined,
          parent: [window.location.hostname],
          autoplay: false,
          width: "100%",
          height: "100%",
        });
        playerRef.current = p;
        p.addEventListener(Player.READY ?? "ready", () => {
          ready = true;
          if (cancelled) return;
          setTwitchReady(true);
          try {
            setVodDuration(p.getDuration());
          } catch {
            /* duration optional */
          }
        });
        setTimeout(() => {
          if (!cancelled && !ready) setTwitchFailed(true);
        }, 8000);
      })
      .catch(() => {
        if (!cancelled) setTwitchFailed(true);
      });

    return () => {
      cancelled = true;
      playerRef.current = null;
    };
  }, [isTwitch, twitchVideoId, twitchClipSlug, roundNumber]);

  // Create the YouTube player once the IFrame API loads.
  useEffect(() => {
    if (!isYouTube || !youtubeVideoId) return;
    let cancelled = false;
    let ready = false;
    setYtReady(false);
    setYtFailed(false);

    loadYouTubeIframeApi()
      .then(() => {
        if (cancelled) return;
        const YT = (
          window as unknown as {
            YT?: {
              Player: new (
                el: HTMLElement,
                opts: Record<string, unknown>,
              ) => YouTubePlayerLike & {
                addEventListener(e: string, cb: () => void): void;
              };
              PlayerState?: { ENDED?: number };
            };
          }
        ).YT;
        if (!YT?.Player) throw new Error("YouTube API unavailable");
        const el = document.getElementById("youtube-theater-embed");
        if (!el) throw new Error("YouTube mount missing");
        const p = new YT.Player(el, {
          videoId: youtubeVideoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            autoplay: 0,
            enablejsapi: 1,
            origin: window.location.origin,
            rel: 0,
          },
        });
        ytPlayerRef.current = p;
        p.addEventListener("ready", () => {
          ready = true;
          if (cancelled) return;
          setYtReady(true);
          try {
            setVodDuration(p.getDuration());
          } catch {
            /* duration optional */
          }
        });
        p.addEventListener("error", () => {
          if (!cancelled) setYtFailed(true);
        });
        setTimeout(() => {
          if (!cancelled && !ready) setYtFailed(true);
        }, 10000);
      })
      .catch(() => {
        if (!cancelled) setYtFailed(true);
      });

    return () => {
      cancelled = true;
      ytPlayerRef.current = null;
    };
  }, [isYouTube, youtubeVideoId, roundNumber]);

  // Apply playback rate: <video> directly, Twitch/YouTube clamped to 2x.
  useEffect(() => {
    if (isTwitch) {
      if (twitchReady && playerRef.current?.setPlaybackRate) {
        try {
          playerRef.current.setPlaybackRate(Math.min(speed, 2));
        } catch {
          /* rate control optional on embeds */
        }
      }
      return;
    }
    if (isYouTube) {
      if (ytReady && ytPlayerRef.current) {
        try {
          ytPlayerRef.current.setPlaybackRate(Math.min(speed, 2));
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, isTwitch, twitchReady, isYouTube, ytReady]);

  // The clock: while playing, mirror the player's time into state.
  // Without a loadable VOD, advance a synthetic clock instead.
  const syntheticClock =
    (videoFailed && !isTwitch && !isYouTube) ||
    (isTwitch && twitchFailed) ||
    (isYouTube && ytFailed);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (syntheticClock) {
        setVodTime((t) => t + dt * speed);
      } else if (isTwitch) {
        try {
          const t = playerRef.current?.getCurrentTime();
          if (t !== undefined) setVodTime(t);
        } catch {
          setTwitchFailed(true);
        }
      } else if (isYouTube) {
        try {
          const t = ytPlayerRef.current?.getCurrentTime();
          if (t !== undefined) setVodTime(t);
        } catch {
          setYtFailed(true);
        }
      } else {
        const v = videoRef.current;
        if (v) setVodTime(v.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, syntheticClock, isTwitch, isYouTube, speed]);

  const seekVod = useCallback(
    (t: number) => {
      const max = vodDuration || Infinity;
      const target = clamp(t, 0, max);
      if (isTwitch) {
        if (twitchReady) {
          try {
            playerRef.current?.seek(target);
          } catch {
            setTwitchFailed(true);
          }
        }
        setVodTime(target);
        return;
      }
      if (isYouTube) {
        if (ytReady && ytPlayerRef.current) {
          try {
            ytPlayerRef.current.seekTo(target, true);
          } catch {
            setYtFailed(true);
          }
        }
        setVodTime(target);
        return;
      }
      const v = videoRef.current;
      if (v && !videoFailed) v.currentTime = target;
      setVodTime(target);
    },
    [vodDuration, videoFailed, isTwitch, twitchReady, isYouTube, ytReady],
  );

  const pause = useCallback(() => {
    if (isTwitch) {
      try {
        playerRef.current?.pause();
      } catch {
        /* ignore */
      }
    } else if (isYouTube) {
      try {
        ytPlayerRef.current?.pauseVideo();
      } catch {
        /* ignore */
      }
    } else {
      videoRef.current?.pause();
    }
    setPlaying(false);
  }, [isTwitch, isYouTube]);

  const play = useCallback(() => {
    setPlaying(true);
    if (isTwitch) {
      if (twitchReady) {
        try {
          playerRef.current?.play();
        } catch {
          setTwitchFailed(true);
        }
      }
      return;
    }
    if (isYouTube) {
      if (ytReady && ytPlayerRef.current) {
        try {
          ytPlayerRef.current.playVideo();
        } catch {
          setYtFailed(true);
        }
      }
      return;
    }
    const v = videoRef.current;
    if (v && !videoFailed) v.play().catch(() => setVideoFailed(true));
  }, [isTwitch, twitchReady, isYouTube, ytReady, videoFailed]);

  const roundTime = vodTime - roundStart;
  const inWindow = roundTime >= -2 && roundTime <= duration + 3;
  const mapTime = clamp(roundTime, 0, duration);

  // Master Plan §23: clicking an event jumps VOD + map to its timestamp and
  // highlights it, pausing for inspection.
  const jumpToEvent = useCallback(
    (e: RoundEvent) => {
      setFocusEventId(e.id);
      seekVod(roundStart + Math.max(0, e.time - 1.5));
      pause();
    },
    [roundStart, seekVod, pause],
  );

  useImperativeHandle(ref ?? null, () => ({ jumpToEvent, seekVod, pause }), [
    jumpToEvent,
    seekVod,
    pause,
  ]);

  // Keyboard: space play/pause, ←/→ seek VOD, B back to round start,
  // O toggles overlay compare. Disabled while typing in the offset field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT")
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        playing ? pause() : play();
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seekVod(vodTime + (e.shiftKey ? 5 : 1));
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekVod(vodTime - (e.shiftKey ? 5 : 1));
      } else if (e.code === "KeyB") {
        seekVod(roundStart);
      } else if (e.code === "KeyO") {
        setOverlay((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, pause, play, seekVod, vodTime, roundStart]);

  const applyOffset = () => {
    const parsed = parseTimeString(offsetInput ?? "");
    if (parsed !== null) {
      setOffsetInput(String(parsed)); // normalized seconds string
      seekVod(parsed);
    }
  };

  /* ------------------------------ stage ------------------------------ */

  const fallbackPanel = usingDemo ? (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="text-[14px] font-semibold text-warning">
        VOD preview unavailable
      </div>
      <p className="max-w-xs text-[12.5px] leading-relaxed text-text-dim">
        The demo stream couldn&apos;t be loaded. The tactical map keeps playing
        on a synthetic clock — upload a real VOD once storage is connected.
      </p>
    </div>
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="text-[14px] font-semibold text-warning">
        {isTwitch
          ? "Twitch player unavailable"
          : isYouTube
            ? "YouTube player unavailable"
            : "VOD playback unavailable"}
      </div>
      <p className="max-w-xs text-[12.5px] leading-relaxed text-text-dim">
        {isTwitch
          ? "The Twitch embed couldn't load (network or domain restrictions). The tactical map keeps playing on a synthetic clock."
          : isYouTube
            ? "The YouTube embed couldn't load (video unavailable or blocked). The tactical map keeps playing on a synthetic clock."
            : "The stored file couldn't be played. The tactical map keeps working — check the VOD file in storage."}
      </p>
    </div>
  );

  const stageContent = isTwitch ? (
    <>
      <div id="twitch-theater-embed" className="h-full w-full" />
      {twitchFailed ? (
        <div className="absolute inset-0 bg-black">{fallbackPanel}</div>
      ) : null}
    </>
  ) : isYouTube ? (
    <>
      <div id="youtube-theater-embed" className="h-full w-full" />
      {ytFailed ? (
        <div className="absolute inset-0 bg-black">{fallbackPanel}</div>
      ) : null}
    </>
  ) : videoFailed ? (
    fallbackPanel
  ) : (
    <video
      ref={videoRef}
      src={videoSrc}
      preload="metadata"
      playsInline
      className="absolute inset-0 h-full w-full object-cover"
      onTimeUpdate={() => {
        const v = videoRef.current;
        if (v) setVodTime(v.currentTime);
      }}
      onLoadedMetadata={() => {
        const v = videoRef.current;
        if (v) setVodDuration(v.duration);
      }}
      onError={() => setVideoFailed(true)}
      onClick={() => (playing ? pause() : play())}
    />
  );

  return (
    <div className="space-y-3">
      {/* Stage: VOD + tactical map (side-by-side or overlay-compare) */}
      {overlay ? (
        <div
          className="relative w-full overflow-hidden rounded-md border border-line bg-black"
          style={{ height }}
        >
          {stageContent}
          <div
            className="absolute inset-0"
            style={{ opacity: overlayOpacity }}
          >
            <TacticalMapViewer
              matchId={matchId}
              roundNumber={roundNumber}
              height={height}
              interactive
              focusEventId={focusEventId}
              externalTime={mapTime}
              onSeekRequest={(t) => seekVod(roundStart + t)}
              onScrubStartRequest={pause}
              liveTracks={liveTracks}
              liveEvents={liveEvents}
              liveDuration={liveDuration}
              mapId={liveMapId}
            />
          </div>
          {/* Sync state chip (Website Plan §36) */}
          <div className="pointer-events-none absolute right-2 top-2 z-20">
            <SyncChip inWindow={inWindow} />
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div
            className="relative w-full overflow-hidden rounded-md border border-line bg-black"
            style={{ height }}
          >
            {stageContent}
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 font-mono text-[11px] text-text-dim">
              VOD {formatMinutesSeconds(vodTime)}
              {vodDuration ? ` / ${formatMinutesSeconds(vodDuration)}` : ""}
            </div>
            <div className="pointer-events-none absolute right-2 top-2">
              <SyncChip inWindow={inWindow} />
            </div>
          </div>

          <TacticalMapViewer
            matchId={matchId}
            roundNumber={roundNumber}
            height={height}
            interactive
            focusEventId={focusEventId}
            externalTime={mapTime}
            onSeekRequest={(t) => seekVod(roundStart + t)}
            onScrubStartRequest={pause}
            liveTracks={liveTracks}
            liveEvents={liveEvents}
            liveDuration={liveDuration}
            mapId={liveMapId}
          />
        </div>
      )}

      {/* Unified transport controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-line bg-surface px-3 py-2.5">
        <button
          className="cursor-pointer rounded bg-accent px-3 py-1 text-[13px] font-semibold text-white hover:bg-accent/85"
          onClick={() => {
            if (!inWindow) seekVod(roundStart);
            playing ? pause() : play();
          }}
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>

        <button
          className="cursor-pointer rounded px-1.5 py-1 font-mono text-[12px] text-text-dim hover:text-text"
          title="Jump to round start (B)"
          onClick={() => seekVod(roundStart)}
        >
          ⏮ Round
        </button>

        <button
          className="cursor-pointer rounded px-1.5 py-1 font-mono text-[12px] text-text-dim hover:text-text"
          title="Back 5s (shift+←)"
          onClick={() => seekVod(vodTime - 5)}
        >
          −5s
        </button>
        <button
          className="cursor-pointer rounded px-1.5 py-1 font-mono text-[12px] text-text-dim hover:text-text"
          title="Forward 5s (shift+→)"
          onClick={() => seekVod(vodTime + 5)}
        >
          +5s
        </button>

        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`cursor-pointer rounded px-2 py-0.5 font-mono text-[12px] ${
                speed === s
                  ? "bg-accent-soft text-accent"
                  : "text-text-dim hover:text-text"
              }`}
              onClick={() => setSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-line" />

        <div className="flex items-center gap-2 font-mono text-[11.5px] text-text-dim">
          <span
            className={inWindow ? "text-win" : "text-warning"}
            title="Time within the current round"
          >
            R {formatTime(Math.max(0, mapTime))}
          </span>
          <span className="text-text-faint">
            starts {formatMinutesSeconds(roundStart)}
          </span>
        </div>

        {/* Offset correction (Master Plan §23 + §44 spirit: user-fixable) */}
        <label className="flex items-center gap-1.5 text-[11px] text-text-faint">
          <span className="uppercase tracking-wide">Round starts at</span>
          <input
            value={offsetInput ?? formatMinutesSeconds(roundStart)}
            onChange={(e) => setOffsetInput(e.target.value)}
            placeholder="m:ss"
            className="w-16 rounded border border-line-2 bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-text focus:border-accent focus:outline-none"
          />
          <button
            className="cursor-pointer text-info hover:underline"
            onClick={applyOffset}
          >
            Apply
          </button>
        </label>

        <div className="h-4 w-px bg-line" />

        <button
          className={`cursor-pointer rounded px-2 py-0.5 text-[12px] font-medium ${
            overlay ? "bg-accent-soft text-accent" : "text-text-dim hover:text-text"
          }`}
          title="Overlay the tactical map on the VOD (O)"
          onClick={() => setOverlay(!overlay)}
        >
          Overlay
        </button>
        {overlay ? (
          <input
            type="range"
            min={0.15}
            max={1}
            step={0.05}
            value={overlayOpacity}
            onChange={(e) => setOverlayOpacity(Number(e.target.value))}
            className="w-24 accent-[var(--color-accent)]"
            aria-label="Map overlay opacity"
          />
        ) : null}

        {!inWindow ? (
          <button
            className="cursor-pointer rounded border border-warning/40 bg-warning/10 px-2 py-0.5 text-[12px] font-medium text-warning"
            onClick={() => seekVod(roundStart)}
          >
            Out of round window — jump back
          </button>
        ) : null}

        {vodSource ? (
          <span className="ml-auto font-mono text-[11px] text-text-faint">
            {isTwitch
              ? `Twitch${vodEmbedUrl?.includes("/clip") ? " clip" : " VOD"}`
              : isYouTube
                ? "YouTube VOD"
                : "Uploaded file"}
          </span>
        ) : (
          <span className="ml-auto font-mono text-[11px] text-text-faint">
            Demo stream
          </span>
        )}
      </div>

      <p className="text-[11.5px] leading-relaxed text-text-faint">
        Sync: the VOD clock drives the tactical map (Master Plan §23). Clicking
        any event seeks both the video and the map. If the detected round start
        drifts, correct it with &ldquo;Round starts at&rdquo; — corrections
        will feed the labeling pipeline (Master Plan §44–45).
      </p>
    </div>
  );
}

function SyncChip({ inWindow }: { inWindow: boolean }) {
  return (
    <span
      className={`rounded px-2 py-0.5 font-mono text-[11px] ${
        inWindow
          ? "bg-win/15 text-win"
          : "bg-warning/15 text-warning"
      }`}
    >
      {inWindow ? "SYNCED" : "OUT OF ROUND"}
    </span>
  );
}
