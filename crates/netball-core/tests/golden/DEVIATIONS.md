# Golden parity deviations

The golden suite (`tests/golden_parity.rs`) asserts that `netball-core`
reproduces the predecessor Python app's derived statistics **exactly** for every
fixture — a set of real historical matches migrated from that app's SQLite
database. Where the two legitimately disagree, the difference is recorded in
[`deviations.json`](./deviations.json) and explained here. The ledger is
self-checking: an *undocumented* difference fails the suite (a regression), and a
*stale* deviation that no longer applies fails it too. A fixture is **never**
regenerated to make a test pass.

Each fixture is two files:

- `<name>.matchfile.json` — the migrated version-1 Match File (the engine input).
- `<name>.expected.json` — the Python app's derived stats for that match,
  projected into the canonical, engine-agnostic shape the suite compares. This
  is the captured oracle and is never edited.

The fixtures and this projection are produced by `scripts/gen_golden_fixtures.py`
in the predecessor repo (louispt1/Netballstats), whose migration half
(`scripts/export_match_files.py`) is the SQLite → Match File converter.

## What the projection compares — and what it omits

Per team: each player's `goals`, `shots`, `feeds`, `completedFeeds`,
`attackingRebounds`, `defensiveRebounds`, `unforcedTurnovers`, and `gains`;
team-level `feedsWithShot`, `goalAssists`, and `infringements`; the four
possession-conversion figures; and the match score.

Deliberately **excluded** from parity (not deviations — simply out of scope):

- **Playing time.** The historical matches were batch-imported with no live
  wall-clock, so per-player minutes are not derivable from them. CentrePass
  reports playing time unavailable rather than guessed (the same behaviour as a
  Shorthand import); `roster.rs` unit tests cover the derivation itself.
- **Percentages.** Goal %, feed %, and conversion % are a rendering concern the
  UI computes from the raw counts (`goals / shots`), so parity is asserted on
  the counts, from which the percentages follow.

## Model differences the migration absorbs (no numeric deviation)

These are handled by the migration so that stats still match exactly; they are
noted here for the record.

- **Team-position (TEAM/8) turnovers and infringements.** The old app credits a
  team-position error to a synthetic "TEAM" player row. CentrePass has no team
  player: the event is kept in the log (`UnforcedTurnover`/`Infringement` at
  `TEAM` are representable) but attributed to no one, so it appears in no
  per-player table. The projection excludes the oracle's "TEAM" row accordingly,
  and per-player counts match.
- **Events outside the CentrePass model are dropped by the migration** (each
  reported by `export_match_files.py`): a feed from a non-attacking position
  (WD/GD), a rebound at TEAM (unclassifiable as attacking/defensive), and the
  position-less `S` marker (substitutions are the roster, not a log action). Two
  historical matches contain such events and are therefore **not** part of the
  exact-parity fixture set; they are still exported by the migration. The five
  golden fixtures drop nothing.

## Deviation 1 — derived possession boundaries (`derived-possession-boundaries`)

**Every** entry in `deviations.json` is this one difference.

CentrePass derives possession boundaries from the event log (ADR-0003): a
possession is a maximal run of one team's consecutive events, ended only by a
made goal, an unforced turnover, an infringement, a quarter break, or the
opposition taking the ball. The predecessor app instead recorded an explicit
`RESET` sentinel every time the coder pressed Enter. The migration does **not**
carry `RESET` across — there is no "possession boundary" event in the CentrePass
model, and fabricating one (say, a phantom turnover) would corrupt other stats.

In a handful of places the coder pressed Enter to split a single stretch of
one team's play into two coded possessions, with no opposition possession and no
made goal / turnover / infringement between them. The old app counts those as
two possessions; CentrePass, reading the log as given, counts one. This only
ever reclassifies possession-**conversion** figures (the per-event counts,
feed-with-shot and goal-assist descriptors, and score are unaffected, because
each stretch's events and its terminal goal are unchanged):

- `match-4` — Yellow codes `3c` (centre pass) then, separately, `6p` (gain).
  CentrePass reads one centre-pass possession, so the stray gain is not counted:
  `teams.B.conversions.gainTotal` 6 → 5.
- `match-5` — Yellow codes `7r` (rebound) then `2p 2fx 3f 1g` (gain → goal).
  CentrePass reads one rebound-started possession, so the gain and its goal are
  not a gain conversion: `gainTotal` 2 → 1, `gainGoals` 1 → 0.
- `match-6` — Purple codes `3fx` then `5p 2f 1g` (gain → goal), read as one
  feed-started possession: `teams.A.conversions.gainTotal` 2 → 1, `gainGoals`
  1 → 0. Separately, Yellow codes `2c` (centre pass) then `2f 1g` (feed → goal);
  CentrePass reads one centre-pass possession that **scored**, so it is a centre
  pass converted to a goal that the old app missed by splitting it:
  `teams.B.conversions.centrePassGoals` 3 → 4.

In each case the engine's reading is the more faithful one: it counts the
possessions netball actually played, not the coder's keystrokes. These are the
intended semantics, so the deviation is recorded rather than "fixed".
