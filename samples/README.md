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
