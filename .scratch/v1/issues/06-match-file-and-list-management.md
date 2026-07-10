# 06 — Match File export/import and match list management

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user stories 30, 31, 33)

## What to build

The Match File: a versioned (`"version": 1`), self-contained JSON document holding a match's event log and metadata — the unit of export, import, backup, and migration per ADR-0003. (De)serialization lives in `netball-core`. In the UI: export a match via the share sheet or file download, import via a file picker, and manage the match list (rename, delete with confirmation).

A Match File must round-trip perfectly: importing an exported match on another device yields identical stats. Unknown future versions fail with a clear, human-readable message rather than a broken import.

## Acceptance criteria

- [ ] Export produces a single self-contained JSON Match File including the full event log (with roster and substitution events) and metadata
- [ ] Import recreates the match; every stat view shows values identical to the exporting device
- [ ] Property test in core: serialize → deserialize round-trips to an identical match for arbitrary valid matches
- [ ] Importing a file with an unrecognised version (or malformed content) is rejected with a clear message and no partial state
- [ ] Matches can be renamed and deleted from the match list; deletion asks for confirmation
- [ ] Playwright: export a coded match → delete it → re-import the file → stats identical

## Blocked by

- `04-quarters-rosters-substitutions.md`
