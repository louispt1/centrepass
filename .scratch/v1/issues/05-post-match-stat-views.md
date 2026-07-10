# 05 — Post-match stat views

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user stories 20, 21, 22, 23, 24, 26, 27; partial 28)

## What to build

The payoff screens: after (or during) a match, the coach reads per-player and team statistics, all produced by a single `netball-core` derivation call over the event log. Per-player: goals and shots with success percentage, Feeds with success percentage, Rebounds split attacking/defensive, Unforced Turnovers, Infringements, Gains (with sub-type breakdown where coded), and Playing Time. Team-level: conversion rates (centre-pass-to-goal and gain-to-goal) and the quarter-by-quarter score.

Derived descriptors — Goal Assist, feed-with-shot, attacking/defensive Rebound classification — follow the NVAC deviations recorded in the predecessor's definitions (position-derived rebounds, derived team gains). Everything must render sensibly for a log without timestamps (Playing Time omitted, counts exact).

## Acceptance criteria

- [ ] One core call returns the full stats report for a match; the UI renders it as per-player tables and team summaries
- [ ] Per-player views: goals/shots with success %, Feeds with success %, attacking/defensive Rebounds, Unforced Turnovers, Infringements, Gains (sub-types shown when coded), Playing Time
- [ ] Conversion rates: centre-pass-to-goal and gain-to-goal
- [ ] Goal Assist and feed-with-shot are derived from possession context, never coded
- [ ] A timestamp-free match renders all count-based stats exactly, with Playing Time absent
- [ ] Core unit tests per derivation rule, including possession-boundary edge cases (rebound chains, turnover directly off a centre pass)
- [ ] Playwright: a coded match shows correct numbers in every view

## Blocked by

- `04-quarters-rosters-substitutions.md`
