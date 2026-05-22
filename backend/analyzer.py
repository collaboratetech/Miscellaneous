"""The per-beach analysis loop.

A background thread reads frames from a YouTube live stream, runs YOLO
person detection, feeds detections into the heatmap accumulator, and
caches the latest source frame + composited overlay as JPEG bytes for
the HTTP layer to serve.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field

import cv2
import numpy as np

from . import config as cfg
from .detect import detect_people
from .heatmap import HeatmapAccumulator, render_overlay
from .stream import FrameSource, LocalImageCapture, YouTubeLiveCapture

log = logging.getLogger(__name__)


@dataclass
class BeachState:
    last_frame_jpeg: bytes | None = None
    last_overlay_jpeg: bytes | None = None
    last_density_jpeg: bytes | None = None
    last_frame_time: float = 0.0
    last_people_count: int = 0
    frames_processed: int = 0
    last_error: str | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)


class BeachAnalyzer:
    def __init__(self, beach: cfg.Beach) -> None:
        self.beach = beach
        self.state = BeachState()
        self._heatmap = HeatmapAccumulator(
            window_seconds=cfg.HEATMAP_WINDOW_SECONDS,
            half_life_seconds=cfg.HEATMAP_HALF_LIFE_SECONDS,
            blob_sigma=cfg.HEATMAP_BLOB_SIGMA,
        )
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._capture: FrameSource = _build_source(beach)

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(
            target=self._run, name=f"analyzer-{self.beach.id}", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._capture.close()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        log.info("Analyzer started for %s", self.beach.name)
        while not self._stop.is_set():
            loop_start = time.time()
            try:
                self._tick()
            except Exception as e:
                log.exception("Analyzer tick failed")
                with self.state.lock:
                    self.state.last_error = str(e)
            elapsed = time.time() - loop_start
            sleep_for = max(0.0, cfg.FRAME_INTERVAL_SECONDS - elapsed)
            if self._stop.wait(sleep_for):
                break

    def _tick(self) -> None:
        frame = self._capture.read()
        if frame is None:
            status = self._capture.status()
            if status:
                with self.state.lock:
                    self.state.last_error = status
            return

        detections, (aw, ah) = detect_people(
            frame.image,
            model_path=cfg.YOLO_MODEL,
            confidence=cfg.DETECTION_CONFIDENCE,
            analysis_width=cfg.ANALYSIS_WIDTH,
        )
        points = [(d.x, d.y, d.confidence) for d in detections]
        self._heatmap.add(points, timestamp=frame.timestamp)

        density = self._heatmap.density(width=aw, height=ah, now=frame.timestamp)
        # Upscale density to source-frame size for the overlay.
        src_h, src_w = frame.image.shape[:2]
        density_full = cv2.resize(density, (src_w, src_h), interpolation=cv2.INTER_LINEAR)
        overlay = render_overlay(frame.image, density_full)
        density_only = _density_as_image(density_full)

        frame_jpeg = _encode_jpeg(frame.image)
        overlay_jpeg = _encode_jpeg(overlay)
        density_jpeg = _encode_jpeg(density_only)

        with self.state.lock:
            self.state.last_frame_jpeg = frame_jpeg
            self.state.last_overlay_jpeg = overlay_jpeg
            self.state.last_density_jpeg = density_jpeg
            self.state.last_frame_time = frame.timestamp
            self.state.last_people_count = len(detections)
            self.state.frames_processed += 1
            self.state.last_error = None

        log.debug(
            "%s: frame %d, %d people detected",
            self.beach.id, self.state.frames_processed, len(detections),
        )

    def snapshot(self) -> BeachState:
        # Caller is expected to access state under state.lock if needed.
        return self.state


def _build_source(beach: cfg.Beach) -> FrameSource:
    """Pick a frame source.

    `BEACH_HEATMAP_SAMPLE_IMAGE` overrides the live stream with a local
    image file for every beach — useful for testing the rest of the
    pipeline when the live source isn't reachable.
    """
    sample = os.environ.get("BEACH_HEATMAP_SAMPLE_IMAGE")
    if sample:
        log.info("Using LocalImageCapture (BEACH_HEATMAP_SAMPLE_IMAGE=%s)", sample)
        return LocalImageCapture(sample)
    return YouTubeLiveCapture(beach.youtube_url)


def _encode_jpeg(image: np.ndarray, quality: int = 80) -> bytes:
    ok, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("JPEG encode failed")
    return bytes(buf)


def _density_as_image(density: np.ndarray) -> np.ndarray:
    peak = float(density.max())
    if peak <= 1e-6:
        return np.zeros((*density.shape, 3), dtype=np.uint8)
    norm = np.clip(density / peak, 0.0, 1.0)
    return cv2.applyColorMap((norm * 255.0).astype(np.uint8), cv2.COLORMAP_JET)
