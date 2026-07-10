# 02 — Record a Goal, see the score

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user stories 5, 8, 11, 12, 14, 32)

## What to build

The first real domain tracer bullet, kept deliberately tiny in vocabulary so it forces every seam to exist: a Coder creates a Match (both team names, date), sees it in a match list, opens a live screen with a Goal button for the active team and a one-tap Opposition goal button, and watches the running score update. Undo removes the last event. Everything survives a reload.

The event model starts minimal but structurally final per ADR-0003: two-team-native (every event carries a team), append-only log as the only stored truth, optional wall-clock timestamp captured on live taps. The score must be derived by `netball-core` from the log — never counted in TypeScript. Opposition goals are ordinary Goal events attributed to the other team, no special case. TypeScript owns persistence in IndexedDB; event logs cross the WASM boundary as data, with TS types generated from the Rust types.

## Acceptance criteria

- [x] Create a match with both team names and a date; it appears in a match list and can be reopened
- [x] Tapping Goal / Opposition goal appends a Goal event attributed to the correct team, with a timestamp; the running score updates
- [x] The score shown is derived by `netball-core` from the event log across the WASM boundary
- [x] Undo removes the last event from the log and the score re-derives correctly
- [x] After a browser reload (and offline), the match, its events, and its score are intact
- [x] Core unit tests: score derivation from an event log, including the empty log and post-undo logs
- [x] Playwright: create match → record goals for both teams → undo → reload → score correct

## Blocked by

- `01-walking-skeleton.md`

## Comments

**2026-07-10 (agent):** Implemented. Core model (`netball-core`): `Team` (`A`/`B`, positional — which slot is the active team is caller metadata), `Action` (only `Goal` so far), `Event { team, action, timestamp_ms: Option<i64> }`, and `derive_score(&[Event]) -> Score`; opposition goals are plain Goal events on team B, no special case. TS boundary types are generated from the Rust types via ts-rs behind a `ts-bindings` feature (`npm run build:types` → `web/src/types/`, gitignored like the wasm output; `timestamp_ms` pinned to `number | null` since ts-rs would map i64 → bigint). `netball-wasm` exposes `derive_score` via serde-wasm-bindgen; `web/src/engine.ts` is the typed facade. TS owns persistence: one IndexedDB document per match (`web/src/storage.ts`, db `centrepass`, store `matches`) holding metadata + the append-only log; undo is `events.slice(0, -1)` in TS (log editing, not derivation — the score always re-derives in Rust). UI is hash-routed (`#/` list, `#/match/<id>` live screen) so a reload lands back on the live screen. Playwright covers the full loop including an offline reload and an IndexedDB shape assertion (team attribution + numeric timestamps). All seams green: cargo fmt/clippy/test (6 core tests) and 3 Playwright tests. No CI changes needed — the web job already has cargo for `build:types`.
