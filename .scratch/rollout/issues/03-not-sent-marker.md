# 03 - "Not sent" marker on the match list

Status: ready-for-agent

## Parent

`.scratch/rollout/map.md` (Q5)

## What to build

This catches the matches issue 02 misses: a coder who closed the app at full time, or corrected a match after sending it. Store two local-only fields on `StoredMatch` (`storage.ts`). They are never written into the Match File:

- `changedAtMs`: set whenever the log changes
- `sentAtMs`: set when the Match File is exported or shared

A match is **not sent** if it has no `sentAtMs`, or if `changedAtMs` is later than `sentAtMs`. The match list shows a small "Not sent" marker on those matches. Existing matches without the fields show as not sent.

## Acceptance criteria

- [ ] New and existing matches show "Not sent" until exported
- [ ] Exporting (from the list or from Stats) clears the marker
- [ ] Any later log change (event, undo, quarter break, substitution) brings it back
- [ ] Neither field appears in the Match File
- [ ] Playwright: code → marker shown → export → marker gone → undo → marker back

## Blocked by

- `02-send-match-file-at-full-time.md` (shares the export path that sets `sentAtMs`)
