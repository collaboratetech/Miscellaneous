"""Frame sources.

Production source: a YouTube live URL resolved to an HLS playlist via
yt-dlp, then read by OpenCV. HLS playlist URLs are short-lived, so we
refresh whenever the capture stalls.

Dev/test source: a local image file, returned once per `read()` call
with a fresh timestamp. Useful for first-run smoke tests, and for
environments where YouTube isn't reachable (corporate proxies,
datacenter IPs that hit bot-detection, offline laptops). Enabled by
setting `BEACH_HEATMAP_SAMPLE_IMAGE=/path/to/image.jpg`.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import cv2
import numpy as np
import yt_dlp

log = logging.getLogger(__name__)


@dataclass
class Frame:
    image: np.ndarray  # BGR, shape (H, W, 3)
    timestamp: float


class FrameSource:
    """Common interface for anything that yields frames over time."""

    def read(self) -> Frame | None:  # pragma: no cover - interface
        raise NotImplementedError

    def close(self) -> None:  # pragma: no cover - interface
        pass

    def status(self) -> str | None:
        """Optional human-readable status (None on healthy)."""
        return None


class LocalImageCapture(FrameSource):
    """Returns the same on-disk image for every `read()` call.

    Useful for testing the detection + heatmap + HTTP layers without a
    live stream. Each call returns the image with a fresh timestamp, so
    the heatmap accumulator still ages detections as if they were live.
    """

    def __init__(self, image_path: str) -> None:
        self.image_path = image_path
        self._image = cv2.imread(image_path)
        if self._image is None:
            raise RuntimeError(f"Could not read sample image: {image_path}")
        log.info("LocalImageCapture loaded %s (%dx%d)",
                 image_path, self._image.shape[1], self._image.shape[0])

    def read(self) -> Frame | None:
        # Return a copy so downstream code can draw on it safely.
        return Frame(image=self._image.copy(), timestamp=time.time())


class YouTubeLiveCapture(FrameSource):
    """Frame source for a YouTube live URL.

    Call `read()` to get the next available frame. Returns None if the
    stream is temporarily unreadable; the caller decides whether to
    retry. Internally re-resolves the HLS URL whenever the underlying
    capture drops.
    """

    def __init__(self, youtube_url: str, target_height: int = 720) -> None:
        self.youtube_url = youtube_url
        self.target_height = target_height
        self._cap: cv2.VideoCapture | None = None
        self._hls_url: str | None = None
        self._last_resolve = 0.0
        self._consecutive_failures = 0
        self._last_status: str | None = None

    def _resolve_hls(self) -> str:
        """Ask yt-dlp for the best HLS manifest URL <= target_height."""
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "format": f"best[protocol^=m3u8][height<={self.target_height}]/best[protocol^=m3u8]/best",
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(self.youtube_url, download=False)
        url = info.get("url")
        if not url:
            # Some live formats expose the manifest under "formats".
            for fmt in info.get("formats") or []:
                if fmt.get("protocol", "").startswith("m3u8") and fmt.get("url"):
                    url = fmt["url"]
                    break
        if not url:
            raise RuntimeError("yt-dlp did not return a playable URL")
        return url

    def _open(self) -> None:
        if self._cap is not None:
            self._cap.release()
        self._hls_url = self._resolve_hls()
        self._last_resolve = time.time()
        cap = cv2.VideoCapture(self._hls_url, cv2.CAP_FFMPEG)
        # Small buffer reduces lag on live streams.
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not cap.isOpened():
            cap.release()
            raise RuntimeError("OpenCV could not open the HLS stream")
        self._cap = cap
        log.info("Opened HLS stream for %s", self.youtube_url)

    def read(self) -> Frame | None:
        if self._cap is None:
            try:
                self._open()
                self._last_status = None
            except Exception as e:
                log.exception("Failed to open stream")
                self._last_status = f"stream open failed: {e}"
                self._consecutive_failures += 1
                return None

        assert self._cap is not None
        ok, frame = self._cap.read()
        if not ok or frame is None:
            self._consecutive_failures += 1
            log.warning("Frame read failed (%d in a row)", self._consecutive_failures)
            self._last_status = f"frame read failed ({self._consecutive_failures} in a row)"
            # HLS playlist URLs expire; reopen on repeated failure.
            if self._consecutive_failures >= 3:
                try:
                    self._open()
                except Exception as e:
                    log.exception("Reopen failed")
                    self._last_status = f"stream reopen failed: {e}"
            return None

        self._consecutive_failures = 0
        self._last_status = None
        return Frame(image=frame, timestamp=time.time())

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    def status(self) -> str | None:
        return self._last_status
