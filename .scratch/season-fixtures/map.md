# Season fixtures and match management

Goal: a club enters its season schedule ahead of time, codes each fixture as it's played, and pulls in matches coded by others, so a season's Collection fills up into a season dashboard.

## Decisions (grilling session, 2026-09-28)

- **Q1 Fixtures**: a Fixture is a Match with an empty log, not a new record type. The stats-keeper imports the schedule and shares the Collection bundle. Coders import it and code their fixture, and the coded file replaces the fixture back on the keeper's device. See ADR-0007.
- **Q2 Replace rules**: import behaviour depends on whether each side is empty or coded (table in ADR-0007). It only asks when both are coded, and shows events, score and Full Time for each side. Import accepts several files at once and reports a summary (Added · Filled · Kept).
- **Q3 CSV**: `date,team,opposition` with header-named, case-insensitive columns. Extra columns are ignored. Dates are `YYYY-MM-DD` or `DD/MM/YYYY`. Team → Team A. The import picks or creates the target Collection. All-or-nothing, and the error names the bad row. A row whose date + team + opposition already exists in that Collection is skipped, so an updated schedule re-imports safely. Deleting is the fallback.
- **Q4 Match list**: sorted by match date. **Upcoming** is fixtures (empty log), soonest first, each with a Code button that goes to the roster. **Matches** is anything coded, newest first. A past, uncoded fixture stays in Upcoming. No Collection filter on the home list, because the Collection screen is the season view. Shorthand import moves into a collapsed `<details>`.
- **Q5 Collection as season dashboard**: fixtures (empty log) are skipped in `derive_collection_stats` (today every member match adds to `team.matches`). New: a results list of every member match by date (score and W/D/L, or "Not coded" with a Code button), and a Season Record per team bucket (`P W D L · GF GA`). W/D/L counts only matches that reached Full Time. Buckets appearing in fewer than half the member matches collapse under an "Opposition" `<details>`, so no "our team" setting is needed.
- **Q6 Season totals and trends**: summed `TeamTotals` and `Conversions`, with rates recomputed from summed counts (never averaged across matches). The core returns a per-match series in date order. The UI draws inline-SVG sparklines with a season-average line, for goal difference, shooting %, CP → goal %, gain → goal %, opposition CP → goal %, and unforced turnovers per possession. Every coded match is included, and non-Full-Time matches get a hollow dot. No chart library, no statistical trend lines.
- **Q7–Q8 Collection File**: reverses rollout Q7's "no new format". A Collection exports as one Collection File (id, name, aliases, embedded Match Files), owned by the core. On import, matches follow ADR-0007. A known Collection id unions membership (never removes), takes the incoming name, and merges aliases with incoming winning. Single Match File export stays. See ADR-0008.
- **Q9–Q10 Season Summary Image**: one per team bucket, shared from its section on the Collection screen. It reuses `summaryImage.ts` (same canvas, brand and share path). Contents: team + Collection name, Season Record, a W/D/L form strip in date order (Full Time matches only), a goal-difference sparkline, four rates (shooting, CP → goal, gain → goal, opposition CP → goal), and the top 3 scorers and top 3 gainers with aliases applied. Every figure comes from the core.

## Fog

- Android `share_target` (rollout issue 06) should accept Collection Files as well as Match Files.

## Issues

01 fixtures and import rules · 02 Upcoming/Matches list · 03 CSV fixture import · 04 Collection File · 05 results and Season Record · 06 season totals and trends · 07 Season Summary Image
