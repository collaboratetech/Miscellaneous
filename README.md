# Mallorca Beach Heatmap

Live crowd-density heatmap for Mallorca beaches, built from public YouTube
webcam streams. MVP beach: **Santa Ponsa**
([stream](https://www.youtube.com/live/Pgjsoeq7iGM)).

```
YouTube live  ──►  yt-dlp (HLS URL)  ──►  OpenCV frame capture
                                              │
                                              ▼
                                      YOLOv8 person detection
                                              │
                                              ▼
                            Time-decayed density accumulator (10-min window,
                            3-min half-life, Gaussian splat per detection)
                                              │
                                              ▼
                              FastAPI ── /api/.../overlay.jpg ── Browser
```

## What the heatmap shows

Each detected person contributes a Gaussian blob at their bounding-box
centre. (An earlier version used the bbox bottom — "foot point" — but
beach cams catch a lot of people lying on sunbeds or towels, where the
bbox is horizontal and the bottom edge is the side of the body, not
the feet. Centre is correct for any orientation.)

Detections persist for 10 minutes but decay with a 3-minute half-life,
so the colour intensity reflects "where people have been recently",
weighted toward right now. Empty stretches of beach stay uncoloured.
The numeric **People in frame** counter is just the most recent
detection count, mapped to four busyness bands (quiet / moderate /
busy / packed).

## Project layout

```
backend/
  config.py        Beach catalogue + analysis knobs (window, half-life, etc.)
  stream.py        yt-dlp + OpenCV live-stream frame source
  detect.py        YOLOv8 person detection (foot-point per box)
  heatmap.py       Rolling-buffer density accumulator + JET overlay renderer
  analyzer.py      Per-beach background thread: read → detect → accumulate
  main.py          FastAPI app + endpoints
  requirements.txt Python dependencies
frontend/
  index.html       Single-page UI: dropdown + stats + live image
  app.js           Polls /stats every 3 s; cache-busts the image URL
  styles.css
```

## Run it

Python 3.11+ recommended. Needs `ffmpeg` on the system PATH for OpenCV
to read HLS streams (`apt install ffmpeg` / `brew install ffmpeg`). The
first run downloads `yolov8n.pt` (~6 MB) from Ultralytics on first
inference.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# From the repo root:
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Then open <http://localhost:8000>.

### Smoke test without YouTube

YouTube blocks anonymous traffic from many cloud / datacenter IPs with
a "confirm you're not a bot" challenge, so live capture won't work
from CI runners or VMs without browser cookies. To verify the
detection + heatmap + HTTP layers anyway, point the analyzer at a
local image:

```bash
BEACH_HEATMAP_SAMPLE_IMAGE=samples/crowded-beach.jpg \
  uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

The server then loops on that image as if it were a one-frame stream.
`samples/served-overlay.jpg` and `samples/ui-overlay.png` in this repo
were both produced by exactly this command.

The first frame can take 30–60 s on first run (YOLO download + model
warm-up). Subsequent restarts are quick. CPU-only inference at the
default `ANALYSIS_WIDTH=960` typically runs comfortably under the
2-second frame interval on a recent laptop; bump `FRAME_INTERVAL_SECONDS`
if your CPU can't keep up.

## API

| Endpoint                              | Returns                                   |
| ------------------------------------- | ----------------------------------------- |
| `GET /api/beaches`                    | List of configured beaches                |
| `GET /api/beaches/{id}/stats`         | JSON: count, busyness, frame age, errors  |
| `GET /api/beaches/{id}/frame.jpg`     | Latest raw frame                          |
| `GET /api/beaches/{id}/overlay.jpg`   | Frame + heatmap overlay                   |
| `GET /api/beaches/{id}/heatmap.jpg`   | Heatmap alone (debug)                     |

While the first frame is being processed, image endpoints return `204`.

## Adding another beach

Edit `backend/config.py`:

```python
BEACHES = {
    "santa-ponsa": Beach(...),
    "playa-de-palma": Beach(
        id="playa-de-palma",
        name="Playa de Palma",
        location="Mallorca, Spain",
        youtube_url="https://www.youtube.com/live/<video-id>",
    ),
}
```

Restart the server. Each beach gets its own analyzer thread and its own
heatmap buffer. The frontend's beach selector is populated from the API,
so it'll show up automatically.

## Tuning knobs (`backend/config.py`)

| Setting                       | Effect                                                    | Default      |
| ----------------------------- | --------------------------------------------------------- | ------------ |
| `FRAME_INTERVAL_SECONDS`      | Lower = livelier UI, higher CPU                           | `5.0`        |
| `HEATMAP_WINDOW_SECONDS`      | How far back the heatmap "remembers"                      | `600`        |
| `HEATMAP_HALF_LIFE_SECONDS`   | How quickly recent activity dominates older activity      | `180`        |
| `HEATMAP_BLOB_SIGMA`          | Size of each person's contribution (pixels @ analysis res)| `22.0`       |
| `ANALYSIS_WIDTH`              | Inference resolution; higher = more accurate + slower     | `1920`       |
| `DETECTION_CONFIDENCE`        | YOLO score floor for "this is a person"                   | `0.20`       |
| `YOLO_MODEL`                  | `yolov8n.pt` (fastest) … `yolov8x.pt` (most accurate)     | `yolov8m.pt` |
| `BUSY_THRESHOLDS`             | People-count bands for the busyness label                 | see config   |

### Picking a YOLO model

The Santa Ponsa cam (`multimediatres.com`, hosted on YouTube) frames
the beach from a hotel-mounted elevated angle. People on the sand are
~30-80 px tall at 1920 px inference width. yolov8n misses most of
them; yolov8m roughly doubles recall at ~5× the CPU cost per frame.

| Model         | Weights | Per-frame CPU (1920px) | Use when                          |
| ------------- | ------- | ---------------------- | --------------------------------- |
| `yolov8n.pt`  |  ~6 MB  | ~0.2 s                 | Low-spec server, close-up cameras |
| `yolov8m.pt`  | ~50 MB  | ~1-3 s                 | **Default** — recent laptop CPU   |
| `yolov8x.pt`  | ~130 MB | ~3-5 s                 | GPU available, max accuracy       |

Run times are rough — a GPU with CUDA reduces all of these by ~10-50×.

## Known limits

- **Camera angle matters.** The webcam frames a fixed view; heatmap
  coordinates are in image space, not metres of beach. People near the
  camera occupy more pixels than people in the distance, so the heatmap
  is biased toward the foreground. A proper homography to top-down would
  fix this — out of scope for the MVP.
- **Small / distant people are missed.** `yolov8n` at 960px analysis
  width can't reliably detect tiny figures in wide / aerial shots.
  Bumping `YOLO_MODEL` to `yolov8m.pt` and `ANALYSIS_WIDTH` to 1920
  helps a lot at the cost of ~5× CPU per frame.
- **YouTube bot-detection.** Cloud / datacenter IPs hit "confirm you're
  not a bot" gates from YouTube. The default config uses the
  `tv_embedded` player client, which bypasses the gate in most cases;
  if it stops working, pass browser cookies to `yt-dlp` via `cookiefile`
  in `stream.py:_resolve_hls`'s `ydl_opts`, or run from a residential
  network. The `BEACH_HEATMAP_SAMPLE_IMAGE` env var bypasses YouTube
  entirely for testing.
- **HLS segment IP-binding.** googlevideo signs each video segment URL
  to the requesting IP. Hosts behind a NAT pool with rotating egress
  IPs (some CI / sandbox setups) will get 403 on the `.ts` files even
  though the manifest loads. A single stable egress IP fixes it.
- **YouTube TOS.** Reading the HLS manifest via `yt-dlp` is fine for
  personal use; check the stream owner's terms before redistributing.
- **No persistence.** Heatmap state is in-memory and resets on restart.
- **No auth.** Don't expose this to the open internet without putting a
  reverse proxy / auth layer in front.
