# Contributing to CentrePass

Thanks for helping. This guide covers the layout, the two test seams, and the
housekeeping CI enforces. Start with [CONTEXT.md](CONTEXT.md) (the domain
glossary) and [docs/adr/](docs/adr/) (the three architecture decisions) before
touching domain logic.

## Architecture in one paragraph

All netball knowledge lives in the pure Rust crate `netball-core` — the event
model, the Shorthand parser, validation, and every statistic, derived from an
append-only event log that is the only stored truth (ADR-0003). It has no WASM,
browser, or I/O dependencies (ADR-0002). `netball-core` is compiled to
WebAssembly by the thin `netball-wasm` wrapper (translation only, no logic), and
the `web` app — Vite + React + TypeScript — owns the UI and IndexedDB
persistence. The TypeScript boundary types are **generated** from the Rust types,
so the seam cannot drift.

## The two test seams

Correctness is anchored at two seams; a change usually touches one or the other.

### 1. The crate seam — `cargo test` over the domain

Everything that is a rule about netball is tested here, natively, with no browser
in sight. This is where you add a test when you change a derivation, the event
model, the parser, or the taxonomy.

```sh
cargo test --workspace           # all Rust tests
cargo test -p netball-core       # just the domain engine
```

Two suites in this seam are worth knowing:

- **Golden parity** (`crates/netball-core/tests/golden_parity.rs`) — the
  correctness anchor for the whole rewrite: real historical matches migrated
  from the predecessor app, paired with that app's derived stats, asserting the
  engine reproduces them exactly. Legitimate differences are recorded in
  `tests/golden/deviations.json` and explained in `tests/golden/DEVIATIONS.md`.
  **Never** edit a fixture to make a test pass — fix the engine or record a
  deviation.
- **Property tests** (proptest) — e.g. any valid match round-trips through its
  Match File.

### 2. The Playwright seam — end-to-end against the built app

Everything that is about the app — screens, persistence, offline, share/export —
is tested here, driving the real built PWA in a phone-sized browser. Playwright
runs against the **production build**, so build first (CI does this in one step):

```sh
cd web
npm ci
npm run build                    # WASM + generated types + tsc + Vite build
npm test                         # Playwright, all specs
npx playwright test offline-audit   # one spec (the full offline flow)
```

The specs assert user-visible behaviour by `data-testid`; the offline audit
(`tests/offline-audit.spec.ts`) runs the whole v1 flow with the network cut.

## Generated files you must keep current

Two artifacts are generated from `netball-core` and checked into the tree; CI
fails if they drift.

- **TypeScript boundary types** (`web/src/types/`) — from the Rust types via
  ts-rs. Regenerate with `npm run build:types` (part of `npm run build`).
- **`DEFINITIONS.md`** — the NVAC action definitions, generated from
  `crates/netball-core/src/definitions.rs`, the same data the in-app reference
  reads. After changing the definitions, regenerate it:

  ```sh
  REGEN_DEFINITIONS=1 cargo test -p netball-core regenerate_definitions_md
  ```

  A normal `cargo test` run then checks it is current.

The volunteer quickstart images (`docs/img/`) are regenerated with
`cd web && npm run screenshots` after a UI change; that spec is skipped in a
normal test run.

## Before you push

CI runs, and you can run locally:

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cd web && npm run build && npm test
```

Match the surrounding code's style, comment density, and naming. Keep domain
logic in `netball-core`; keep `netball-wasm` a pure translator; keep the UI free
of netball rules it could instead ask the core for.
