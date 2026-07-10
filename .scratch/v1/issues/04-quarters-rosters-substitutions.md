# 04 — Quarters, rosters, substitutions, Playing Time

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user stories 6, 7, 15, 16, 25, 27)

## What to build

Match structure and people. At match setup, the Coder enters the active team's roster — player names assigned to the seven positions — and may start with gaps and fill them later. During live coding, quarter breaks are marked with one tap, and substitutions record which player takes over which position from that moment. Both are events in the log per ADR-0003, so replaying the log reconstructs the roster at any point.

From these, the core derives Playing Time per player (from timestamps on roster and substitution events, gracefully absent when a log has no timestamps) and the quarter-by-quarter score. From this slice on, every stat attributes an event to the player occupying its position at that moment in the log, not just to the position.

## Acceptance criteria

- [ ] Roster entry at match setup assigns player names to positions; an incomplete roster does not block starting the match and can be completed mid-match
- [ ] A quarter-break tap records a marker event; the live screen shows the current quarter; the core derives score per quarter
- [ ] A substitution flow records the incoming player and position as an event; subsequent events attribute to the new player
- [ ] Playing Time per player is derived from the log when timestamps exist, and omitted (not zeroed or garbage) when they don't
- [ ] Core tests: substitution at a quarter break, one player occupying two positions in sequence, attribution before/after a substitution, timestamp-free logs
- [ ] Playwright: set up roster → code events → substitute → quarter break → per-quarter score and playing time correct after reload

## Blocked by

- `03-full-taxonomy-live-coding.md`
