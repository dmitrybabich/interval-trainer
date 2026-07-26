# Repo conventions

## Workflow

1. Implement first. No unit tests until user reviews the change.
2. Never `git commit` without explicit user instruction — commit approval is single-use.
3. When changing existing logic: don't rewrite tests to match; run them as-is and report failures.

## Code

- Named exports only (no `export default`).
- Immutable array ops: `.toSorted()`, `.toReversed()`.
- Reuse `cn()` from `@/lib/utils` for classnames.
- Path alias: `@/` → `src/`. Wired in `tsconfig.json`, `vite.config.ts`,
  `vitest.config.ts`.
- No comments that restate the code. Comment the "why", the tradeoff, the
  workaround, or the invariant.
- Keep functions small. Extract when a comment would just caption a block.

## Architecture

- The rAF pitch-detection loop lives in `useTrainer` and writes to **refs**, not
  React state. React state holds only the user-facing snapshot; the canvas draws
  imperatively via `onFrame`.
- Audio primitives live in `AudioEngine` — a plain imperative class, no React.
- Musical constants (`LEVELS`, `RANGE_BASE`, `TOUCH_MS`, etc.) are the parity
  spec: don't change values without a reason, they are tuned.

## Testing

- Vitest + jsdom, tests in `src/test/*.spec.ts` (not co-located).
- Testing-library available; no snapshot-heavy tests.
- `globals: true` — no need to import `describe/it/expect`.

## Lint

- Pre-commit runs typecheck + `eslint --max-warnings 0` + `vitest run`.
- Pastry-derived rule set: sonarjs, security, unicorn, tailwindcss,
  react-hooks, promise, regexp, simple-import-sort, better-max-params,
  Prettier last.
- Domain-specific relaxes: `no-magic-numbers` off (audio code is full of
  meaningful literals), `pseudo-random` off (music trainer, not crypto),
  `unbound-method` off (React hook callbacks are always stable).
