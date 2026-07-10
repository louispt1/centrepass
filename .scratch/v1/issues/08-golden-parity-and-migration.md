# 08 — Golden parity suite and SQLite migration

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user stories 36, 38)

## What to build

The correctness anchor for the whole rewrite. Two halves:

1. **Migration script** — lives in the predecessor repo (louispt1/Netballstats), not here: reads the old SQLite database and emits one Match File per match.
2. **Golden parity suite** — in this repo: a fixture set of real historical matches (event logs plus the Python implementation's derived stats, captured while the old app still runs) and a `cargo test` suite asserting that `netball-core` reproduces every fixture's stats exactly.

Where Rust and Python legitimately disagree (a Python bug, or an intentional definition change), the discrepancy is resolved deliberately: either fix the Rust derivation or record the intentional deviation in the definitions data — never silently regenerate a fixture to make a test pass.

## Acceptance criteria

- [ ] The predecessor repo gains a script that exports every match in its SQLite database to version-1 Match Files
- [ ] Fixture set of at least five real matches, including a two-team match, a match with substitutions, and one with Flagged events
- [ ] Each fixture pairs the event log with the Python app's derived stats for both teams
- [ ] A golden test suite in `netball-core` asserts exact reproduction of every fixture; it runs in CI
- [ ] Any discrepancy is either fixed in Rust or documented as an intentional deviation alongside the definitions data
- [ ] Migrated Match Files import cleanly through the app's import flow

## Blocked by

- `05-post-match-stat-views.md`
- `06-match-file-and-list-management.md`
