# Interval Trainer

Web-based vocal interval trainer — sing "ah", get real-time pitch feedback. Nine
levels from single-note to major triad, with support for guided/ear modes,
direction toggle, and a guide-tone easy mode.

Runs entirely in the browser. Nothing uploaded.

## Stack

React 18 + TypeScript + Vite + Tailwind (shadcn/ui) + framer-motion.
Pitch detection: [pitchy](https://github.com/ianprime0509/pitchy) (McLeod method).
Piano samples: soundfont-player + MusyngKite.

## Scripts

```bash
pnpm dev         # local dev server
pnpm build       # tsc --noEmit + vite build → dist/
pnpm preview     # serve the built site
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint src
pnpm test        # vitest --watch
pnpm test:run    # vitest run
```

Pre-commit hook (typecheck + lint + tests): `git config core.hooksPath .githooks`.

## Layout

```
src/
  App.tsx           screen router
  audio/            AudioEngine (Web Audio, pitchy, soundfont)
  hooks/            useTrainer (rAF loop), useCalibration, usePrefs
  lib/              pure music/persistence/constants
  components/       PitchMeter, SequenceDots, CoverageMap, SoundBadge
    screens/        Setup / Calibration / Trainer
    ui/             shadcn primitives
  test/             *.spec.ts
```

## PWA

Installable and offline-capable via `vite-plugin-pwa` (Workbox). The app shell is
precached; the piano samples and pitchy module (loaded from CDNs at runtime) are
cached on first fetch, so a revisit works offline. Service worker auto-updates on
reload. Install from the browser's "Install app" / "Add to Home Screen" prompt.

Note: PWA features (service worker, install) only run in the **production build**
(`pnpm build && pnpm preview`), not `pnpm dev`.

## Deployment

Pushes to `master` build and publish to GitHub Pages via `.github/workflows/deploy.yml`.
Base path is `/interval-trainer/`. One-time setup in the repo settings: enable Pages
with source = "GitHub Actions".
