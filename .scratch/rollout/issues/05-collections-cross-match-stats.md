# 05 - Collections and cross-match stats

Status: ready-for-agent

## Parent

`.scratch/rollout/map.md` (Q3), `docs/ROADMAP.md` v1.x backlog

## What to build

A Collection is a named, local-only, many-to-many grouping of matches (`CONTEXT.md`), used to show season/cross-match totals and averages per player.

### Data model (`web/src/storage.ts`)

New `collections` IndexedDB store:

```ts
interface StoredCollection {
  id: string;
  name: string;
  matchIds: string[];
  /** "Ali" -> "Alice"; resolved transitively (merging A->B then B->C moves A's stats to C). */
  playerAliases: Record<string, string>;
  createdAtMs: number;
}
```

CRUD: create/rename/delete a Collection; add/remove a matchId. A deleted match's id is simply skipped wherever a Collection is rendered - no eager cleanup on delete.

### Membership UI

Editable from both directions:

- Match list screen: a per-match control to add/remove it from any number of Collections (new or existing).
- Collection screen: an "add matches" picker over the existing match list.

### Aggregation (`netball-core`)

New function taking the member matches' `log` + `team_a_name`/`team_b_name` (same shape as `MatchFile`). It replays each one through the existing `stats::compute` unchanged, then folds the resulting `PlayerStats` across matches:

- **Bucket by team name**, trimmed + case-insensitive, whichever of A/B slot it was coded in per match - there is no "which side is ours" concept; the same club team may be Team A in one match and Team B in another.
- **Bucket players by name**, trimmed + case-insensitive, then resolve through the Collection's `playerAliases` map, transitively.
- **Sum** every count-based stat (goals, feeds, gains, etc.) and Playing Time - Playing Time only across matches where it was available for that match (partial, never zeroed, per the existing per-match rule).
- Track a **games-played** count per player: the number of member matches where they appear in that match's `TeamStats.players` (the existing "occupied a position or was credited an event" definition - no new concept).
- Rate stats (shooting %, feed completion, etc.) are **never averaged as percentages** - the caller sums numerators and denominators across matches and divides once, same as the existing per-match `Conversions` are computed today.

### Collection stats screen

Reuses the existing per-match `StatsScreen` table layout, fed the summed totals + games-played instead of one match's numbers. Team-name buckets sorted by match count descending; the largest (the club's own team, almost always) expanded by default, smaller (one-off opponent) buckets collapsed but visible.

### Player merge UI

Tapping a player row on the Collection stats screen offers "Merge into…", listing the Collection's other distinct names; picking one adds an entry to `playerAliases`.

### Roster entry notice

Add a short notice to `RosterScreen.tsx` that consistent name spelling matters for season stats, since cross-match aggregation keys on it (see above).

### Export

Generalize `shareOrDownload` (`matchFile.ts`) from a single `File` to `File[]`, using `navigator.share`'s existing multi-file support (already used for one file today). A new `exportCollection` maps every member match to a `File` the same way `exportMatch` does today and shares/downloads them together in one action. No new file format, no zip; the no-`navigator.share` fallback is a plain per-file download loop.

## Acceptance criteria

- [ ] Creating, renaming, and deleting a Collection persists in IndexedDB
- [ ] A match can be added to / removed from any number of Collections, from both the match list and the Collection screen
- [ ] Deleting a match leaves no trace in a Collection's rendered stats (dangling id silently skipped)
- [ ] `cargo test`: aggregation sums counts correctly across matches with the same team/player names appearing in different A/B slots and different capitalization
- [ ] `cargo test`: a player merge, including a two-step chain (A→B, then B→C), folds all three names' stats into one line
- [ ] `cargo test`: Playing Time sums only across matches where it was available, and stays available (partial) rather than becoming unavailable just because one *other* match in the Collection lacks timestamps
- [ ] Collection stats screen shows team buckets sorted by match count, own-team bucket expanded by default
- [ ] Exporting a Collection shares/downloads every member match's Match File in one action
- [ ] `RosterScreen.tsx` shows the consistent-naming notice
- [ ] Playwright: create a Collection, add two matches with a misspelled player name, merge the two names, confirm the stats screen shows one combined line

## Blocked by

- `01-match-identity-across-devices.md` (without it, re-shared matches double-count)

## Out of scope

- Season-stats export as its own report/CSV - only the underlying Match Files bundle is exported; revisit if the club wants a spreadsheet-ready format later
- Android `share_target` for direct "Share to CentrePass" - split into `06-android-share-target.md`
- A canonical per-team player roster with stable ids at coding time - roster entry stays free text; cross-match identity is handled entirely by the Collection-scoped alias merge
