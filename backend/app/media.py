"""Real media analysis for the worker — the first step of the Phase 2 CV
pipeline, done with standard tools so the loop is honest end-to-end.

Every function returns None / [] when its tool is missing, so the job
pipeline degrades to the synthetic simulator without crashing:

- `ffprobe_duration`        — real VOD duration
- `scene_boundaries`        — ffmpeg scene-cut detection → round start offsets
- `classify_map`            — dominant-color nearest-neighbor vs signatures
- `download_twitch_vod`     — yt-dlp download of a Twitch VOD to storage

Map classification compares the VOD's average frame color against seeded
signatures in `map_signatures.json`. The seed values are placeholders:
replace them with reference-frame palettes from the real game and the
classifier improves without code changes. It only overrides the match map
when confidence is high.
"""

import json
import re
import shutil
import subprocess
from pathlib import Path

_SCENE_RE = re.compile(r"pts_time:(\d+(?:\.\d+)?)")
_SIGNATURES_PATH = Path(__file__).parent / "map_signatures.json"

# Round-boundary heuristics (seconds).
MIN_ROUND_GAP = 40.0  # inter-round dead time is longer than in-round action
PRE_ROLL = 20.0  # ignore cuts before the pre-game lobby
BURST = 2.0  # ffmpeg often fires several cuts at one transition


def _which(name: str) -> str | None:
    return shutil.which(name)


def _ffmpeg_exe() -> str | None:
    """System ffmpeg, or the binary bundled with imageio-ffmpeg (pip)."""
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg  # type: ignore[import-not-found]

        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError):
        return None


# ------------------------------ duration ------------------------------------


_DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")


def ffprobe_duration(path: str | Path) -> float | None:
    """Real VOD duration in seconds, or None when no tool is available.

    Tries ffprobe first, then falls back to parsing `ffmpeg -i` output.
    """
    ffprobe = _which("ffprobe")
    if ffprobe is not None:
        try:
            out = subprocess.run(
                [
                    ffprobe, "-v", "error", "-show_entries",
                    "format=duration", "-of", "default=noprint_wrappers=1:nokey=1",
                    str(path),
                ],
                capture_output=True, text=True, timeout=120,
            )
            if out.returncode == 0:
                return float(out.stdout.strip())
        except (subprocess.TimeoutExpired, ValueError, OSError):
            pass

    ffmpeg = _ffmpeg_exe()
    if ffmpeg is None:
        return None
    try:
        out = subprocess.run(
            [ffmpeg, "-hide_banner", "-i", str(path)],
            capture_output=True, text=True, timeout=120,
        )
        m = _DURATION_RE.search(out.stderr or "")
        if m:
            h, mn, s = m.groups()
            return int(h) * 3600 + int(mn) * 60 + float(s)
    except (subprocess.TimeoutExpired, OSError, ValueError):
        pass
    return None


# --------------------------- scene detection --------------------------------


def scene_timestamps(
    path: str | Path, threshold: float = 0.30, max_seconds: int | None = None
) -> list[float]:
    """Scene-cut timestamps from ffmpeg (downscaled + 2fps for speed).

    Returns [] when ffmpeg is unavailable or the file can't be decoded.
    """
    ffmpeg = _ffmpeg_exe()
    if ffmpeg is None:
        return []
    # NOTE: showinfo logs at info level, so verbosity must not be `error`.
    cmd = [
        ffmpeg, "-hide_banner",
        "-i", str(path),
        "-vf", "scale=160:90,fps=2," f"select='gt(scene,{threshold})',showinfo",
        "-f", "null", "-",
    ]
    if max_seconds:
        cmd[2:2] = ["-t", str(max_seconds)]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    except (subprocess.TimeoutExpired, OSError):
        return []
    return [float(t) for t in _SCENE_RE.findall(out.stderr or "")]


def scene_boundaries(
    path: str | Path,
    max_rounds: int = 24,
    threshold: float = 0.30,
    max_seconds: int | None = None,
) -> list[float]:
    """Round-start offsets proposed from scene cuts.

    Strategy: suppress bursts (one cut per transition), ignore the pre-roll,
    then keep only cuts separated by >= MIN_ROUND_GAP — in-round action cuts
    are closer together than the inter-round break.
    """
    cuts = sorted(scene_timestamps(path, threshold=threshold, max_seconds=max_seconds))
    if not cuts:
        return []

    clean: list[float] = []
    for t in cuts:
        if t < PRE_ROLL:
            continue
        if not clean or t - clean[-1] > BURST:
            clean.append(t)

    boundaries: list[float] = []
    for t in clean:
        if not boundaries or t - boundaries[-1] >= MIN_ROUND_GAP:
            boundaries.append(t)
            if len(boundaries) >= max_rounds:
                break
    return boundaries


# ---------------------------- map classification ----------------------------


def load_signatures() -> dict[str, dict[str, float]]:
    try:
        with _SIGNATURES_PATH.open(encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def _sample_mean_color(path: str | Path, n_frames: int = 8) -> list[tuple[float, float, float]]:
    """Mean RGB (0-255) per sampled frame, [] when ffmpeg is unavailable."""
    ffmpeg = _ffmpeg_exe()
    if ffmpeg is None:
        return []
    cmd = [
        ffmpeg, "-v", "error", "-i", str(path),
        "-vf", "scale=64:64,fps=1/8",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=600)
    except (subprocess.TimeoutExpired, OSError):
        return []
    frame_bytes = 64 * 64 * 3
    frames = []
    for i in range(n_frames):
        chunk = out.stdout[i * frame_bytes : (i + 1) * frame_bytes]
        if len(chunk) < frame_bytes:
            break
        n = len(chunk) // 3
        r = sum(chunk[j] for j in range(0, len(chunk), 3)) / n
        g = sum(chunk[j] for j in range(1, len(chunk), 3)) / n
        b = sum(chunk[j] for j in range(2, len(chunk), 3)) / n
        frames.append((r, g, b))
    return frames


def classify_map(
    path: str | Path, min_confidence: float = 0.55
) -> tuple[str, float] | None:
    """Nearest-signature map guess + confidence, or None when undecided.

    Confidence is the inverse relative distance to the nearest signature;
    distant matches (everything looks alike) are rejected.
    """
    signatures = load_signatures()
    if not signatures:
        return None
    colors = _sample_mean_color(path)
    if not colors:
        return None
    avg = tuple(sum(c[i] for c in colors) / len(colors) for i in range(3))

    best_id, best_dist = None, float("inf")
    for map_id, sig in signatures.items():
        if not isinstance(sig, dict):  # skip metadata keys like _comment
            continue
        d = sum((avg[i] - sig[k]) ** 2 for i, k in enumerate(("r", "g", "b")))
        if d < best_dist:
            best_id, best_dist = map_id, d
    if best_id is None:
        return None
    # distance is squared RGB distance (0..~195k); map to 0..1 confidence.
    confidence = max(0.0, 1.0 - best_dist / (255.0 * 255.0 * 3.0))
    if confidence < min_confidence:
        return None
    return best_id, round(confidence, 3)


# ------------------------------ Twitch download -----------------------------


def _yt_dlp_download(url: str, dest_dir: str | Path, filename: str, height_cap: int) -> Path | None:
    """Shared yt-dlp download used by the Twitch and YouTube importers."""
    try:
        import yt_dlp  # type: ignore[import-not-found]
    except ImportError:
        return None

    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    tmpl = str(dest_dir / f"{filename}.%(ext)s")
    opts = {
        "format": f"best[height<={height_cap}]/best",
        "outtmpl": tmpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "retries": 2,
        "fragment_retries": 2,
        "socket_timeout": 15,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
    except Exception:  # noqa: BLE001 — any yt-dlp failure means no file
        return None

    # yt-dlp wrote the actual extension; find the newest file with our stem.
    candidates = sorted(
        dest_dir.glob(f"{filename}.*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def download_twitch_vod(
    url: str, dest_dir: str | Path, filename: str = "vod"
) -> Path | None:
    """Download a Twitch VOD via yt-dlp into dest_dir. Returns the file path
    or None when yt-dlp isn't installed or the download fails."""
    return _yt_dlp_download(url, dest_dir, filename, height_cap=1080)


def download_youtube_vod(
    url: str, dest_dir: str | Path, filename: str = "vod"
) -> Path | None:
    """Download a YouTube video via yt-dlp into dest_dir. Returns the file
    path or None when yt-dlp isn't installed or the download fails."""
    return _yt_dlp_download(url, dest_dir, filename, height_cap=1080)