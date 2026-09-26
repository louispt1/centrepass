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

CentrePass derives possession boundaries from the event log (ADR-0003,
ADR-0004): a possession begins at a centre pass or a gain and runs while one
team holds the ball, ended by a made goal, an unforced turnover, a quarter
break, or the other team taking it. The predecessor app instead recorded an
explicit `RESET` sentinel every time the coder pressed Enter. The migration does
**not** carry `RESET` across — there is no "possession boundary" event in the
CentrePass model, and fabricating one (say, a phantom turnover) would corrupt
other stats.

Where the coder pressed Enter to split one stretch of play that began with
neither a centre pass nor a gain, the old app counts two possessions and
CentrePass one. This only ever reclassifies possession-**conversion** figures:

- `match-6` — Yellow codes `2c` (centre pass) then, separately, `2f 1g` (feed →
  goal). CentrePass reads one centre-pass possession that **scored**, so it is a
  centre pass converted to a goal that the old app missed by splitting it:
  `teams.B.conversions.centrePassGoals` 3 → 4.

(Before ADR-0004 this deviation also covered three split stretches where the
second half began with a gain. A gain now always begins a possession, so those
now agree with the old app and were pruned from the ledger.)

## Deviation 2 — a gain always begins a possession (`gain-begins-possession`)

Under ADR-0004 a Gain is by definition won by the team out of possession, so it
always begins a new possession. Historical logs occasionally code a Gain for the
team that already had the ball — a loose ball recovered by the attack — inside
one coded possession:

- `match-4` — Purple codes `1gx 4p 4f 1g` (missed shot, C picks up, feed, goal)
  on one line. The old app counts one gain possession; CentrePass reads the
  pick-up as beginning a second, so `teams.A.conversions.gainTotal` 5 → 6
  (`gainGoals` is unchanged: exactly one of the two scored either way).

## Deviation 3 — uncoded centre passes still count (`uncoded-centre-pass`)

A centre pass happens after every goal and quarter break whether or not the
coder records the receive. CentrePass treats the first possession after a
restart as a centre-pass possession when it is held by the team that took the
centre pass (the team due it under Centre Pass Alternation, or at the toss the
team the first event shows had the ball) — even with no `c` coded. The old app
only counted possessions that began with a coded `c`.

The historical logs often omit the receive, especially for the opposition
(a `b 3f 1g` line straight after one of our goals). Each such possession now
counts towards `centrePassTotal`, and towards `centrePassGoals` when it scored:

- `match-3` — `teams.B`: total 6 → 9, goals 1 → 4.
- `match-5` — `teams.A`: total 6 → 7, goals 3 → 4.
- `match-6` — `teams.A`: total 6 → 8, goals 3 → 4.
- `match-sub-synthetic` — `teams.A`: total 1 → 2 (a missed shot straight after
  a restart the alternation gives back to A).
