# PRD: CentrePass v1 — open-source Rust/WASM netball stats PWA

Status: ready-for-agent

> Governing docs in this repo: `CONTEXT.md` (glossary — use its vocabulary), `docs/adr/0001–0003`, `docs/ROADMAP.md`. Implementation issues: `.scratch/v1/issues/`. Originally drafted in the predecessor repo (louispt1/Netballstats) on 2026-07-10.

## Problem Statement

Netball clubs have no accessible way to record match statistics. The predecessor tool works — it records NVAC-aligned match events and derives rich per-player and per-team stats — but it is unusable by anyone except its author: data entry requires learning a typed shorthand grammar and a terminal, viewing requires running a Python dashboard, and sharing requires committing a SQLite file to git. A club volunteer courtside with a phone, at a venue with no signal, has no path to using it at all. Meanwhile the author wants the project to become a shareable open-source application, and wants to build its core in Rust.

## Solution

A local-first Progressive Web App. A club volunteer (the Coder) opens a link, adds the app to their home screen, and records a match live with big tap targets — positions, actions, failed/flagged modifiers, quarter breaks, substitutions, one-tap Opposition goals — entirely offline. Every statistic is derived from the append-only event log by a pure Rust domain engine (`netball-core`) compiled to WASM. After the match, the coach reads per-player stat views and shares a Summary Image to the club chat; the Match File (JSON) covers export, import, backup, and migration. The typed Shorthand survives as a power-user import path. No server, no accounts, no install: static hosting only.

## User Stories

### Getting started

1. As a Coder, I want to open the app from a plain URL with nothing to install, so that I can start recording matches with zero setup.
2. As a Coder, I want to add the app to my phone's home screen, so that it launches full-screen like a native app.
3. As a Coder, I want the app to work fully offline once loaded, so that a court with no signal never blocks recording.
4. As a Coder, I want a quick in-app reference for positions and actions, so that I don't need to memorise the taxonomy before my first match.

### Match setup

5. As a Coder, I want to create a match with both team names and a date, so that matches are identifiable in my match list later.
6. As a Coder, I want to enter my team's roster and assign a player name to each of the seven positions, so that stats are attributed to real players.
7. As a Coder, I want to start recording even with an incomplete roster, so that a late team sheet doesn't delay the first centre pass.

### Live coding

8. As a Coder, I want big tap targets for recording an event as position + action, so that I can record a possession in a couple of seconds without watching the screen instead of the game.
9. As a Coder, I want to mark an event as Failed, so that unsuccessful shots and feeds are distinguished from successful ones.
10. As a Coder, I want to mark an event as Flagged, so that ambiguous moments can be reviewed later.
11. As a Coder, I want a one-tap "Opposition goal" button, so that the scoreboard stays correct without coding the other team in detail.
12. As a Coder, I want an undo button, so that a mis-tap doesn't permanently corrupt the match record.
13. As a Coder, I want to see the last few recorded events on screen, so that I can spot-check that what I tapped is what was recorded.
14. As a Coder, I want to see the running score and current quarter at all times, so that I can trust the app is keeping up with the game.
15. As a Coder, I want to mark quarter breaks, so that stats and scores can be broken down by quarter.
16. As a Coder, I want to record a substitution (which player takes over which position, and when), so that playing time and per-player attribution stay correct after changes.
17. As a Coder, I want the screen to stay awake during recording, so that my phone doesn't lock mid-quarter.
18. As a Coder, I want the live coding screen to be usable one-handed and legible in daylight, so that courtside conditions don't defeat the UI.
19. As a Coder, I want to record Gains with an optional sub-type (Interception, Deflection, Pick-up), so that I can code at the detail level time pressure allows.

### Post-match stats

20. As a coach, I want per-player goal and shot counts with success percentages, so that I can evaluate my shooters.
21. As a coach, I want per-player Feed counts and success percentages, so that I can evaluate circle feeders.
22. As a coach, I want per-player Rebound counts split attacking/defensive, so that I can evaluate work under the post.
23. As a coach, I want per-player Unforced Turnover and Infringement counts, so that I can target training at ball retention and discipline.
24. As a coach, I want per-player Gain counts, so that I can credit defensive pressure.
25. As a coach, I want per-player Playing Time, so that per-player stats can be read in context of minutes on court.
26. As a coach, I want conversion rates (centre-pass-to-goal and gain-to-goal), so that I can see how efficiently possessions become goals.
27. As a coach, I want the quarter-by-quarter score, so that I can see how the match unfolded.
28. As a coach, I want stats for a match recorded with the Shorthand import to be identical in kind to live-coded matches, so that both entry paths feed one system.

### Sharing and data

29. As a coach, I want to share a Summary Image of the match's headline stats, so that results land in the club WhatsApp group in a form people actually look at.
30. As a coach, I want to export a match as a Match File, so that I can back it up or hand it to someone else.
31. As a Coder, I want to import a Match File, so that I can view a match that was recorded on another device.
32. As a Coder, I want my matches to persist on my device across app restarts and browser reloads, so that recording is never lost.
33. As a Coder, I want to rename and delete matches, so that my match list stays tidy.

### Power users and the project

34. As a power-user Coder, I want to paste Shorthand text to import a match, so that my existing transcription workflow keeps working.
35. As a power-user Coder, I want parse errors that pinpoint the offending token, so that fixing a typo in a long transcription is fast.
36. As the maintainer, I want a migration path from the old SQLite database to Match Files, so that historical matches survive the rewrite.
37. As a club member, I want stats defined per the published NVAC taxonomy with visible definitions, so that the numbers are credible and comparable.
38. As an open-source contributor, I want the domain engine to be a documented, pure, natively-testable crate, so that I can contribute derivation logic without touching browser code.

## Implementation Decisions

- **This repository**: Cargo workspace plus a TypeScript app: `netball-core` (pure domain crate — no WASM, browser, or I/O dependencies), a thin wasm-bindgen wrapper crate, and the PWA frontend. Dual-licensed MIT OR Apache-2.0.
- **The core is stateless and pure** (ADR-0002): it exposes parse (Shorthand → events), validate, derive (events → stats report), and Match File (de)serialization. TypeScript owns all persistence in IndexedDB and passes event logs across the boundary as data. Boundary types are generated for TS from the Rust types so they cannot drift.
- **Event log is the source of truth** (ADR-0003): append-only per match; scores, possessions, per-player tables, conversion rates, and Playing Time are always derived, never stored. Undo during live coding operates on the log.
- **Two-team-native event model**: every event carries a team. The v1 live UI codes the active team in detail plus one-tap Opposition goals — which are ordinary Goal events attributed to the other team, with no special case in the core.
- **Event model contents**: Position (GS…GK, TEAM), Action per the NVAC-aligned taxonomy in `CONTEXT.md` (including optional Gain sub-types), Failed and Flagged modifiers, optional wall-clock timestamp, and quarter/substitution markers as events in the log. Derivations must degrade gracefully when timestamps are absent (Shorthand imports): playing time unavailable, order-based stats still exact. The Rust type system should make invalid events unrepresentable (e.g. shots by non-shooters).
- **Match File**: a versioned (`"version": 1`), self-contained JSON document — event log plus metadata. It is the export, import, backup, share, and migration format.
- **NVAC definitions live in the core as data** and generate the human-readable definitions document, preserving citations to Mackay et al. 2023 and the documented deviations (optional gain sub-types, position-derived rebound classification, derived team gains, greedy sub-type matching).
- **PWA delivery** (ADR-0001): static site on GitHub Pages, service worker for full offline, web app manifest, Web Share API for the Summary Image (client-side canvas rendering), screen wake lock during live coding. No server, no accounts, no telemetry.
- **Frontend framework**: deliberately open (Vite-based; React or Svelte) — the implementer picks when the app package is scaffolded; nothing in this PRD depends on the choice.
- **Migration** from the old app is a one-off script that reads the existing SQLite database and emits Match Files; it lives in the predecessor repo and is not part of this app.

## Testing Decisions

Two seams, one per runtime — confirmed with the maintainer:

1. **The `netball-core` public crate API** (primary seam, plain `cargo test`). All domain behavior is tested here as external behavior: Shorthand in → events out, events in → stats report out, Match File round-trips. The anchor is a **golden parity suite**: real historical matches exported from the predecessor's SQLite database, with the Python implementation's derived stats captured as fixtures; the Rust engine must reproduce them exactly. Plus unit tests per derivation rule, parser error-reporting tests, and property tests (e.g. Match File serialize/deserialize round-trip, undo = log without last event).
2. **The browser, end-to-end** (Playwright against the built PWA). Live coding flows, undo, quarters, substitutions, persistence across reload, offline operation, Match File export/import through the UI, Summary Image generation. This seam deliberately also covers the wasm-bindgen boundary and the IndexedDB layer — no dedicated test suite exists for that glue.

A good test asserts observable behavior at one of these two seams — never internal structure, never intermediate representations. There is no prior art (the predecessor has no tests); the Python implementation itself serves as the oracle for the golden fixtures, so fixture generation happens while the old app still runs.

## Out of Scope

- Collections and cross-match/season aggregation (v1.x).
- The Flagged-review UI (the Flagged modifier ships in the model; the review screen does not).
- Read-only share links (compressed event log in a URL fragment) — v1.x.
- Full two-team live tap coding, including automatic possession flipping (later UI addition; the data model already supports it).
- Replay/recode mode, time-to-goal analytics, voice input.
- Any server: sync, accounts, hosted dashboards.
- Roster conveniences (templates, reuse from previous match).
- Native app-store distribution.
- Changes to the predecessor Python app beyond the one-off migration script.

## Further Notes

- Name settled: **CentrePass** (crates.io free, no GitHub repo collisions as of 2026-07-10).
- The live coding screen is the make-or-break surface (user stories 8–19); budget real design iteration and test it at an actual match early — it is the v1 exit criterion in `docs/ROADMAP.md`.
- Implementation is sliced into tracer-bullet issues under `.scratch/v1/issues/`; their dependency order is authoritative.
