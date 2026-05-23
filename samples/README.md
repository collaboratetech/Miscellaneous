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

## `santa-ponsa-camera-view.jpg`

The actual YouTube static thumbnail for the configured Santa Ponsa
stream (`Pgjsoeq7iGM`), fetched from `i.ytimg.com`. Useful as a
reference for what the live frames look like — same elevated camera
angle, just at a fixed time. Note: branded "PAGUERA" by the channel
owner (multimediatres.com runs both beaches; the thumbnail labelling
may differ from the live content).


## `detection-annotated.jpg`

Per-detection annotation on the crowded-beach photo: green box =
person, cyan box = umbrella, dot at bbox centre. Each box is what
gets splatted into the heatmap.

## `santa-ponsa-daytime.jpg`

YouTube thumbnail from a *different* video (`ODydh0G5qEk`) referenced
on `mallorca-beaches.com/en/santa-ponsa-beach/`. Same camera operator
as the night shot but daytime + properly labelled "Santa Ponsa".

## `santa-ponsa-daytime-overlay.jpg`

Heatmap overlay on the daytime image, produced with the full v4 stack
(2×2 tiled inference + umbrella colour classification + bbox-shape
splat). 14 people detected, 4 coloured umbrellas, 1 thatched parasol
(filtered out of the heatmap).

## `ui-overlay.png`

Headless-Chromium screenshot of the full frontend page showing all
10 stat tiles (breakdown by sunbed users / sand loungers / standing,
plus coloured vs thatched umbrellas, plus the busyness score), with
the heatmap overlay rendered live by the FastAPI server.
