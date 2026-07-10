# 07 — Shorthand import with token-pinpointing parse errors

Status: ready-for-human

## Implementation notes

- Parser lives in `crates/netball-core/src/shorthand.rs` (`parse_shorthand` →
  `Vec<LogEntry>`, or a located `ShorthandError` with line/column/token/kind).
  Exposed over the boundary as `parse_shorthand` in `netball-wasm`, faced in TS
  by `parseShorthand` in `web/src/engine.ts`, and driven from an "Import from
  Shorthand" textarea on the match list (`web/src/MatchListScreen.tsx`), which
  lands on the new match's stat views.
- Comments are blanked in place (not removed) so error columns still point at
  the original line. Positions `1`–`8` map to GS…GK, TEAM; illegal
  position/action pairs are rejected at the position via the same subset enums
  the type system enforces.
- **Deferred:** the `S` substitution marker. The base grammar carries no
  position/player, and the model's `Substitution` requires both; per the
  maintainer this is left for later. `S` is recognised and rejected with a clear
  `SubstitutionNotSupported` message rather than a generic parse error, so it is
  easy to slot in. All other markers/tokens are complete.

## Parent

`.scratch/v1/PRD.md` (user stories 34, 35; partial 28)

## What to build

The power-user path: paste Shorthand text into an import screen and get a complete match. The parser lives in `netball-core` and must accept the predecessor's grammar in full: positions 1–8, actions `c f g e p pi pd pp i r`, `x` (Failed) and `!` (Flagged) modifiers, `QT` and `S` markers, parenthetical comments stripped before parsing, one possession per line, single-team default and two-team `a`/`b` prefixes, and greedy sub-type matching (`1pi` is a GS Interception, never Gain + Infringement).

Errors are the headline feature over the predecessor: a failed parse reports the line and token with a readable reason, and imports nothing. Imported matches carry no timestamps and must flow through the same stat views with Playing Time absent.

## Acceptance criteria

- [x] Pasting valid Shorthand creates a match whose events match the grammar's meaning, including team attribution in two-team input
- [x] Greedy sub-type matching and comment stripping behave exactly as the predecessor's documented grammar
- [~] `QT` and `S` markers become quarter and substitution marker events — `QT` done; `S` deferred (see notes)
- [x] A parse failure pinpoints line and token with a human-readable reason, and no partial match is created
- [x] An imported match renders in all stat views with Playing Time absent and counts exact
- [x] Core parser tests: each token type, modifier stacking, comments, both team modes, and a suite of malformed inputs asserting error positions

## Blocked by

- `03-full-taxonomy-live-coding.md`
