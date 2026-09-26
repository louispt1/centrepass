# 04 - Request persistent storage

Status: ready-for-agent

## Parent

`.scratch/rollout/map.md`

## What to build

Call `navigator.storage.persist()` on startup (`main.tsx`) so the browser is less likely to evict the IndexedDB match data. This matters most for iOS Safari used in a browser tab, which can clear site data after 7 days without a visit. Home-screen installs are exempt. Fire and forget: no UI, and ignore the result or any error.

## Acceptance criteria

- [ ] `navigator.storage.persist()` is requested once at startup when available
- [ ] No behaviour change or error where it is unsupported

## Blocked by

None
