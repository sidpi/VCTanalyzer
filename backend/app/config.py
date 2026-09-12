from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Environment-driven configuration (12-factor, docker-compose defaults)."""

    app_name: str = "VCTanalyzer API"
    environment: str = "development"

    database_url: str = "postgresql+psycopg://vct:vct@localhost:5432/vctanalyzer"
    redis_url: str = "redis://localhost:6379/0"

    # Security (Master Plan §49)
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 24

    # Storage (Master Plan §40) — local dir now, S3/R2 later
    storage_dir: str = "./storage/vods"
    max_upload_bytes: int = 20 * 1024**3

    model_version: str = "model_v0-mock"

    # External integrations (optional — features degrade when unset, §42):
    # Twitch Helix for VOD import; vlrgg-scraper service for auto-fill.
    # YOUTUBE_API_KEY (Data API v3) is optional — adds VOD duration.
    twitch_client_id: str = ""
    twitch_client_secret: str = ""
    youtube_api_key: str = ""
    vlr_base_url: str = ""

    # Real media pipeline (Phase 2 step 1). When yt-dlp + ffmpeg are
    # installed, Twitch-sourced jobs download the VOD and detect rounds/map
    # from the actual video; otherwise the synthetic simulator runs.
    download_twitch_vods: bool = True
    max_vod_minutes: int = 120  # cap download/analysis length


@lru_cache
def get_settings() -> Settings:
    return Settings()
