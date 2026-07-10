# 01 — Walking skeleton: workspace, PWA shell, CI, Pages deploy

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user stories 1, 2, 3)

## What to build

The thinnest possible end-to-end system: a deployed, installable, offline-capable PWA whose page displays a value computed by the pure Rust domain crate through WASM. No netball behavior yet — this slice exists to make every later slice a matter of adding domain code to working plumbing.

Set up the repository as a Cargo workspace containing the pure `netball-core` crate (no WASM, browser, or I/O dependencies — per ADR-0002) and a thin wasm-bindgen wrapper crate, plus a Vite-based TypeScript app (implementer picks React or Svelte here; record the choice in the README). Include the PWA shell (manifest, service worker), CI covering both test seams, GitHub Pages deployment, and the dual license.

## Acceptance criteria

- [x] Cargo workspace builds with a pure `netball-core` lib crate and a separate wasm-bindgen wrapper crate; `cargo test`, `cargo clippy -- -D warnings`, and `cargo fmt --check` all pass in CI
- [x] The TypeScript app calls a `netball-core` function through WASM and renders its result (e.g. a taxonomy/version string)
- [x] Web app manifest + service worker: after one visit, the app loads with the network disabled, and is installable to a phone home screen
- [x] A Playwright smoke test runs in CI against the built app and asserts the WASM-computed value is rendered
- [x] Pushes to main deploy the built app to GitHub Pages via CI
- [x] MIT and Apache-2.0 license files present; README records the chosen frontend framework

## Blocked by

None - can start immediately

## Comments

**2026-07-10 (agent):** Implemented. Frontend framework choice: **React** (Vite + TypeScript) — largest contributor pool, consistent with ADR-0002's "mature web ecosystem" rationale; recorded in the README. `netball-core` exposes `engine_description()` (NVAC taxonomy citation + crate version); `netball-wasm` wraps it via wasm-bindgen and `wasm-pack` emits the package into `web/src/wasm` (gitignored, rebuilt by `npm run build:wasm`). PWA shell is `vite-plugin-pwa` (generateSW, precache includes the `.wasm`); Playwright covers both the rendered WASM value and an offline reload after first visit. CI (`.github/workflows/ci.yml`): rust job (fmt/clippy/test), web job (wasm-pack build, tsc, vite build, Playwright), Pages deploy on main pushes.
