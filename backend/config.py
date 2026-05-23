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

# YOLO confidence threshold. Lower catches more distant figures at the
# cost of some false positives — 0.15 is the sweet spot at 3x3 tiling
# on the Santa Ponsa daylight feed.
DETECTION_CONFIDENCE = 0.15

# YOLO/COCO class IDs we treat as detection targets:
#   0  = person
#   25 = umbrella (split post-detection into thatched vs coloured —
#                  see colour.classify_umbrella)
TARGET_CLASSES: dict[int, str] = {0: "person", 25: "umbrella"}

# Per-kind weight in the density grid. People are the primary signal;
# a coloured umbrella usually covers 1-3 people, so weight it < 1.
# Thatched / straw umbrellas (the rented or beach-club fixtures common
# on Mallorca) are permanent infrastructure — they're there whether or
# not the beach is busy, so weight 0 so they don't inflate the heatmap.
CLASS_WEIGHTS: dict[str, float] = {
    "person": 1.0,
    "umbrella": 0.5,
    "umbrella_thatched": 0.0,
}

# Final Gaussian blur sigma applied AFTER splatting each detection as
# its bounding-box rectangle. With box-shape splatting the rectangle
# already provides spatial extent, so this only needs to soften edges
# and merge nearby detections.
HEATMAP_BLOB_SIGMA = 12.0

# Internal working resolution for analysis. Larger = better at small
# people in the distance + slower. The Santa Ponsa cam frames the beach
# from a ~150 m elevated position, so people on the sand are ~30-80 px
# tall at 1920 — yolov8n at 960 misses most of them.
ANALYSIS_WIDTH = 1920

# Tile grid for sliced inference (rows, cols). (1, 1) = single pass on
# the whole frame. Higher density catches smaller / more-distant people
# at proportional CPU cost. (3, 3) is the empirical sweet spot for the
# Santa Ponsa-style high-elevation beach cam — 4x4 makes tiles small
# enough that mid-sized people get split across boundaries even with
# 15% overlap, which actually reduces recall.
TILE_GRID: tuple[int, int] = (3, 3)

# Fractional overlap between adjacent tiles, so detections that straddle
# a tile boundary aren't truncated. 0.15 = 15% on each side.
TILE_OVERLAP = 0.15

# IoU threshold for de-duplicating detections that appear in multiple
# overlapping tiles. Lower = more aggressive merging.
DEDUP_IOU = 0.45

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
