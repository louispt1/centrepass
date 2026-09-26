# 01 - Match identity across devices

Status: ready-for-agent

## Parent

`docs/adr/0005-match-identity-across-devices.md`

## What to build

The Match File carries the match's `id`, so a match keeps its identity when it moves between phones. Bump `MATCH_FILE_VERSION` in `netball-core` (`match_file.rs`); an older file without an id still parses and migrates.

On import (`MatchListScreen.tsx` `importFile`): if the file has no id, or an id not on this device, add the match. Older files get a fresh id, as now. If the id is already on this device, ask the coder before overwriting ("This will replace your copy of <teams, date>. Continue?"). If they confirm, replace the local copy with the imported log. If they cancel, change nothing.

## Acceptance criteria

- [ ] Exported Match Files include the match id; version bumped with a migration from the previous version
- [ ] Importing an older-version file (no id) still works and adds a new match
- [ ] Importing a file whose id is unknown adds it under that id
- [ ] Importing a file whose id exists asks for confirmation; confirm replaces, cancel leaves the local copy untouched
- [ ] `cargo test`: round-trip preserves id; old-version file migrates
- [ ] Playwright: export → edit locally → re-import the export → confirm → the local copy matches the file, and the list still shows one match

## Blocked by

None
