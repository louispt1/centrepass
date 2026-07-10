# 04 — Quarters, rosters, substitutions, Playing Time

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user stories 6, 7, 15, 16, 25, 27)

## What to build

Match structure and people. At match setup, the Coder enters the active team's roster — player names assigned to the seven positions — and may start with gaps and fill them later. During live coding, quarter breaks are marked with one tap, and substitutions record which player takes over which position from that moment. Both are events in the log per ADR-0003, so replaying the log reconstructs the roster at any point.

From these, the core derives Playing Time per player (from timestamps on roster and substitution events, gracefully absent when a log has no timestamps) and the quarter-by-quarter score. From this slice on, every stat attributes an event to the player occupying its position at that moment in the log, not just to the position.

## Acceptance criteria

- [x] Roster entry at match setup assigns player names to positions; an incomplete roster does not block starting the match and can be completed mid-match
- [x] A quarter-break tap records a marker event; the live screen shows the current quarter; the core derives score per quarter
- [x] A substitution flow records the incoming player and position as an event; subsequent events attribute to the new player
- [x] Playing Time per player is derived from the log when timestamps exist, and omitted (not zeroed or garbage) when they don't
- [x] Core tests: substitution at a quarter break, one player occupying two positions in sequence, attribution before/after a substitution, timestamp-free logs
- [x] Playwright: set up roster → code events → substitute → quarter break → per-quarter score and playing time correct after reload

## Blocked by

- `03-full-taxonomy-live-coding.md`

## Comments

**2026-07-10 (agent):** Implemented. Data model: the log is now `Vec<LogEntry>` — a `kind`-tagged sum of `Event` (unchanged), `QuarterBreak { timestampMs }`, and `Substitution { team, position: CourtPosition, player, timestampMs }` — so markers get undo/replay/re-derivation for free (ADR-0003). There is no separate roster event: the initial roster entered at setup is coded as ordinary Substitutions (one per assigned position), so "roster = fold of substitutions" holds at every point in the log, an incomplete roster is just a position with no substitution yet, and one UI flow covers setup, gap-filling, and mid-match subs. `CourtPosition` (the seven positions, no TEAM) makes a substitution to TEAM unrepresentable. New derivations in `netball-core`: `derive_quarter_scores` (log segmented on breaks; current quarter = its length), `derive_roster(log, team)`, `derive_attributions(log)` (player per entry, `None` for markers/TEAM/unfilled — order-based, works without timestamps), and `derive_playing_time(log, team) -> Option<Vec<PlayingTime>>` — `None` when any of the team's substitutions lacks a timestamp; `Some(vec![])` (knowledge, not absence) when there's no roster; stints run from the placing substitution to replacement or the log's last timestamped moment, accumulating across positions. UI: match creation now lands on `#/match/<id>/roster` (7 inputs prefilled from the derived roster; saving appends a Substitution per changed name); the live screen gets an "End Qn"/"Full time" button (disabled after the 4th break, which reads FT), a current-quarter indicator, a "Roster / Sub" link, player names in the event strip (attribution visible on the very next tap after a sub), and a collapsed "Match stats" details with per-quarter scores and playing time. IndexedDB bumped to v3: `events` renamed to `log`, entries wrapped as `{kind:"Event", ...}`, with the v1 bare-"Goal" migration folded into the same cursor pass. One real bug found by the browser seam: `derive_playing_time` panicked (wasm `unreachable`) on a roster-less, timestamp-less log — fixed with the early `Some(vec![])` return and a core regression test. All green: 41 core tests, clippy `-D warnings`/fmt, 9 Playwright tests (new spec: full roster→sub→quarter flow incl. reload + persisted marker kinds, and a full-time/undo-reopens-Q4 test).
