"""Classify umbrella crops as thatched (permanent) vs coloured (user).

Mallorca beach concessions install rows of straw / hay parasols that
are there whether or not anyone is renting them. Counting those as
activity would make every beach with permanent umbrellas look packed
all day. We split YOLO's umbrella detections by their dominant colour:

  - Thatched: warm tan / brown hue, low-to-moderate saturation.
  - Coloured: anything else with reasonable saturation — striped
    parasols, beach tents, personal umbrellas brought by visitors.

The check looks at the centre 60% of the bounding box to dodge
background bleed (sand, sea, sky) at the edges.
"""
from __future__ import annotations

import cv2
import numpy as np

# HSV thresholds (OpenCV: H is 0..179, S/V are 0..255).
# Straw / hay sits in the warm-orange-brown band with moderate saturation.
THATCHED_HUE_MIN = 8
THATCHED_HUE_MAX = 28
THATCHED_SAT_MAX = 170  # high enough to allow sunlit straw, low enough to exclude flag-saturated cloth
# Fraction of the centre crop that must look like straw to call it thatched.
THATCHED_FRACTION = 0.45


def classify_umbrella(crop_bgr: np.ndarray) -> str:
    """Return either `"umbrella"` (coloured) or `"umbrella_thatched"`.

    Empty / tiny crops default to `"umbrella"` (i.e. err on counting
    them — better a false positive than silently dropping a real signal).
    """
    if crop_bgr is None or crop_bgr.size == 0:
        return "umbrella"

    h, w = crop_bgr.shape[:2]
    if h < 4 or w < 4:
        return "umbrella"

    # Centre 60% region of the crop.
    cx0 = int(w * 0.20)
    cx1 = int(w * 0.80)
    cy0 = int(h * 0.20)
    cy1 = int(h * 0.80)
    inner = crop_bgr[cy0:cy1, cx0:cx1]
    if inner.size == 0:
        return "umbrella"

    hsv = cv2.cvtColor(inner, cv2.COLOR_BGR2HSV)
    hue = hsv[..., 0]
    sat = hsv[..., 1]

    is_straw = (
        (hue >= THATCHED_HUE_MIN)
        & (hue <= THATCHED_HUE_MAX)
        & (sat <= THATCHED_SAT_MAX)
    )
    straw_fraction = float(is_straw.mean())
    return "umbrella_thatched" if straw_fraction >= THATCHED_FRACTION else "umbrella"
