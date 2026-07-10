# 09 — Summary Image and Web Share

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (user story 29)

## What to build

The adoption artifact: one tap on a finished match renders a Summary Image — final score, quarter scores, team names and date, and headline per-player stats (top shooters with success percentage, conversion rates) — and hands it to the phone's share sheet via the Web Share API, with a plain download as fallback. Rendering is entirely client-side (canvas); the numbers come from the same core stats report as the stat views, never recomputed.

The image is the project's public face in club chats: it must be legible at phone message sizes and carry the CentrePass name.

## Acceptance criteria

- [ ] One tap produces the Summary Image with final score, per-quarter scores, team names, date, top shooters with success %, and conversion rates
- [ ] All figures come from the `netball-core` stats report
- [ ] Web Share API is used where available; otherwise the image downloads
- [ ] Text is legible when the image is displayed at typical chat-message width; the CentrePass wordmark is present
- [ ] Works offline
- [ ] Playwright: generating the image succeeds and produces a non-trivial bitmap for a coded match

## Blocked by

- `05-post-match-stat-views.md`
