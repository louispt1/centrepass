# 06 - Android share_target for direct file receiving

Status: needs-triage

## Parent

`.scratch/rollout/map.md` (Fog: receiving files on the stats-keeper's phone)

## What to build

On Android, add a `share_target` entry to the PWA manifest so a Match File shared from another app (e.g. a club WhatsApp chat) can go straight to "Share to CentrePass" instead of round-tripping through Files and the existing Import button. iOS already works today via Files + Import; this only changes Android's flow, and the existing save-then-import path stays as the fallback everywhere (including on Android, until this ships).

Split out of the `05-collections-cross-match-stats.md` grilling session (2026-09-26) as unrelated PWA-manifest plumbing, not aggregation logic. Needs its own scoping before implementation (manifest shape, how the shared file reaches the Import handler, whether it needs a service worker change).

## Blocked by

None

## Comments

- 2026-09-28 (season-fixtures grilling): the share target should also accept a **Collection File** (ADR-0008), not just Match Files. Both route to the same Import handler.
