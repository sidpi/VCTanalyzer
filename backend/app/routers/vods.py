"""VOD upload + analysis jobs (/vods, /analysis — Master Plan §41)."""

import shutil
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import get_settings
from ..db import get_db
from ..security import (
    decode_token,
    ensure_org_access,
    get_current_user,
    require_org_id,
)
from ..tasks import enqueue_analysis

router = APIRouter(tags=["vods"])

ALLOWED_SUFFIXES = {".mp4", ".mkv", ".mov", ".webm"}


@router.post("/vods/upload", response_model=schemas.JobOut, status_code=201)
def upload_vod(
    match_id: str,
    file: UploadFile = File(...),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a VOD for a match, store it, and enqueue an analysis job
    (Master Plan §39: analysis never runs inside the HTTP request)."""
    settings = get_settings()
    match = db.get(models.Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    ensure_org_access(user, match.organization_id)

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported video format. Allowed: {sorted(ALLOWED_SUFFIXES)}",
        )

    data = file.file.read()
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File exceeds size limit")

    storage = Path(settings.storage_dir)
    storage.mkdir(parents=True, exist_ok=True)

    vod = models.Vod(
        match_id=match.id,
        storage_key="",  # set after we know the id
        filename=file.filename or "vod",
        size_bytes=len(data),
        content_type=file.content_type or "",
    )
    db.add(vod)
    db.flush()

    vod.storage_key = f"vods/{vod.id}{suffix}"
    dest = storage / vod.storage_key
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as fh:
        fh.write(data)
    db.add(vod)
    db.commit()

    job = models.AnalysisJob(
        match_id=match.id,
        organization_id=match.organization_id,
        vod_id=vod.id,
        status=models.JobStatus.QUEUED,
        model_version=settings.model_version,
    )
    db.add(job)
    db.commit()

    enqueue_analysis(job.id)
    return job


@router.get("/vods/{vod_id}/file")
def stream_vod(
    vod_id: str,
    token: str = "",
    db: Session = Depends(get_db),
):
    """Stream a stored VOD file with HTTP Range support (seekable <video>).

    Browsers can't attach Authorization headers to <video src>, so playback
    uses the same JWT as a `token` query parameter instead.
    """
    payload = decode_token(token) if token else None
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or missing token")

    vod = db.get(models.Vod, vod_id)
    if vod is None or vod.source != "upload":
        raise HTTPException(status_code=404, detail="VOD not found")
    match = db.get(models.Match, vod.match_id)
    user = db.get(models.User, str(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown user")
    ensure_org_access(user, match.organization_id if match else None)

    path = Path(get_settings().storage_dir) / vod.storage_key
    if not path.is_file():
        raise HTTPException(status_code=404, detail="VOD file missing from storage")
    return FileResponse(
        path, media_type=vod.content_type or "video/mp4", filename=vod.filename
    )


@router.get("/analysis/jobs/{job_id}", response_model=schemas.JobOut)
def get_job(
    job_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.get(models.AnalysisJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    ensure_org_access(user, job.organization_id)
    return job


@router.get("/matches/{match_id}/jobs", response_model=list[schemas.JobOut])
def list_match_jobs(
    match_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    match = db.get(models.Match, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    ensure_org_access(user, match.organization_id)
    return (
        db.query(models.AnalysisJob)
        .filter(models.AnalysisJob.match_id == match_id)
        .order_by(models.AnalysisJob.created_at.desc())
        .all()
    )


@router.post("/analysis/jobs/{job_id}/cancel", response_model=schemas.JobOut)
def cancel_job(
    job_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.get(models.AnalysisJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    ensure_org_access(user, job.organization_id)
    if job.status in (models.JobStatus.COMPLETED, models.JobStatus.FAILED):
        raise HTTPException(status_code=409, detail="Job already finished")
    job.status = models.JobStatus.CANCELLED
    db.commit()
    return job


@router.post("/analysis/jobs/{job_id}/retry", response_model=schemas.JobOut)
def retry_job(
    job_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.get(models.AnalysisJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    ensure_org_access(user, job.organization_id)
    if job.status not in (models.JobStatus.FAILED, models.JobStatus.CANCELLED):
        raise HTTPException(status_code=409, detail="Job is not in a retryable state")
    job.status = models.JobStatus.QUEUED
    job.progress = 0
    job.error = None
    db.commit()
    enqueue_analysis(job.id)
    return job
