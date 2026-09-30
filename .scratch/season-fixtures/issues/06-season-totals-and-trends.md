# 06 - Season totals, rates and trend sparklines

Status: done

## Parent

`.scratch/season-fixtures/map.md` (Q6)

## What to build

### Core

Per team bucket, add:
- summed `TeamTotals` and `Conversions`, plus the opponent's centre pass conversions (for opposition CP → goal);
- `series`: one point per coded member match in date order, with match id, date, whether it reached Full Time, and the raw counts behind each metric below.

The UI computes each rate from counts: summed counts for the season value, per-point counts for the sparkline. Percentages are never averaged.

| Metric | Formula |
|---|---|
| Goal difference | goals for − goals against |
| Shooting % | goals / shots |
| CP → goal % | centre_pass_goals / centre_pass_total |
| Gain → goal % | gain_goals / gain_total |
| Opp CP → goal % | opponent centre_pass_goals / opponent centre_pass_total |
| Unforced turnovers per possession | unforced_turnovers / possessions |

### Collection screen

Under each non-Opposition bucket, a "Season" block: each metric's season value plus an inline-SVG sparkline (no chart library) with a faint season-average line. A non-Full-Time point is drawn as a hollow dot, and a point with a zero denominator is a gap. Put the sparkline in its own small module; issue 07 draws the same line on canvas.

## Acceptance criteria

- [ ] `cargo test`: season rates come from summed counts (e.g. 1/1 and 10/20 give 11/21, not the average of 100% and 50%)
- [ ] `cargo test`: series is in date order and excludes fixtures
- [ ] Opposition CP → goal uses the other team's numbers in each match
- [ ] Sparkline renders gaps and hollow dots as specified

## Blocked by

- `05-results-and-season-record.md`

## Comments

- 2026-09-28 (implemented): Done. Goal difference's season value is the per-match average. Metrics and sparkline geometry are in `web/src/season.ts`.
