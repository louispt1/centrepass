# 05 - Collection results list and Season Record

Status: done

## Parent

`.scratch/season-fixtures/map.md` (Q5)

## What to build

### Core

- A `reached_full_time(log)` derivation (four Quarter Break markers). Today this only lives in `web/src/LiveScreen.tsx`; the live screen should switch to the core's version.
- Extend `CollectionStats` / `CollectionTeam` with a **Season Record** per team bucket: played, won, drawn, lost, goals for and against. Only matches that reached Full Time count. `derive_collection_stats` needs each match's id and date for issue 06, so pass them in.

### Collection screen (`web/src/CollectionScreen.tsx`)

- **Results** list above the stats: every member match by date. A coded match shows its score, W/D/L from Team A's side, and a link to its stats. A fixture shows "Not coded" and a Code button.
- Each team bucket header shows its `P W D L · GF GA`.
- Buckets appearing in fewer than half the coded member matches go inside a closed `<details>Opposition</details>`.

## Acceptance criteria

- [ ] `cargo test`: the record counts W/D/L correctly regardless of which slot (A/B) the team was coded in
- [ ] `cargo test`: a match without Full Time contributes player stats but no W/D/L and no GF/GA
- [ ] Live screen still shows FT from the core's derivation
- [ ] Results list shows fixtures and coded matches in date order
- [ ] A season against ten different oppositions shows one open bucket and ten under Opposition

## Blocked by

- `01-fixtures-and-import-rules.md`

## Comments

- 2026-09-28 (implemented): Done. Full Time is `StatsReport.fullTime` in the core. LiveScreen keeps its own quarter count, which it needs for button labels anyway.
