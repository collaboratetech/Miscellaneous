const REFRESH_MS = 3000;

const els = {
  beach: document.getElementById('beach'),
  view: document.getElementById('view'),
  refresh: document.getElementById('refresh'),
  count: document.getElementById('count'),
  umbrellas: document.getElementById('umbrellas'),
  busyness: document.getElementById('busyness'),
  age: document.getElementById('age'),
  frames: document.getElementById('frames'),
  img: document.getElementById('viewer-img'),
  status: document.getElementById('viewer-status'),
};

let currentBeach = null;
let refreshTimer = null;

async function loadBeaches() {
  const res = await fetch('/api/beaches');
  if (!res.ok) throw new Error('Failed to load beaches');
  const beaches = await res.json();
  els.beach.innerHTML = '';
  for (const b of beaches) {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = `${b.name} (${b.location})`;
    els.beach.appendChild(opt);
  }
  if (beaches.length > 0) currentBeach = beaches[0].id;
}

function formatAge(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds.toFixed(0)}s ago`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s ago`;
}

function setBusyness(label) {
  els.busyness.textContent = label || '—';
  els.busyness.className = 'stat-value busyness-' + (label || '');
}

async function refreshStats() {
  if (!currentBeach) return;
  try {
    const res = await fetch(`/api/beaches/${currentBeach}/stats`);
    if (!res.ok) throw new Error('stats failed');
    const s = await res.json();
    els.count.textContent = s.people_count;
    els.umbrellas.textContent = s.umbrella_count;
    setBusyness(s.busyness);
    els.age.textContent = formatAge(s.last_frame_age_seconds);
    els.frames.textContent = s.frames_processed;
    if (s.frames_processed > 0) {
      els.status.classList.add('hidden');
    } else if (s.last_error) {
      els.status.classList.remove('hidden');
      els.status.textContent = `Error: ${s.last_error}`;
    } else {
      els.status.classList.remove('hidden');
      els.status.textContent = 'Waiting for the first frame… (model may be downloading on first run)';
    }
  } catch (e) {
    // Leave previous values up; transient errors shouldn't blank the UI.
  }
}

function refreshImage() {
  if (!currentBeach) return;
  const view = els.view.value;
  const path = view === 'frame' ? 'frame.jpg' : view === 'heatmap' ? 'heatmap.jpg' : 'overlay.jpg';
  // Cache-bust so the browser actually re-fetches.
  els.img.src = `/api/beaches/${currentBeach}/${path}?t=${Date.now()}`;
}

function tick() {
  refreshStats();
  refreshImage();
}

function startTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(tick, REFRESH_MS);
}

els.beach.addEventListener('change', () => {
  currentBeach = els.beach.value;
  tick();
});

els.view.addEventListener('change', refreshImage);
els.refresh.addEventListener('click', tick);

(async () => {
  try {
    await loadBeaches();
    tick();
    startTimer();
  } catch (e) {
    els.status.textContent = `Failed to start: ${e.message}`;
  }
})();
