# 10 — In-app reference, generated definitions, launch docs

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user stories 4, 37, 38)

## What to build

The explainability layer and launch surface. In the app: a quick reference for positions, actions, and modifiers, reachable from the live coding screen without losing coding state. In the repo: the NVAC definitions live in `netball-core` as data and generate the human-readable DEFINITIONS.md — full descriptor table with citations to Mackay et al. 2023 and the documented deviations (optional Gain sub-types, position-derived Rebound classification, derived team gains, greedy sub-type matching) — with a CI check that the generated file is current. Documentation for both audiences: a volunteer quickstart with screenshots, a Shorthand reference for power users, and a CONTRIBUTING guide explaining the two test seams.

Close with an offline audit: the complete v1 flow — create, roster, code, stats, export, import, Summary Image — executed with the network disabled.

## Acceptance criteria

- [ ] Quick reference for positions/actions/modifiers opens from the live coding screen and returns without losing state
- [ ] DEFINITIONS.md is generated from core definitions data, with NVAC citations and the deviations section; CI fails if it is stale
- [ ] README/docs: volunteer quickstart with screenshots and a Shorthand reference
- [ ] CONTRIBUTING.md explains the crate seam and the Playwright seam and how to run each
- [ ] Offline audit passes: the full v1 flow works with the network disabled, verified by an e2e run
- [ ] The definitions shown in-app and in DEFINITIONS.md come from the same core data (no hand-maintained copies)

## Blocked by

- `07-shorthand-import.md`
- `08-golden-parity-and-migration.md`
- `09-summary-image.md`
