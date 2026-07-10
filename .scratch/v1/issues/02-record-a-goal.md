# 02 — Record a Goal, see the score

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user stories 5, 8, 11, 12, 14, 32)

## What to build

The first real domain tracer bullet, kept deliberately tiny in vocabulary so it forces every seam to exist: a Coder creates a Match (both team names, date), sees it in a match list, opens a live screen with a Goal button for the active team and a one-tap Opposition goal button, and watches the running score update. Undo removes the last event. Everything survives a reload.

The event model starts minimal but structurally final per ADR-0003: two-team-native (every event carries a team), append-only log as the only stored truth, optional wall-clock timestamp captured on live taps. The score must be derived by `netball-core` from the log — never counted in TypeScript. Opposition goals are ordinary Goal events attributed to the other team, no special case. TypeScript owns persistence in IndexedDB; event logs cross the WASM boundary as data, with TS types generated from the Rust types.

## Acceptance criteria

- [ ] Create a match with both team names and a date; it appears in a match list and can be reopened
- [ ] Tapping Goal / Opposition goal appends a Goal event attributed to the correct team, with a timestamp; the running score updates
- [ ] The score shown is derived by `netball-core` from the event log across the WASM boundary
- [ ] Undo removes the last event from the log and the score re-derives correctly
- [ ] After a browser reload (and offline), the match, its events, and its score are intact
- [ ] Core unit tests: score derivation from an event log, including the empty log and post-undo logs
- [ ] Playwright: create match → record goals for both teams → undo → reload → score correct

## Blocked by

- `01-walking-skeleton.md`
