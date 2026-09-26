# Rollout to non-technical clubs

Goal: club volunteers use CentrePass themselves, free, with data kept on their devices. The architecture already delivers free and local (ADR-0001: static PWA, no server, no accounts). This effort closes the gaps between feature-complete v1 and real club use.

## Decisions so far (grilling session, 2026-09-26)

- **Q1 Rollout**: in person at the maintainer's own club. The maintainer demonstrates the app and adds it to the home screen with each coder. Deferred until it spreads beyond that: in-app onboarding, a home-screen install guide, a short URL.
- **Q2 Coders**: several volunteers take turns, each on their own phone. Matches are spread across devices.
- **Q3 Season stats**: not needed for the rollout. Collections + cross-match stats come next (issue 05). Meanwhile the shared Match Files build up the history.
- **Q4 Identity**: a Match keeps its id across devices, and importing a match you already have replaces your copy after a confirm. See ADR-0005 and issue 01.
- **Q5 Backup prompt**: both a Send match file step after Full time (issue 02) and a "Not sent" marker on the list (issue 03). Full Time is the fourth quarter-break marker, which already exists.
- **Q6 Exit criterion**: a real match has been coded live, and v1's exit criterion is met. Expect further live-screen changes from use.
- Also: request persistent storage (issue 04).
- **Q7 Collections** (grilling session, 2026-09-26): local-only, many-to-many match tagging; exportable as a bundle of member Match Files (no new format, no season-report export). Player and team identity across matches keyed by trimmed/case-insensitive name match, with a manual per-Collection alias merge as the safety net; aggregation lives in `netball-core`, replaying and summing the existing per-match stats rather than a new derivation. See issue 05.

## Fog

- Receiving files on the stats-keeper's phone: on iOS, save from the chat to Files, then Import. On Android, a `share_target` in the manifest could let people "Share to CentrePass" directly, but that's manifest plumbing separate from Collections - split into issue 06.
