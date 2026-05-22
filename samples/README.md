# Sample images

## `crowded-beach.jpg`

Test input used by the `BEACH_HEATMAP_SAMPLE_IMAGE` smoke-test mode.

**Source:** [The crowded Bondi beach.jpg](https://commons.wikimedia.org/wiki/File:The_crowded_Bondi_beach.jpg)
on Wikimedia Commons. CC BY-SA.

## `served-overlay.jpg`

Full-resolution heatmap overlay as produced by
`GET /api/beaches/santa-ponsa/overlay.jpg` when the server was run with
`BEACH_HEATMAP_SAMPLE_IMAGE=samples/crowded-beach.jpg`. Each blob is a
person detection at the foot point of a YOLO bounding box.

## `ui-overlay.png`

Headless-Chromium screenshot of the frontend (<http://localhost:8000>)
showing the stats panel + heatmap-overlay view, taken under the same
smoke-test setup.

## `santa-ponsa-camera-view.jpg`

The actual YouTube static thumbnail for the configured Santa Ponsa
stream (`Pgjsoeq7iGM`), fetched from `i.ytimg.com`. Useful as a
reference for what the live frames look like — same elevated camera
angle, just at a fixed time. Note: branded "PAGUERA" by the channel
owner (multimediatres.com runs both beaches; the thumbnail labelling
may differ from the live content).

## `santa-ponsa-camera-overlay.jpg`

The heatmap overlay produced by the **current defaults** (`yolov8m`
@ 1920 px, conf=0.20, bbox-centre splat) running against
`santa-ponsa-camera-view.jpg`. Demonstrates that the upgraded defaults
catch a person on the sand that the original `yolov8n` @ 960 defaults
missed entirely.

## `detection-annotated.jpg`

Per-person annotation on the crowded-beach photo: yellow bbox, green
dot = bbox centre (where heat is placed now), magenta dot = old
foot-point. Shows why centres are the right choice for a beach cam:
prone bodies have horizontal bboxes whose bottom edge is the side of
the person, not their feet.
