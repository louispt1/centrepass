# 03 - Import fixtures from CSV

Status: done

## Parent

`.scratch/season-fixtures/map.md` (Q3)

## What to build

"Import fixtures (CSV)" on the match list:

```csv
date,team,opposition
14/09/2026,Seniors A,Riverside
```

- Columns are matched by header name, case-insensitive. Unknown columns are ignored.
- Dates: `YYYY-MM-DD` or `DD/MM/YYYY`. Anything else is rejected.
- `team` becomes `teamAName` and `opposition` becomes `teamBName`.
- **All-or-nothing**: one bad row rejects the file with a message naming the row number and problem. Nothing is stored.
- The coder picks the target Collection: existing, or new (defaulting to the file name without its extension). Build the picker as a component so issue 04 can reuse it.
- A row whose (date, trimmed/case-insensitive team, opposition) already matches a match in the target Collection is skipped, so an updated schedule re-imports safely.
- Report: "Added N fixtures · Skipped N already in <Collection>".

Parsing is plain TypeScript (no CSV dependency). Handle quoted fields and a UTF-8 BOM, since Excel exports have both.

## Acceptance criteria

- [ ] Unit test: header order and case don't matter, extra columns are ignored, both date formats parse, `MM/DD`-looking dates (e.g. `09/14/2026`) are rejected, quoted fields and a BOM parse
- [ ] A bad row stores nothing and names the row
- [ ] Re-importing the same CSV into the same Collection adds nothing
- [ ] Imported fixtures appear under Upcoming (issue 02) and in the chosen Collection

## Blocked by

- `01-fixtures-and-import-rules.md`

## Comments

- 2026-09-28 (implemented): Done. The parser lives in the core (`fixtures.rs`, cargo-tested) rather than TypeScript. The Collection picker is a plain `<select>`, not a shared component, since issue 04 turned out not to need one.
