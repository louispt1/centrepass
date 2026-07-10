# 03 — Full NVAC taxonomy on the live coding screen

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user stories 8, 9, 10, 13, 17, 18, 19; partial 4)

## What to build

Widen the event vocabulary from "Goal" to the full NVAC-aligned taxonomy in `CONTEXT.md`, and build the real live coding surface: a position grid (GS–GK plus TEAM) and action buttons for Centre Pass Receive, Feed, Goal/Shot, Unforced Turnover, Gain (bare or with Interception/Deflection/Pick-up sub-type), Infringement, and Rebound, with Failed and Flagged modifiers. This screen is the make-or-break UI (see the PRD): one-handed phone use, daylight-legible, a possession recordable in a couple of seconds.

In the core, invalid events should be unrepresentable at the type level (e.g. shots only by GS/GA), and the UI should never offer a combination the core would reject. Show a strip of the last few recorded events so the Coder can spot-check without leaving the screen, keep undo working across all event types, and hold a screen wake lock while coding.

## Acceptance criteria

- [x] Every coded action in the `CONTEXT.md` taxonomy is recordable by taps as position + action, with Failed and Flagged applicable where meaningful
- [x] Gain is recordable bare or with a sub-type (Interception, Deflection, Pick-up)
- [x] Illegal position/action combinations cannot be constructed in `netball-core` and are not offered by the UI
- [x] The last few events are visible on the live screen and undo works across all event types
- [x] The screen wake lock is held during live coding and released after
- [x] The layout is usable one-handed on a phone viewport (Playwright runs against a phone-sized viewport)
- [x] Core tests cover event construction and validation across the taxonomy; Playwright codes a realistic multi-possession sequence including modifiers and a Gain sub-type

## Blocked by

- `02-record-a-goal.md`

## Comments

**2026-07-10 (agent):** Implemented. Type-level validity: each `Action` variant carries a position-subset enum (`GoalPosition { GS, GA, TEAM }`, `FeedPosition { GS, GA, WA, C }`, `CentrePassReceivePosition { GA, WA, WD, GD }`, `ReboundPosition { GS, GA, GD, GK }`; Gain/UnforcedTurnover/Infringement take any `Position` incl. TEAM), so illegal combos can't be constructed and fail serde deserialization at the boundary. TEAM is allowed on Goal because the one-tap Opposition goal is a goal whose shooter isn't coded — exactly TEAM's "not attributable to an individual" meaning. Failed is baked into only the failable variants (CentrePassReceive, Feed, Goal — a failed Goal is the missed shot per the glossary); `flagged` is event-level. Actions serialize internally tagged (`{"type":"Goal","position":"GS","failed":false}`) so the generated TS is a discriminated union. The UI never duplicates the rules: `netball-core::action_taxonomy()` exposes legal positions / can-fail / sub-types as data across WASM, the live screen enables buttons from it, and a core test proves the table agrees exactly with what serde accepts (all 56 kind×position combos). Live screen: Failed/Flagged toggles (reset after each event), 4×2 position grid, taxonomy-driven action grid + Gain sub-type row, last-4 event strip, wake lock via a `useScreenWakeLock` hook (re-acquires on visibilitychange; Playwright observes request/release through a stubbed `navigator.wakeLock`). Playwright now runs on a Pixel 7 viewport, with tests for a 10-event multi-possession sequence (modifiers + Interception sub-type, IndexedDB shape asserted), combination legality, wake-lock lifecycle, and no-overflow/≥44px tap targets. IndexedDB bumped to v2 with an in-place migration rewriting issue-02-era string actions to `{type:"Goal",position:"TEAM"}`. All green: 18 core tests, clippy/fmt, 7 Playwright tests.
