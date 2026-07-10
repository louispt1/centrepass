# 03 — Full NVAC taxonomy on the live coding screen

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user stories 8, 9, 10, 13, 17, 18, 19; partial 4)

## What to build

Widen the event vocabulary from "Goal" to the full NVAC-aligned taxonomy in `CONTEXT.md`, and build the real live coding surface: a position grid (GS–GK plus TEAM) and action buttons for Centre Pass Receive, Feed, Goal/Shot, Unforced Turnover, Gain (bare or with Interception/Deflection/Pick-up sub-type), Infringement, and Rebound, with Failed and Flagged modifiers. This screen is the make-or-break UI (see the PRD): one-handed phone use, daylight-legible, a possession recordable in a couple of seconds.

In the core, invalid events should be unrepresentable at the type level (e.g. shots only by GS/GA), and the UI should never offer a combination the core would reject. Show a strip of the last few recorded events so the Coder can spot-check without leaving the screen, keep undo working across all event types, and hold a screen wake lock while coding.

## Acceptance criteria

- [ ] Every coded action in the `CONTEXT.md` taxonomy is recordable by taps as position + action, with Failed and Flagged applicable where meaningful
- [ ] Gain is recordable bare or with a sub-type (Interception, Deflection, Pick-up)
- [ ] Illegal position/action combinations cannot be constructed in `netball-core` and are not offered by the UI
- [ ] The last few events are visible on the live screen and undo works across all event types
- [ ] The screen wake lock is held during live coding and released after
- [ ] The layout is usable one-handed on a phone viewport (Playwright runs against a phone-sized viewport)
- [ ] Core tests cover event construction and validation across the taxonomy; Playwright codes a realistic multi-possession sequence including modifiers and a Gain sub-type

## Blocked by

- `02-record-a-goal.md`
