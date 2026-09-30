# 04 - Collection File export and import

Status: done

## Parent

`.scratch/season-fixtures/map.md` (Q7–Q8), ADR-0008

## What to build

### Core

A versioned Collection File, serialized and parsed in `netball-core` and exposed through `netball-wasm` like the Match File:

```json
{ "version": 1, "id": "…", "name": "…", "playerAliases": { "Ali": "Alice" }, "matches": [ /* Match Files */ ] }
```

The embedded matches are exactly the Match File shape and are validated/migrated by the same code. A file that fails to parse yields no value, so nothing partial is imported.

### Export

`exportCollection` (`web/src/matchFile.ts`) shares/downloads one `<name>.centrepass-collection.json` instead of the per-match bundle, and marks the members sent. Single Match File export is unchanged.

### Import

The existing Import input accepts Collection Files too (detected from the parsed content).
- Each embedded match goes through the issue 01 replace rules, with one summary for the file.
- Unknown Collection id: create the Collection with the file's id, name and aliases.
- Known id: **union** membership (never remove), incoming name wins, aliases merged with incoming winning on a key conflict.

## Acceptance criteria

- [ ] `cargo test`: round-trip, and an embedded old-version Match File is migrated
- [ ] `cargo test`: an unknown version or malformed content returns an error
- [ ] Unit test of the merge: union membership, name replaced, aliases merged with incoming winning
- [ ] Importing a Collection File that omits a local member leaves that member in the Collection
- [ ] Playwright: export a Collection, delete it and its matches, import the file, and see the same name, members and aliases

## Blocked by

- `01-fixtures-and-import-rules.md`

## Comments

- 2026-09-28 (implemented): Done. `netball-wasm` gained a direct `serde` dependency so `playerAliases` crosses as a plain object.
