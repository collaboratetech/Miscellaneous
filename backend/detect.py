"""Person detection via YOLO.

Returns per-person foot positions (centre-bottom of each bounding box),
which is what we want for a top-down-ish heatmap of where people stand
on the beach. Bounding-box centres bias toward where torsos appear,
which sits higher up the frame and clusters less helpfully.
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
    x: float  # foot point, in analysis-resolution pixels
    y: float
    confidence: float


def _load_model(model_path: str):
    global _model
    if _model is None:
        from ultralytics import YOLO

        log.info("Loading YOLO model: %s", model_path)
        _model = YOLO(model_path)
    return _model


def detect_people(
    frame_bgr: np.ndarray,
    *,
    model_path: str,
    confidence: float,
    analysis_width: int,
) -> tuple[list[Detection], tuple[int, int]]:
    """Run person detection on a frame.

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
    # `classes=[0]` restricts to the COCO "person" class.
    results = model.predict(
        source=resized,
        conf=confidence,
        classes=[0],
        verbose=False,
    )

    detections: list[Detection] = []
    if results:
        boxes = results[0].boxes
        if boxes is not None and boxes.xyxy is not None:
            xyxy = boxes.xyxy.cpu().numpy()
            confs = boxes.conf.cpu().numpy() if boxes.conf is not None else np.ones(len(xyxy))
            for (x1, y1, x2, y2), c in zip(xyxy, confs):
                foot_x = (x1 + x2) / 2.0
                foot_y = y2  # bottom of the box ≈ feet
                detections.append(Detection(x=float(foot_x), y=float(foot_y), confidence=float(c)))

    return detections, (analysis_width, target_h)
