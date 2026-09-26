# 05 — Collections and cross-match stats

Status: needs-triage

## Parent

`.scratch/rollout/map.md` (Q3), `docs/ROADMAP.md` v1.x backlog

## What to build

The next major feature. A club stats-keeper imports every coder's Match Files and sees season totals and averages per player across a **Collection**. Everything stays serverless: the files reach them through the club's shared destination (issue 02), and `netball-core` combines the stats.

Needs its own grilling session and PRD before implementation, e.g. how players are identified across matches (names are free text per roster) and how a match is assigned to a Collection.

## Blocked by

- `01-match-identity-across-devices.md` (without it, re-shared matches double-count)
