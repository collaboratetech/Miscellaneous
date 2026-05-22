"""Pull frames from a YouTube live stream.

YouTube live URLs aren't directly readable by OpenCV — we ask yt-dlp
for the underlying HLS manifest, then let OpenCV open that. The HLS
playlist URL is short-lived (typically minutes), so we refresh it
whenever the capture stalls.
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


class YouTubeLiveCapture:
    """Iterator-style frame source for a YouTube live URL.

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
            except Exception:
                log.exception("Failed to open stream")
                self._consecutive_failures += 1
                return None

        assert self._cap is not None
        ok, frame = self._cap.read()
        if not ok or frame is None:
            self._consecutive_failures += 1
            log.warning("Frame read failed (%d in a row)", self._consecutive_failures)
            # HLS playlist URLs expire; reopen on repeated failure.
            if self._consecutive_failures >= 3:
                try:
                    self._open()
                except Exception:
                    log.exception("Reopen failed")
            return None

        self._consecutive_failures = 0
        return Frame(image=frame, timestamp=time.time())

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None
