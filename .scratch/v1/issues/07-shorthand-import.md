# 07 — Shorthand import with token-pinpointing parse errors

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user stories 34, 35; partial 28)

## What to build

The power-user path: paste Shorthand text into an import screen and get a complete match. The parser lives in `netball-core` and must accept the predecessor's grammar in full: positions 1–8, actions `c f g e p pi pd pp i r`, `x` (Failed) and `!` (Flagged) modifiers, `QT` and `S` markers, parenthetical comments stripped before parsing, one possession per line, single-team default and two-team `a`/`b` prefixes, and greedy sub-type matching (`1pi` is a GS Interception, never Gain + Infringement).

Errors are the headline feature over the predecessor: a failed parse reports the line and token with a readable reason, and imports nothing. Imported matches carry no timestamps and must flow through the same stat views with Playing Time absent.

## Acceptance criteria

- [ ] Pasting valid Shorthand creates a match whose events match the grammar's meaning, including team attribution in two-team input
- [ ] Greedy sub-type matching and comment stripping behave exactly as the predecessor's documented grammar
- [ ] `QT` and `S` markers become quarter and substitution marker events
- [ ] A parse failure pinpoints line and token with a human-readable reason, and no partial match is created
- [ ] An imported match renders in all stat views with Playing Time absent and counts exact
- [ ] Core parser tests: each token type, modifier stacking, comments, both team modes, and a suite of malformed inputs asserting error positions

## Blocked by

- `03-full-taxonomy-live-coding.md`
