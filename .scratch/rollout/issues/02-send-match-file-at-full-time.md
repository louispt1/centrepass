# 02 — Send the Match File at full time

Status: ready-for-agent

## Parent

`.scratch/rollout/map.md` (Q5)

## What to build

Clubs rotate coders. Sending the Match File to a shared club place (chat, Drive) is how a match gets backed up and collected. Make that the obvious step after the match:

- Tapping **Full time** (the fourth quarter break, `LiveScreen.tsx`) records the marker as now, then goes to the Stats screen.
- The Stats screen gets a prominent **Send match file** button next to **Share summary image**, using the existing `exportMatch` / `shareOrDownload` in `matchFile.ts`.

## Acceptance criteria

- [ ] Tapping Full time lands on the match's Stats screen
- [ ] Stats has a Send match file button that shares the Match File (share sheet, download fallback)
- [ ] Undo on the live screen still works after returning from Stats
- [ ] Playwright: code a match to full time → lands on Stats → Send match file produces a valid Match File

## Blocked by

None
