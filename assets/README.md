# Add-in icons

Place the following PNG icons here. They are referenced from `manifest.xml`
and served at `https://localhost:3000/assets/`:

- `icon-16.png`  — 16×16 ribbon icon
- `icon-32.png`  — 32×32 ribbon icon (high DPI)
- `icon-64.png`  — 64×64 store icon (referenced as `IconUrl`)
- `icon-80.png`  — 80×80 ribbon icon (extra high DPI)
- `icon-128.png` — 128×128 store icon (referenced as `HighResolutionIconUrl`)

Until you drop real PNGs in, Office will fall back to default placeholders
in the ribbon. `copy-webpack-plugin` is configured with
`noErrorOnMissing: true`, so the build will not fail when the files are
absent.
