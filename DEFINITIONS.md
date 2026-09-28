# CentrePass action definitions

This file is generated from `crates/netball-core/src/definitions.rs` - the same data the in-app quick reference reads. Do not edit it by hand; run `cargo test -p netball-core regenerate_definitions_md` (with `REGEN_DEFINITIONS=1`) after changing the definitions.

Terminology follows the netball video analysis consensus (NVAC) taxonomy where NVAC defines a term. Citation:

> Mackay et al. 2023, *Consensus on a netball video analysis framework of descriptors and definitions*, BJSM 57(8):441, DOI 10.1136/bjsports-2022-106187

## Actions

| Code | Descriptor | NVAC term | Resolution | Definition |
| --- | --- | --- | --- | --- |
| `c` | Centre Pass Receive | Centre Pass Receiver | coded | The player of the team in possession who receives the ball from the centre pass within the centre third. Codeable for GA, WA, WD, or GD. Cannot fail: a centre pass that goes astray is an Unforced Turnover. |
| `f` | Feed | Feed into circle | coded | A pass from outside the goal circle to a GA or GS positioned inside it. Codeable for any position except GK. |
| `g` | Goal | Goal | coded | A successful shot at goal, from within the goal circle (GS or GA). A shot that misses is the same code with the Failed modifier. |
| `p` | Gain | General play turnover | coded | Winning possession from the opposition while play continues, coded once for the team that wins it (always the team out of possession). Codeable for any position, or TEAM when unattributable. |
| `d` | Deflection | Deflection | coded | A touch by the team out of possession that changes the ball's course, motion, or speed without winning it. Not a Gain: possession stays where it was. If the deflecting team then secures the ball, code a Pick-up. Codeable for any position, or TEAM. |
| `e` | Unforced Turnover | Unforced turnover | coded | Losing possession through the team's own error or infringement. Codeable for any position, or TEAM. |
| `i` | Infringement | Infringement | coded | An action contrary to the rules, penalised by the umpire, committed by the team out of possession; it does not change possession (an infringement by the team in possession is an Unforced Turnover). Codeable for any position, or TEAM. |
| `r` | Rebound | Rebound | coded | Regathering the ball after an unsuccessful shot. Codeable for GS, GA, GD, or GK; attacking or defensive is derived from the position, and so is the team: the shooting team for GS/GA, the defending team for GD/GK. |
| `pi` | Interception _(← Gain)_ | Interception | optional | A Gain by taking possession directly from an opposition pass, via a catch or a deflection and pick-up. |
| `pp` | Pick-up _(← Gain)_ | Pick-up | optional | A Gain by securing a loose ball that was not directly passed. |
| - | Shot _(← Goal)_ | Shot | derived | Any attempt at goal, successful or not: the count of Goal events regardless of the Failed modifier. |
| - | Feed with Shot _(← Feed)_ | Feed into circle with shot | derived | A Feed followed by a shot before the possession ends. Derived from possession context. |
| - | Goal Assist _(← Feed)_ | Goal Assist | derived | The final pass to a GA or GS directly before a goal, with no rebound in between. Derived; a rebound between the feed and the goal breaks the link. |
| - | Attacking Rebound _(← Rebound)_ | Attacking Rebound | derived | A Rebound taken under the attacking post, by GS or GA. Derived from the position. |
| - | Defensive Rebound _(← Rebound)_ | Defensive Rebound | derived | A Rebound taken under the defensive post, by GD or GK. Derived from the position. |

## Modifiers

| Code | Modifier | Resolution | Definition |
| --- | --- | --- | --- |
| `x` | Failed | coded | Marks an unsuccessful attempt at the preceding action - a missed shot, an incomplete feed. Applies only to a Feed or Goal. |
| `!` | Flagged | coded | Marks the event for later human review. Part of the event model even where no review interface exists yet. |

## Deviations from NVAC

CentrePass departs from a literal reading of NVAC in five deliberate ways, each to fit courtside coding or the derived-truth model.

### Optional Gain sub-types

NVAC has no bare "Gain": every general-play turnover is an Interception, Deflection, or Pick-up. Courtside a coder rarely has time to classify one, so CentrePass records a bare Gain (`p`) and treats the sub-types (`pi`, `pp`) as optional refinements.

### A Deflection is not a turnover

NVAC lists Deflection as a kind of Gain. A deflection often does not win the ball, so CentrePass codes it as its own action (`d`): the Team in Possession is unchanged (like an Infringement) and it is counted apart from Gains. When the deflecting team does secure the ball, the coder follows it with a Pick-up, which is the turnover.

### Position-derived Rebound classification

NVAC names Attacking and Defensive Rebounds as distinct descriptors. CentrePass codes a single Rebound and derives which it is from the position that took it (GS/GA attacking, GD/GK defensive), so the coder never has to choose.

### Derived team gains and possession boundaries

Possession boundaries are derived from the log, not coded (ADR-0003, ADR-0004): a possession begins at a centre pass (coded or not: the first possession after a goal or quarter break, held by the team due the centre pass, counts as one) or a gain and ends at a made goal, an unforced turnover, a quarter break, or the opposition taking the ball; an opposition infringement or deflection falls inside it. A possession that begins from neither a centre pass nor a coded player gain is understood as an unattributed team gain, derived rather than recorded.

### Greedy Shorthand sub-type matching

In the Shorthand grammar the two-letter Gain sub-types are matched greedily before a bare `p`, so `1pi` is an interception at GS, not a gain (`p`) followed by an infringement (`i`). Code those as separate tokens when that is what you mean.

