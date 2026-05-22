"""Time-decayed density heatmap.

Each detection is splatted onto a 2D density grid as a *filled
rectangle* the size of its YOLO bounding box, then the grid is
Gaussian-blurred to soften edges and merge nearby detections. The
rectangle splat (vs the older point splat) means closer / larger
detections contribute more total heat — which matches what a viewer
expects "busy area" to look like on a perspective camera.

Older detections contribute less via an exponential half-life decay,
and anything older than the window is dropped entirely.

The renderer composites the density onto the source frame as a coloured
overlay (JET colormap by default), only drawing where density is above
a small fraction of the peak so empty beach stays visible.
"""
from __future__ import annotations

import math
import threading
import time
from collections import deque
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class _Sample:
    x: float
    y: float
    w: float
    h: float
    weight: float
    timestamp: float


class HeatmapAccumulator:
    """Thread-safe rolling buffer of detections + heatmap renderer."""

    def __init__(
        self,
        *,
        window_seconds: float,
        half_life_seconds: float,
        blob_sigma: float,
    ) -> None:
        self.window_seconds = window_seconds
        self.half_life_seconds = half_life_seconds
        self.blob_sigma = blob_sigma
        self._samples: deque[_Sample] = deque()
        self._lock = threading.Lock()
        self._latest_count = 0

    def add(self, boxes: list[tuple[float, float, float, float, float]], timestamp: float) -> None:
        """Add detections from one frame.

        `boxes` is a list of (x, y, w, h, weight) where (x, y) is the
        bbox centre and (w, h) is the bbox size — all in the same
        coordinate space the caller will pass to `density()`.
        """
        with self._lock:
            for x, y, w, h, weight in boxes:
                self._samples.append(_Sample(x=x, y=y, w=w, h=h, weight=weight, timestamp=timestamp))
            self._latest_count = len(boxes)
            self._prune(now=timestamp)

    def _prune(self, *, now: float) -> None:
        cutoff = now - self.window_seconds
        while self._samples and self._samples[0].timestamp < cutoff:
            self._samples.popleft()

    def latest_count(self) -> int:
        with self._lock:
            return self._latest_count

    def sample_count(self) -> int:
        with self._lock:
            return len(self._samples)

    def density(self, *, width: int, height: int, now: float | None = None) -> np.ndarray:
        """Render the current density as a float32 grid (height, width).

        Values are in arbitrary units; the caller can normalise before
        colouring. Empty cells are 0.0.
        """
        if now is None:
            now = time.time()

        with self._lock:
            self._prune(now=now)
            samples = list(self._samples)

        grid = np.zeros((height, width), dtype=np.float32)
        if not samples:
            return grid

        decay_k = math.log(2.0) / self.half_life_seconds
        # Splat each detection as a filled rectangle the size of its
        # bounding box, then Gaussian-blur the whole grid once. Per-pixel
        # weight is constant so total contribution scales with bbox area
        # — bigger / closer detections look hotter, which matches the
        # camera's perspective view.
        for s in samples:
            age = max(0.0, now - s.timestamp)
            value = s.weight * math.exp(-decay_k * age)
            x1 = max(0, int(round(s.x - s.w / 2.0)))
            y1 = max(0, int(round(s.y - s.h / 2.0)))
            x2 = min(width, int(round(s.x + s.w / 2.0)) + 1)
            y2 = min(height, int(round(s.y + s.h / 2.0)) + 1)
            if x2 > x1 and y2 > y1:
                grid[y1:y2, x1:x2] += value
            else:
                # Fallback for zero-size bboxes (shouldn't normally happen).
                ix = int(round(s.x))
                iy = int(round(s.y))
                if 0 <= ix < width and 0 <= iy < height:
                    grid[iy, ix] += value

        ksize = int(self.blob_sigma * 6) | 1  # odd
        cv2.GaussianBlur(grid, (ksize, ksize), self.blob_sigma, dst=grid)
        return grid


def render_overlay(
    frame_bgr: np.ndarray,
    density: np.ndarray,
    *,
    alpha: float = 0.55,
    floor_pct: float = 0.05,
) -> np.ndarray:
    """Composite the density grid onto a frame as a JET overlay.

    `density` is assumed to be at a possibly-smaller resolution than
    the frame; it's upscaled. `floor_pct` (0..1) is the fraction of
    the peak below which the overlay is invisible (so empty beach is
    not tinted).
    """
    h, w = frame_bgr.shape[:2]
    if density.shape != (h, w):
        density = cv2.resize(density, (w, h), interpolation=cv2.INTER_LINEAR)

    peak = float(density.max())
    if peak <= 1e-6:
        return frame_bgr.copy()

    norm = np.clip(density / peak, 0.0, 1.0)
    floor = floor_pct
    mask = (norm > floor).astype(np.float32)
    # Soften the mask edge to avoid hard boundaries.
    mask = cv2.GaussianBlur(mask, (15, 15), 5)

    norm_u8 = (norm * 255.0).astype(np.uint8)
    colour = cv2.applyColorMap(norm_u8, cv2.COLORMAP_JET)

    blended_alpha = (alpha * mask)[..., None]
    out = frame_bgr.astype(np.float32) * (1.0 - blended_alpha) + colour.astype(np.float32) * blended_alpha
    return np.clip(out, 0, 255).astype(np.uint8)
