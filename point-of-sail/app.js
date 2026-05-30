"use strict";

/*
 * Point of Sail
 *
 * Model: the wind always blows from the top of the diagram straight down.
 * The boat's heading is an angle measured clockwise from "bow pointing
 * straight into the wind" (0°). That angle IS the true wind angle (TWA)
 * once folded into 0..180.
 *
 *   heading   0   = bow into the wind        (in irons)
 *   heading  90   = bow to the right         (wind on the port side)
 *   heading 180   = bow downwind             (running)
 *   heading 270   = bow to the left          (wind on the starboard side)
 *
 * Tack is decided by which side the wind crosses:
 *   heading in (0,180)   -> wind hits the port side    -> PORT tack
 *   heading in (180,360) -> wind hits the starboard    -> STARBOARD tack
 */

// Boundaries are TWA (0..180) in degrees. Each band: [min, max).
const BANDS = [
  {
    id: "nogo",
    name: "No-go zone",
    min: 0,
    max: 43,
    trim: "Too close to the wind — the sails luff and flog. Bear away to fill them.",
  },
  {
    id: "close-hauled",
    name: "Close hauled",
    min: 43,
    max: 60,
    trim: "Sails sheeted in hard, boat heeling. As close to the wind as she'll sail.",
  },
  {
    id: "close-reach",
    name: "Close reach",
    min: 60,
    max: 80,
    trim: "Sails eased a touch from close hauled. A fast, comfortable angle.",
  },
  {
    id: "beam-reach",
    name: "Beam reach",
    min: 80,
    max: 100,
    trim: "Wind across the beam, sails roughly halfway out. Often the quickest point of sail.",
  },
  {
    id: "broad-reach",
    name: "Broad reach",
    min: 100,
    max: 160,
    trim: "Wind over the quarter, sails well eased. Relaxed and fast off the wind.",
  },
  {
    id: "running",
    name: "Running",
    min: 160,
    max: 180.001, // inclusive of 180
    trim: "Dead downwind, sails right out. Watch for an accidental gybe; consider wing-on-wing.",
  },
];

const NOGO_LIMIT = BANDS[0].max; // edge of the no-go zone, in degrees TWA

// Geometry of the diagram (must match the SVG viewBox / boat origin).
const CX = 200;
const CY = 210;
const RING_R = 150;

const el = {
  scene: document.getElementById("scene"),
  nogo: document.getElementById("nogo"),
  boat: document.getElementById("boat"),
  sail: document.getElementById("sail"),
  slider: document.getElementById("heading"),
  point: document.getElementById("readout-summary"),
  heading: document.getElementById("r-heading"),
  twa: document.getElementById("r-twa"),
  tack: document.getElementById("r-tack"),
  trim: document.getElementById("readout-trim"),
  legend: document.getElementById("legend-list"),
};

// --- pure helpers -----------------------------------------------------------

/** Fold a 0..359 heading into a true wind angle 0..180. */
function trueWindAngle(heading) {
  return heading <= 180 ? heading : 360 - heading;
}

/** Which side the wind crosses. Null when head-to-wind or dead downwind. */
function tackOf(heading) {
  if (heading === 0 || heading === 180) return null;
  return heading < 180 ? "Port" : "Starboard";
}

/** The band a given TWA falls into. */
function bandFor(twa) {
  return BANDS.find((b) => twa >= b.min && twa < b.max) || BANDS[BANDS.length - 1];
}

/** Point on the compass ring for a heading angle (0 = up, clockwise). */
function ringPoint(angleDeg, radius) {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // 0° -> straight up
  return {
    x: CX + radius * Math.cos(rad),
    y: CY + radius * Math.sin(rad),
  };
}

// --- rendering --------------------------------------------------------------

function drawNoGoZone() {
  // Wedge spanning -NOGO_LIMIT .. +NOGO_LIMIT around the wind (straight up).
  const a = ringPoint(-NOGO_LIMIT, RING_R);
  const b = ringPoint(NOGO_LIMIT, RING_R);
  el.nogo.setAttribute(
    "d",
    `M ${CX} ${CY} L ${a.x.toFixed(1)} ${a.y.toFixed(1)} ` +
      `A ${RING_R} ${RING_R} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)} Z`
  );
}

/**
 * Draw the mainsail in boat-local coordinates (the boat group is rotated as a
 * whole). The boom pivots at the mast and trails aft, swinging out to leeward:
 * sheeted in tight (~12°) when close hauled, almost square (~85°) when running.
 * It is drawn on the leeward side so it mirrors with the tack.
 */
function drawSail(twa, tack) {
  const mastX = 200;
  const head = 158; // top of the sail (boat-local y)
  const foot = 196; // tack of the sail, at the mast base
  const len = 42; // boom length

  const boomOut = 12 + (twa / 180) * 73; // 12°..85° off the centreline
  const ang = (boomOut * Math.PI) / 180;
  // Leeward side: on port tack the wind is from port, so the sail blows to
  // starboard (boat-local +x); on starboard tack it blows to port (-x).
  const side = tack === "Starboard" ? -1 : 1;

  // Clew = boom end: aft from the mast foot, swung out to leeward.
  const clewX = mastX + side * Math.sin(ang) * len;
  const clewY = foot + Math.cos(ang) * len;
  // Belly: bow the leech out to leeward for a "filled" look.
  const bellyX = (mastX + clewX) / 2 + side * (6 + boomOut * 0.12);
  const bellyY = (head + clewY) / 2;

  el.sail.setAttribute(
    "d",
    `M ${mastX} ${head} ` +
      `Q ${bellyX.toFixed(1)} ${bellyY.toFixed(1)} ${clewX.toFixed(1)} ${clewY.toFixed(1)} ` +
      `L ${mastX} ${foot} Z`
  );
}

function render(heading) {
  const twa = trueWindAngle(heading);
  const tack = tackOf(heading);
  const band = bandFor(twa);

  // Rotate the boat group.
  el.boat.setAttribute("transform", `rotate(${heading} ${CX} ${CY})`);
  drawSail(twa, tack || "Port");

  // Colour-code the no-go wedge state.
  el.nogo.classList.toggle("nogo--active", band.id === "nogo");

  // Readout.
  el.point.textContent = band.name;
  el.point.dataset.band = band.id;
  el.heading.textContent = `${String(Math.round(heading)).padStart(3, "0")}°`;
  el.twa.textContent = `${Math.round(twa)}°`;
  el.tack.textContent = tack || "—";
  el.trim.textContent = band.trim;

  // Highlight the matching legend row.
  for (const li of el.legend.children) {
    li.classList.toggle("legend__item--active", li.dataset.band === band.id);
  }
}

function buildLegend() {
  el.legend.innerHTML = "";
  for (const b of BANDS) {
    const li = document.createElement("li");
    li.className = "legend__item";
    li.dataset.band = b.id;
    const range =
      b.id === "running"
        ? "160–180°"
        : b.id === "nogo"
        ? `0–${b.max}°`
        : `${b.min}–${b.max}°`;
    li.innerHTML =
      `<span class="legend__swatch" data-band="${b.id}"></span>` +
      `<span class="legend__name">${b.name}</span>` +
      `<span class="legend__range">${range}</span>`;
    li.addEventListener("click", () => {
      const mid = (b.min + Math.min(b.max, 180)) / 2;
      setHeading(Math.round(mid));
    });
    el.legend.appendChild(li);
  }
}

// --- input ------------------------------------------------------------------

function setHeading(heading) {
  const h = ((Math.round(heading) % 360) + 360) % 360;
  el.slider.value = String(h);
  render(h);
}

function headingFromPoint(clientX, clientY) {
  const rect = el.scene.getBoundingClientRect();
  // Map client coords into the 400x400 viewBox.
  const x = ((clientX - rect.left) / rect.width) * 400 - CX;
  const y = ((clientY - rect.top) / rect.height) * 400 - CY;
  // atan2 with 0° = up, clockwise positive.
  let deg = (Math.atan2(x, -y) * 180) / Math.PI;
  return ((Math.round(deg) % 360) + 360) % 360;
}

function wireInput() {
  el.slider.addEventListener("input", (e) => render(Number(e.target.value)));

  let dragging = false;
  const onMove = (clientX, clientY) => setHeading(headingFromPoint(clientX, clientY));

  el.scene.addEventListener("pointerdown", (e) => {
    dragging = true;
    el.scene.setPointerCapture(e.pointerId);
    onMove(e.clientX, e.clientY);
  });
  el.scene.addEventListener("pointermove", (e) => {
    if (dragging) onMove(e.clientX, e.clientY);
  });
  el.scene.addEventListener("pointerup", (e) => {
    dragging = false;
    el.scene.releasePointerCapture(e.pointerId);
  });

  // Arrow keys nudge the heading (slider already handles this when focused,
  // but support it globally for convenience).
  document.addEventListener("keydown", (e) => {
    if (document.activeElement === el.slider) return; // native slider handles it
    if (e.key === "ArrowLeft") setHeading(Number(el.slider.value) - 1);
    else if (e.key === "ArrowRight") setHeading(Number(el.slider.value) + 1);
    else return;
    e.preventDefault();
  });
}

// --- boot -------------------------------------------------------------------

drawNoGoZone();
buildLegend();
wireInput();
render(Number(el.slider.value));
