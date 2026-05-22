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

# How often to pull a frame from the stream (seconds). yolov8m at 1920
# typically runs in 1-3 s on a recent laptop CPU, so 5 s leaves headroom.
# Drop to 1-2 s if you have a GPU.
FRAME_INTERVAL_SECONDS = 5.0

# Detections older than this drop out of the heatmap window.
HEATMAP_WINDOW_SECONDS = 600  # 10 minutes

# Half-life for the exponential time decay applied to each detection's
# weight in the heatmap. Recent detections count more than old ones.
HEATMAP_HALF_LIFE_SECONDS = 180  # 3 minutes

# Person-detection confidence threshold (0..1). Lower catches more
# distant figures at the cost of some false positives.
DETECTION_CONFIDENCE = 0.20

# Gaussian blob sigma (in pixels at the working resolution) used to
# spread each detection into the density grid.
HEATMAP_BLOB_SIGMA = 22.0

# Internal working resolution for analysis. Larger = better at small
# people in the distance + slower. The Santa Ponsa cam frames the beach
# from a ~150 m elevated position, so people on the sand are ~30-80 px
# tall at 1920 — yolov8n at 960 misses most of them.
ANALYSIS_WIDTH = 1920

# YOLO model file. yolov8n is fast but misses small/distant people;
# yolov8m roughly doubles recall on this camera at ~5x CPU. For high-
# accuracy / GPU setups, swap to yolov8x.pt.
YOLO_MODEL = "yolov8m.pt"

# Busyness thresholds (number of people detected in the most recent frame).
BUSY_THRESHOLDS = {
    "quiet": 5,
    "moderate": 20,
    "busy": 50,
    # > busy => "packed"
}
