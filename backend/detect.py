"""YOLO detection for beach-activity targets.

Detects two COCO classes: `person` (0) and `umbrella` (25). On a beach
cam most people lie flat on sunbeds or towels — visually small and
sometimes occluded — but their umbrellas are large and easier to spot.
Umbrella detections are split by colour: thatched / straw parasols
(brown, low saturation) are permanent infrastructure and get weight 0;
coloured umbrellas count as activity.

Distant figures get tiny in this kind of high-angle camera. A single
YOLO pass that downsamples a 1080p frame to 1920 px loses them, so we
run YOLO on overlapping *tiles* of the source frame and merge results
via class-aware NMS — effectively doubling (or more) the per-pixel
resolution YOLO sees.

Each detection returns its bbox centre + width/height in
analysis-resolution pixels (the same `(ANALYSIS_WIDTH, ANALYSIS_HEIGHT)`
the caller will splat into).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import cv2
import numpy as np

from .colour import classify_umbrella

log = logging.getLogger(__name__)

# Lazily imported to keep startup snappy when running tests that don't
# need the model.
_model = None


@dataclass
class Detection:
    """One detection in analysis-resolution pixel coordinates."""

    kind: str  # "person" or "umbrella"
    x: float   # bbox centre, x
    y: float   # bbox centre, y
    w: float   # bbox width
    h: float   # bbox height
    confidence: float


def _load_model(model_path: str):
    global _model
    if _model is None:
        from ultralytics import YOLO

        log.info("Loading YOLO model: %s", model_path)
        _model = YOLO(model_path)
    return _model


def detect_targets(
    frame_bgr: np.ndarray,
    *,
    model_path: str,
    confidence: float,
    analysis_width: int,
    target_classes: dict[int, str],
    tile_grid: tuple[int, int] = (1, 1),
    tile_overlap: float = 0.15,
    dedup_iou: float = 0.45,
) -> tuple[list[Detection], tuple[int, int]]:
    """Run YOLO on a frame and return tagged detections.

    `target_classes` maps COCO class ID -> human label
    (e.g. `{0: "person", 25: "umbrella"}`). Detections of other classes
    are discarded. Umbrella detections are split by colour into
    `"umbrella"` (coloured / personal) and `"umbrella_thatched"`
    (permanent straw parasols).

    `tile_grid` of (R, C) > (1, 1) runs YOLO on R*C overlapping tiles
    of the source frame and merges results via NMS; this catches small
    objects that a single full-frame pass loses to downsampling.

    Returns (detections, (analysis_width, analysis_height)) — detection
    coordinates are in that analysis-resolution space (full frame), not
    per-tile.
    """
    src_h, src_w = frame_bgr.shape[:2]
    scale = analysis_width / src_w
    target_h = int(round(src_h * scale))

    tiles_y, tiles_x = tile_grid
    tile_src_w = src_w / tiles_x
    tile_src_h = src_h / tiles_y
    ox = int(round(tile_src_w * tile_overlap))
    oy = int(round(tile_src_h * tile_overlap))

    all_dets: list[Detection] = []
    for ty in range(tiles_y):
        for tx in range(tiles_x):
            x1 = max(0, int(round(tx * tile_src_w)) - ox)
            y1 = max(0, int(round(ty * tile_src_h)) - oy)
            x2 = min(src_w, int(round((tx + 1) * tile_src_w)) + ox)
            y2 = min(src_h, int(round((ty + 1) * tile_src_h)) + oy)
            if x2 - x1 < 16 or y2 - y1 < 16:
                continue
            tile = frame_bgr[y1:y2, x1:x2]
            tile_dets = _detect_single(
                tile,
                model_path=model_path,
                confidence=confidence,
                analysis_width=analysis_width,
                target_classes=target_classes,
                tile_offset=(x1, y1),
                src_to_full=scale,
                source_tile=frame_bgr[y1:y2, x1:x2],
            )
            all_dets.extend(tile_dets)

    deduped = _nms_per_class(all_dets, iou_threshold=dedup_iou)
    return deduped, (analysis_width, target_h)


def _detect_single(
    tile_bgr: np.ndarray,
    *,
    model_path: str,
    confidence: float,
    analysis_width: int,
    target_classes: dict[int, str],
    tile_offset: tuple[int, int],
    src_to_full: float,
    source_tile: np.ndarray,
) -> list[Detection]:
    """Run YOLO on one tile, return detections in *full-frame analysis* coords.

    `source_tile` is the same crop as `tile_bgr` at source resolution,
    used for colour-classifying umbrellas (we want the original pixels,
    not the resized-for-inference version).
    """
    model = _load_model(model_path)

    th, tw = tile_bgr.shape[:2]
    # Keep aspect ratio: resize tile so its width matches analysis_width.
    scale = analysis_width / tw
    inf_w = analysis_width
    inf_h = int(round(th * scale))
    resized = cv2.resize(tile_bgr, (inf_w, inf_h), interpolation=cv2.INTER_AREA)

    results = model.predict(
        source=resized,
        conf=confidence,
        classes=list(target_classes.keys()),
        verbose=False,
    )
    if not results:
        return []
    boxes = results[0].boxes
    if boxes is None or boxes.xyxy is None:
        return []

    xyxy = boxes.xyxy.cpu().numpy()
    confs = boxes.conf.cpu().numpy() if boxes.conf is not None else np.ones(len(xyxy))
    cls_ids = boxes.cls.cpu().numpy().astype(int) if boxes.cls is not None else np.zeros(len(xyxy), dtype=int)

    # Map tile-inference pixels -> source-frame pixels: divide by `scale`,
    # then add tile offset. Then to *full-frame analysis* pixels: multiply
    # by `src_to_full`.
    tile_to_src = 1.0 / scale
    ox, oy = tile_offset

    out: list[Detection] = []
    for (x1, y1, x2, y2), c, cid in zip(xyxy, confs, cls_ids):
        kind = target_classes.get(int(cid))
        if kind is None:
            continue
        # Source-frame bbox.
        sx1 = ox + x1 * tile_to_src
        sy1 = oy + y1 * tile_to_src
        sx2 = ox + x2 * tile_to_src
        sy2 = oy + y2 * tile_to_src

        if kind == "umbrella":
            # Crop the umbrella from the source tile (before resize) to
            # classify its colour.
            cx0 = max(0, int(x1 * tile_to_src))
            cy0 = max(0, int(y1 * tile_to_src))
            cx1 = min(source_tile.shape[1], int(x2 * tile_to_src))
            cy1 = min(source_tile.shape[0], int(y2 * tile_to_src))
            crop = source_tile[cy0:cy1, cx0:cx1]
            kind = classify_umbrella(crop)

        # Full-frame analysis coords.
        fx1 = sx1 * src_to_full
        fy1 = sy1 * src_to_full
        fx2 = sx2 * src_to_full
        fy2 = sy2 * src_to_full
        out.append(Detection(
            kind=kind,
            x=float((fx1 + fx2) / 2.0),
            y=float((fy1 + fy2) / 2.0),
            w=float(fx2 - fx1),
            h=float(fy2 - fy1),
            confidence=float(c),
        ))
    return out


def _nms_per_class(dets: list[Detection], iou_threshold: float) -> list[Detection]:
    """Greedy NMS, per (kind), to drop duplicates across overlapping tiles."""
    if not dets:
        return []
    by_kind: dict[str, list[Detection]] = {}
    for d in dets:
        by_kind.setdefault(d.kind, []).append(d)
    kept: list[Detection] = []
    for kind, group in by_kind.items():
        group.sort(key=lambda d: d.confidence, reverse=True)
        survivors: list[Detection] = []
        for d in group:
            if all(_iou(d, s) < iou_threshold for s in survivors):
                survivors.append(d)
        kept.extend(survivors)
    return kept


def _iou(a: Detection, b: Detection) -> float:
    ax1, ay1, ax2, ay2 = a.x - a.w / 2, a.y - a.h / 2, a.x + a.w / 2, a.y + a.h / 2
    bx1, by1, bx2, by2 = b.x - b.w / 2, b.y - b.h / 2, b.x + b.w / 2, b.y + b.h / 2
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    union = a.w * a.h + b.w * b.h - inter
    return inter / union if union > 0 else 0.0
