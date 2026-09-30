# Netball Stats

Recording netball match events courtside and deriving team and player statistics from them. Terminology follows the Netball Video Analysis Consensus (NVAC) taxonomy (Mackay et al. 2023) wherever NVAC defines a term.

## Language

### People and teams

**Coder**:
The person recording events during or after a match - typically a club volunteer courtside with a phone or tablet.
_Avoid_: stats-keeper, scorer, user

**Team**:
One of the two sides in a match, A or B, both coded in full. Every event belongs to exactly one team, whose players its position code refers to.
_Avoid_: active team, opposition, home/away team

### Recording

**Match**:
A single game, consisting of an ordered log of events plus metadata (teams, name, date).
_Avoid_: game, session

**Fixture**:
A scheduled Match that hasn't been coded yet: a Match with an empty log. It is not a separate kind of record. Once coding starts it is simply a Match. A fixture keeps its identity when shared (ADR-0005), so the coded Match File that comes back replaces the empty fixture it was coded from.
_Avoid_: scheduled match, placeholder, game

**Event**:
One coded observation: a position, an action, and optional modifiers, attributed to a team. Events are the source of truth; everything else is derived.
_Avoid_: stat, record, entry

**Possession**:
A span of the log during which one team is the Team in Possession, from winning the ball (centre pass, gain, rebound) until it changes hands or a goal is scored. Events by the other team (an infringement) may fall inside it. Possession boundaries are derived from the event log, not coded.
_Avoid_: play, phase

**Team in Possession**:
The team derived to hold the ball after the latest event, and so the default team for the next coded event. The coder may override it; the override is simply the team recorded on the next event. Undetermined before the first event - the first centre pass (decided by the toss) is whichever team the coder codes it for.
_Avoid_: current team, attacking team

**Centre Pass Alternation**:
The rule that centre passes alternate between the teams throughout the match, regardless of who scored, carrying across quarter breaks. After a goal or a quarter break, the Team in Possession is the team due the next centre pass. The alternation is anchored on the team actually coded for each centre pass, so correcting one re-aligns every later prediction.

**Coded**:
Describes a datum the coder enters directly (e.g. a Goal).

**Derived**:
Describes a datum computed from coded events (e.g. Goal Assist, possession boundaries, playing time). Derived data is never stored as truth.
_Avoid_: calculated, synthetic

**Shorthand**:
The compact text grammar for describing events (`1c 2f 1gx`), one possession per line; a line's team is its Team in Possession, so an infringement on it belongs to the other team. A power-user input and interchange format, not the primary interface.
_Avoid_: coding string, batch format

**Position**:
One of the seven on-court netball positions (GS, GA, WA, C, WD, GD, GK), or TEAM for events not attributable to an individual.

### Actions (NVAC-aligned)

**Centre Pass Receive**:
Receiving the ball from the centre pass within the centre third. Cannot fail: a centre pass that goes astray is an Unforced Turnover.
_Avoid_: CPR (in prose)

**Feed**:
A pass from outside the goal circle to a shooter inside it. Any position except GK may feed: WD and GD can pass into the circle from the centre third, but a GK pass would cross the whole centre third.
_Avoid_: feed into circle (as a distinct term)

**Goal**:
A successful shot. A **Shot** with the Failed modifier is an unsuccessful attempt.
_Avoid_: score, basket

**Gain**:
Winning possession from the opposition while play continues, coded once for the winning team - always the team not previously in possession; the losing team records nothing. Optional sub-types: **Interception**, **Pick-up**.
_Avoid_: steal, takeaway, general play turnover

**Deflection**:
A touch by the team out of possession that changes the ball's course without winning it. Not a **Gain** (NVAC counts it as one): the Team in Possession is unchanged, like an **Infringement**. If the deflecting team then secures the ball, that is a **Gain** by Pick-up.

**Unforced Turnover**:
Losing possession through the team's own error or infringement.
_Avoid_: error (as a term of art)

**Infringement**:
An action contrary to the rules, penalised by the umpire, committed by the team not in possession; it does not change the Team in Possession. An infringement by the team in possession is an Unforced Turnover.
_Avoid_: penalty

**Rebound**:
Regathering the ball after an unsuccessful shot. Attacking (by GS/GA) or Defensive (by GD/GK) is derived from position; an Attacking Rebound belongs to the shooting team, a Defensive one to its opponent.

### Modifiers and structure

**Failed**:
Modifier marking an unsuccessful attempt at an action (e.g. a missed shot, an incomplete feed).
_Avoid_: missed, x (in prose)

**Flagged**:
Modifier marking an event for later human review. Part of the event model even where no review interface exists yet.
_Avoid_: starred

**Quarter**:
One of the four periods of a match. Quarter boundaries are coded as markers in the event log; the fourth marker is **Full Time**, and a match without it is still in progress.

**Quarter Clock**:
Derived elapsed time of a Quarter: from its first timestamped Event (normally the first Centre Pass; a Substitution never starts one) to its Quarter Break marker, or to now while the quarter is in progress. Wall-clock based, so it includes stoppages and need not match the official 15 minutes. Unavailable for untimed logs (e.g. Shorthand imports). There is no coded quarter-start marker; the first centre pass is the start.
_Avoid_: game clock, match clock, timer

**Interval**:
The gap between a Quarter Break marker and the next quarter's first entry. It is never counted as quarter time.
_Avoid_: break time, half time (as the generic term)

**Substitution**:
A change of which player occupies a position, effective from a moment in the match. The sequence of substitutions determines each player's Playing Time.
_Avoid_: sub (in prose), interchange

**Roster**:
The assignment of player names to positions for a team over the course of a match, as amended by substitutions.
_Avoid_: lineup, squad

**Playing Time**:
Derived per-player time on court, computed from roster assignments and substitution moments, counting only Quarter Clock spans - Intervals are excluded, so a player on court all match has Playing Time equal to the sum of the quarters.

### Sharing

**Match File**:
The portable, self-contained representation of one match: its event log plus metadata, including the match's stable identity. The unit of export, import, backup, and migration. Importing a Match File for a match already on the device replaces that copy (ADR-0005).
_Avoid_: export, backup file, save file

**Summary Image**:
A shareable rendered picture of a match's headline statistics, intended for club chat groups and social media.
_Avoid_: stats card, report

**Season Summary Image**:
The Summary Image for one team across a Collection: its Season Record, form, key rates and top players.
_Avoid_: season report, season card

**Collection**:
A named grouping of matches (e.g. a season or tournament) used to scope cross-match statistics. A match may belong to any number of Collections. A Collection keeps a stable identity across devices and travels as a Collection File (ADR-0008).
_Avoid_: folder, season (as the generic term)

**Season Record**:
A team's Played / Won / Drawn / Lost and goals for and against across a Collection. Only matches that reached Full Time count toward it. Derived, like all cross-match stats, by summing per-match stats. Rates are recomputed from summed counts, never averaged.
_Avoid_: table, standings, form

**Collection File**:
The portable representation of a Collection: its identity, name, Player Aliases and member Match Files. Importing one merges into a Collection already on the device. Membership only grows, and each match follows the Match File replace rules (ADR-0007, ADR-0008).
_Avoid_: bundle, season file

**Player Alias**:
Within a Collection, a rule folding one recorded player name into another for cross-match aggregation (e.g. "Ali" → "Alice"), because the same player's name may be spelled differently across matches. Scoped to that Collection; the underlying Match Files and their event logs are never changed.
_Avoid_: merge (as the noun), canonical name
