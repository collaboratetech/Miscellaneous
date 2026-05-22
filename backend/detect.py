"""YOLO detection for beach-activity targets.

Detects two COCO classes: `person` (0) and `umbrella` (25). On a beach
cam most people lie flat on sunbeds or towels — visually small and
sometimes occluded — but their umbrellas are large, brightly coloured
and easy to detect. Treating umbrellas as a secondary signal recovers
busy zones that pure person-detection misses on wide aerial shots.

Each detection returns its bbox centre + width/height in
analysis-resolution pixels. Centres (not the bbox bottom) are the right
localization for any orientation: a person lying horizontally has a
wide bbox whose bottom edge is the side of their body, not their feet.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import cv2
import numpy as np

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
) -> tuple[list[Detection], tuple[int, int]]:
    """Run YOLO on a frame and return tagged detections.

    `target_classes` maps COCO class ID -> human label
    (e.g. `{0: "person", 25: "umbrella"}`). Detections of other classes
    are discarded.

    Returns (detections, (analysis_width, analysis_height)). The
    detection coordinates are in the analysis-resolution space, not
    the source frame's.
    """
    model = _load_model(model_path)

    src_h, src_w = frame_bgr.shape[:2]
    scale = analysis_width / src_w
    target_h = int(round(src_h * scale))
    resized = cv2.resize(frame_bgr, (analysis_width, target_h), interpolation=cv2.INTER_AREA)

    # Ultralytics handles BGR->RGB internally when given a numpy frame.
    results = model.predict(
        source=resized,
        conf=confidence,
        classes=list(target_classes.keys()),
        verbose=False,
    )

    detections: list[Detection] = []
    if results:
        boxes = results[0].boxes
        if boxes is not None and boxes.xyxy is not None:
            xyxy = boxes.xyxy.cpu().numpy()
            confs = boxes.conf.cpu().numpy() if boxes.conf is not None else np.ones(len(xyxy))
            cls_ids = boxes.cls.cpu().numpy().astype(int) if boxes.cls is not None else np.zeros(len(xyxy), dtype=int)
            for (x1, y1, x2, y2), c, cid in zip(xyxy, confs, cls_ids):
                kind = target_classes.get(int(cid))
                if kind is None:
                    continue
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0
                detections.append(Detection(
                    kind=kind,
                    x=float(cx), y=float(cy),
                    w=float(x2 - x1), h=float(y2 - y1),
                    confidence=float(c),
                ))

    return detections, (analysis_width, target_h)
