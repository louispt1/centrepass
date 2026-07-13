# Shorthand reference

Shorthand is CentrePass's compact text format for describing a match — a
power-user fast path and interchange format, not the primary interface. Paste it
into **Import Shorthand** on the match list and it becomes an ordinary match,
flowing through the exact same statistics as tap coding. (Shorthand carries no
timestamps, so Playing Time is the one figure it can't produce; every count is
still exact.)

The grammar is enforced by `netball-core`, so the app and this document can
never disagree; a single malformed token fails the whole paste and points at the
line and column, leaving nothing half-imported.

## The shape

**One possession per line.** A line is a run of whitespace-separated event
tokens, or a single marker. Each event token is:

```
[team?] position action [modifiers?]
```

- **Position** — one digit:

  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
  |---|---|---|---|---|---|---|---|
  | GS | GA | WA | C | WD | GD | GK | TEAM |

- **Action** — one letter (plus optional Gain sub-type):

  | Code | Action |
  |------|--------|
  | `c` | Centre pass receive |
  | `f` | Feed |
  | `g` | Goal / shot |
  | `p` | Gain |
  | `pi` | Gain — interception |
  | `pd` | Gain — deflection |
  | `pp` | Gain — pick-up |
  | `e` | Unforced turnover |
  | `i` | Infringement |
  | `r` | Rebound |

- **Modifiers** — a trailing `x` (Failed) and/or `!` (Flagged), in either order.
  `x` is only legal on the actions that can fail: receive, feed, and goal.

Positions and actions are joined with no space: `1g` is a goal by GS, `3c` a
centre-pass receive by WA, `6pi` a gain-by-interception by GD.

> **Greedy sub-types.** `pi`, `pd`, `pp` are matched before a bare `p`, so `1pi`
> is *interception at GS*, never *gain (`p`) then infringement (`i`)*. Put a
> space between them if you really mean two events.

## Teams, quarters, comments

- **Team** — a leading `a` or `b` on a line chooses the possession's team
  (`a` = your team, `b` = the opposition). With no prefix the line belongs to
  your team.
- **Quarter break** — a line of just `QT`.
- **Comments** — anything in `(parentheses)` is ignored, handy for notes.
- Substitutions are not yet importable from Shorthand.

## Worked example

```
3c 2f 1g           (WA receives, GA feeds, GS scores)
b 2g               (opposition GA scores)
3c 4fx 2f 1gx 1r 1g   (a miss, rebound, then a goal)
QT
6pi 2f 1g          (GD intercepts and it's converted)
```

That's five possessions across two quarters: two goals for your team in the
first quarter (one straight from the centre pass, one off an attacking rebound),
one for the opposition, then a gain converted after the break.
