"""FastAPI app.

Endpoints:
- GET /api/beaches                       list configured beaches
- GET /api/beaches/{id}/stats            latest count + busyness label
- GET /api/beaches/{id}/frame.jpg        most recent raw frame
- GET /api/beaches/{id}/overlay.jpg      frame + heatmap overlay
- GET /api/beaches/{id}/heatmap.jpg      heatmap alone (debug)
- GET /                                  the frontend
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config as cfg
from .analyzer import BeachAnalyzer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s: %(message)s",
)
log = logging.getLogger("beach-heatmap")

_analyzers: dict[str, BeachAnalyzer] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    for beach_id, beach in cfg.BEACHES.items():
        analyzer = BeachAnalyzer(beach)
        analyzer.start()
        _analyzers[beach_id] = analyzer
    log.info("Started %d analyzer(s)", len(_analyzers))
    try:
        yield
    finally:
        for analyzer in _analyzers.values():
            analyzer.stop()


app = FastAPI(title="Mallorca Beach Heatmap", lifespan=lifespan)


class BeachInfo(BaseModel):
    id: str
    name: str
    location: str


class BeachStats(BaseModel):
    id: str
    name: str
    people_count: int
    umbrella_count: int
    thatched_umbrella_count: int
    # Breakdown of people_count:
    sunbed_users: int
    sand_loungers: int
    standing: int
    busyness: str
    busyness_score: float
    frames_processed: int
    last_frame_age_seconds: float | None
    last_error: str | None


def _busyness_label(count: int) -> str:
    t = cfg.BUSY_THRESHOLDS
    if count <= t["quiet"]:
        return "quiet"
    if count <= t["moderate"]:
        return "moderate"
    if count <= t["busy"]:
        return "busy"
    return "packed"


def _get_analyzer(beach_id: str) -> BeachAnalyzer:
    analyzer = _analyzers.get(beach_id)
    if analyzer is None:
        raise HTTPException(status_code=404, detail=f"Unknown beach: {beach_id}")
    return analyzer


@app.get("/api/beaches", response_model=list[BeachInfo])
def list_beaches() -> list[BeachInfo]:
    return [BeachInfo(id=b.id, name=b.name, location=b.location) for b in cfg.BEACHES.values()]


@app.get("/api/beaches/{beach_id}/stats", response_model=BeachStats)
def beach_stats(beach_id: str) -> BeachStats:
    import time

    analyzer = _get_analyzer(beach_id)
    s = analyzer.state
    with s.lock:
        age = (time.time() - s.last_frame_time) if s.last_frame_time else None
        # General busyness score: persons weighted 1, coloured umbrellas
        # 1.5 each (each typically covers a small group), sunbed users
        # already inside person count so no double-count.
        score = s.last_people_count + 1.5 * s.last_umbrella_count
        return BeachStats(
            id=analyzer.beach.id,
            name=analyzer.beach.name,
            people_count=s.last_people_count,
            umbrella_count=s.last_umbrella_count,
            thatched_umbrella_count=s.last_thatched_umbrella_count,
            sunbed_users=s.last_sunbed_users,
            sand_loungers=s.last_sand_loungers,
            standing=s.last_standing,
            busyness=_busyness_label(s.last_people_count),
            busyness_score=score,
            frames_processed=s.frames_processed,
            last_frame_age_seconds=age,
            last_error=s.last_error,
        )


def _serve_jpeg(payload: bytes | None) -> Response:
    if not payload:
        # 204 No Content while we wait for the first frame.
        return Response(status_code=204)
    return Response(
        content=payload,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/beaches/{beach_id}/frame.jpg")
def beach_frame(beach_id: str) -> Response:
    s = _get_analyzer(beach_id).state
    with s.lock:
        return _serve_jpeg(s.last_frame_jpeg)


@app.get("/api/beaches/{beach_id}/overlay.jpg")
def beach_overlay(beach_id: str) -> Response:
    s = _get_analyzer(beach_id).state
    with s.lock:
        return _serve_jpeg(s.last_overlay_jpeg)


@app.get("/api/beaches/{beach_id}/heatmap.jpg")
def beach_heatmap(beach_id: str) -> Response:
    s = _get_analyzer(beach_id).state
    with s.lock:
        return _serve_jpeg(s.last_density_jpeg)


# Frontend (served from ../frontend relative to this file).
_FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if _FRONTEND_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=_FRONTEND_DIR), name="static")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(_FRONTEND_DIR / "index.html")
