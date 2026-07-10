# Netball Stats

Recording netball match events courtside and deriving team and player statistics from them. Terminology follows the Netball Video Analysis Consensus (NVAC) taxonomy (Mackay et al. 2023) wherever NVAC defines a term.

## Language

### People and teams

**Coder**:
The person recording events during or after a match — typically a club volunteer courtside with a phone or tablet.
_Avoid_: stats-keeper, scorer, user

**Active Team**:
The team whose players an event's position codes refer to. Every event belongs to exactly one team.
_Avoid_: our team, home team

**Opposition**:
The team the coder is not coding in detail. In v1 live coding only their goals are recorded, as ordinary Goal events attributed to them.

### Recording

**Match**:
A single game, consisting of an ordered log of events plus metadata (teams, name, date).
_Avoid_: game, session

**Event**:
One coded observation: a position, an action, and optional modifiers, attributed to a team. Events are the source of truth; everything else is derived.
_Avoid_: stat, record, entry

**Possession**:
A maximal run of consecutive events by the same team. Possession boundaries are derived from the event log, not coded.
_Avoid_: play, phase

**Coded**:
Describes a datum the coder enters directly (e.g. a Goal).

**Derived**:
Describes a datum computed from coded events (e.g. Goal Assist, possession boundaries, playing time). Derived data is never stored as truth.
_Avoid_: calculated, synthetic

**Shorthand**:
The compact text grammar for describing events (`1c 2f 1gx`), one possession per line. A power-user input and interchange format, not the primary interface.
_Avoid_: coding string, batch format

**Position**:
One of the seven on-court netball positions (GS, GA, WA, C, WD, GD, GK), or TEAM for events not attributable to an individual.

### Actions (NVAC-aligned)

**Centre Pass Receive**:
Receiving the ball from the centre pass within the centre third.
_Avoid_: CPR (in prose)

**Feed**:
A pass from outside the goal circle to a shooter inside it.
_Avoid_: feed into circle (as a distinct term)

**Goal**:
A successful shot. A **Shot** with the Failed modifier is an unsuccessful attempt.
_Avoid_: score, basket

**Gain**:
Winning possession from the opposition while play continues. Optional sub-types: **Interception**, **Deflection**, **Pick-up**.
_Avoid_: steal, takeaway, general play turnover

**Unforced Turnover**:
Losing possession through the active team's own error or infringement.
_Avoid_: error (as a term of art)

**Infringement**:
An action contrary to the rules, penalised by the umpire.
_Avoid_: penalty

**Rebound**:
Regathering the ball after an unsuccessful shot. Attacking (by GS/GA) or Defensive (by GD/GK) is derived from position.

### Modifiers and structure

**Failed**:
Modifier marking an unsuccessful attempt at an action (e.g. a missed shot, an incomplete feed).
_Avoid_: missed, x (in prose)

**Flagged**:
Modifier marking an event for later human review. Part of the event model even where no review interface exists yet.
_Avoid_: starred

**Quarter**:
One of the four periods of a match. Quarter boundaries are coded as markers in the event log.

**Substitution**:
A change of which player occupies a position, effective from a moment in the match. The sequence of substitutions determines each player's Playing Time.
_Avoid_: sub (in prose), interchange

**Roster**:
The assignment of player names to positions for a team over the course of a match, as amended by substitutions.
_Avoid_: lineup, squad

**Playing Time**:
Derived per-player time on court, computed from roster assignments and substitution moments.

### Sharing

**Match File**:
The portable, self-contained representation of one match: its event log plus metadata. The unit of export, import, backup, and migration.
_Avoid_: export, backup file, save file

**Summary Image**:
A shareable rendered picture of a match's headline statistics, intended for club chat groups and social media.
_Avoid_: stats card, report

**Collection**:
A named grouping of matches (e.g. a season or tournament) used to scope cross-match statistics.
_Avoid_: folder, season (as the generic term)
