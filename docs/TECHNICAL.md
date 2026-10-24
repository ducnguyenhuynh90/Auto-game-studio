# Technical

- Vite 6 + TypeScript 5.8 (strict), three.js 0.170, Vitest 3. Production bundle ≈ 160 KB gzipped.
- Two stacked canvases: `#world` (WebGL) under `#game` (2D UI). Both are sized to the 390×844 logical view,
  scaled to fit the window at devicePixelRatio ≤ 3.
- Input: Pointer Events → `Game.pointerDown/Up`. Immediate-mode hit areas are rebuilt each frame, and only
  the top overlay is interactive.
- Persistence: localStorage `mam_save_v1` (versioned). Analytics: see docs/ANALYTICS.md.
- Audio: procedural WebAudio SFX (no assets), unlocked on first tap. Haptics through `navigator.vibrate`.
- Deploy: `.github/workflows/pages.yml` builds and publishes `dist/` on pushes to `main`
  (Pages must be enabled in the repo settings). CI runs tests and build on branches and PRs.
- Known: `npm audit` flags dev-only vitest deps (tinypool/@vitest/mocker); there is no runtime exposure.
