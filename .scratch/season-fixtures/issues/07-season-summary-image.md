# 07 - Season Summary Image

Status: done

## Parent

`.scratch/season-fixtures/map.md` (Q9–Q10)

## What to build

A "Share season image" button on each team bucket of the Collection screen, including Opposition buckets. It reuses `web/src/summaryImage.ts`: same 1080×1350 canvas, colours, font and `shareOrDownload`. Add a render function and don't touch the match one.

Layout, top to bottom:
1. Team name, Collection name
2. Season Record: `W · D · L`, `GF GA (±diff)`
3. Form strip: one W/D/L chip per Full Time match in date order
4. Goal-difference sparkline
5. Shooting %, CP → goal %, Gain → goal %, Opp CP → goal %
6. Top 3 scorers (goals) and top 3 gains, side by side, with aliases applied
7. CentrePass footer as on the match image

Every figure comes from the core's collection stats (issues 05–06). The module only draws.

## Acceptance criteria

- [ ] The image renders for a Collection with fixtures, in-progress matches and Full Time matches. Only Full Time matches appear in the strip.
- [ ] A long season (20 Full Time matches) keeps the strip legible, with chips shrinking to fit one or two rows
- [ ] Playwright: the button produces a PNG blob (as the match image test does)

## Blocked by

- `06-season-totals-and-trends.md`

## Comments

- 2026-09-28 (implemented): Done. Chips wrap at 16 per row.
