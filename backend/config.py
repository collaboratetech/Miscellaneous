"""Beach catalogue + analysis settings.

Adding another beach is a matter of adding an entry to BEACHES with a
working YouTube live URL. The keys are used as the public ID in the API.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Beach:
    id: str
    name: str
    location: str
    youtube_url: str


BEACHES: dict[str, Beach] = {
    "santa-ponsa": Beach(
        id="santa-ponsa",
        name="Santa Ponsa",
        location="Mallorca, Spain",
        youtube_url="https://www.youtube.com/live/Pgjsoeq7iGM",
    ),
}

DEFAULT_BEACH_ID = "santa-ponsa"

# How often to pull a frame from the stream (seconds). Below ~1s/frame
# YOLO inference becomes the bottleneck on CPU; above ~5s the heatmap
# feels stale.
FRAME_INTERVAL_SECONDS = 2.0

# Detections older than this drop out of the heatmap window.
HEATMAP_WINDOW_SECONDS = 600  # 10 minutes

# Half-life for the exponential time decay applied to each detection's
# weight in the heatmap. Recent detections count more than old ones.
HEATMAP_HALF_LIFE_SECONDS = 180  # 3 minutes

# Person-detection confidence threshold (0..1).
DETECTION_CONFIDENCE = 0.35

# Gaussian blob sigma (in pixels at the working resolution) used to
# spread each detection into the density grid.
HEATMAP_BLOB_SIGMA = 22.0

# Internal working resolution for analysis. Larger = more accurate +
# slower. The output overlay is upscaled to the source frame.
ANALYSIS_WIDTH = 960

# YOLO model file. "yolov8n.pt" is the smallest and fastest; swap to
# "yolov8s.pt" / "yolov8m.pt" for better accuracy if you have GPU.
YOLO_MODEL = "yolov8n.pt"

# Busyness thresholds (number of people detected in the most recent frame).
BUSY_THRESHOLDS = {
    "quiet": 5,
    "moderate": 20,
    "busy": 50,
    # > busy => "packed"
}
