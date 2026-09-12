"""VCTanalyzer FastAPI application (Master Plan §37-41)."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import analytics, auth, catalog, ingest, vods

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Valorant VOD analysis & tactical intelligence platform.",
)

# The frontend runs on localhost:3000 in dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(vods.router)
app.include_router(analytics.router)
app.include_router(ingest.router)


# Schema is owned by Alembic migrations (backend/alembic). Run:
#   alembic upgrade head
# before starting the API. This avoids drift between app metadata and the
# database and keeps history reproducible (Master Plan §53 spirit).


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "environment": settings.environment,
        "model_version": settings.model_version,
    }
