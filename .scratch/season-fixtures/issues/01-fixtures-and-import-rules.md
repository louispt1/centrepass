# 01 - Fixtures: skip in aggregation, empty/coded replace rules, multi-file import

Status: done

## Parent

`.scratch/season-fixtures/map.md` (Q1, Q2, Q5), ADR-0007

## What to build

A **Fixture** is a Match with an empty log (`CONTEXT.md`). No new type.

### Core (`crates/netball-core/src/collection.rs`)

`derive_collection_stats` skips matches whose log is empty. Today every member match increments `team.matches` (around line 142), so a fixture would count as a match played.

### Import replace rules (`web/src/MatchListScreen.tsx`)

Replace today's "known id → always confirm" with the ADR-0007 table:

| Local | Incoming | Result |
|---|---|---|
| empty | empty | replace silently |
| empty | coded | replace silently |
| coded | empty | keep local silently |
| coded | coded | confirm, showing both sides' event count, score and whether it reached Full Time |

Put the decision in one small pure function so the table is tested once. Silent replaces still `markSent`, as `confirmReplace` does today.

### Multi-file import

The Import input takes `multiple`. Each file is validated through the core before anything is stored (a bad file is reported by name, and the others still import). Show one summary afterwards: "Added N · Filled N · Kept your coded copy of N". Coded-vs-coded conflicts queue one confirm at a time.

## Acceptance criteria

- [ ] `cargo test`: a Collection with one coded match and one empty-log match reports `matches: 1` for each team
- [ ] Unit test for the replace-decision function covering all four rows
- [ ] Importing an empty fixture over a coded local match leaves the local log untouched with no prompt
- [ ] Importing a coded file over a local fixture fills it in with no prompt, and its Collection membership is unchanged
- [ ] The coded-vs-coded prompt shows event count, score and Full Time for each side
- [ ] Selecting several files imports them all and shows the summary line
- [ ] Playwright: import a fixture, then a coded file with the same id, and check the match list shows it coded

## Blocked by

None

## Comments

- 2026-09-28 (implemented): Done. Decision in `importOutcome` (`web/src/matchFile.ts`). Tested end to end in `match-file.spec.ts` (no TS unit runner). `StatsReport` gained `fullTime` for the prompt. Fixtures never show "Not sent".
