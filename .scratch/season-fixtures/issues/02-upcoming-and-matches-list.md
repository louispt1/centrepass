# 02 - Match list: Upcoming and Matches sections

Status: done

## Parent

`.scratch/season-fixtures/map.md` (Q4)

## What to build

In `web/src/MatchListScreen.tsx`:

- Sort by match `date`, not `createdAtMs`.
- **Upcoming**: matches with an empty log, soonest first. Each has a **Code** button that goes to `#/match/<id>/roster`. A fixture whose date has passed stays here.
- **Matches**: everything with events, newest date first. Existing per-match controls are unchanged.
- Move the Shorthand import into a collapsed `<details>`.

No Collection filter on this screen.

## Acceptance criteria

- [ ] A newly created match with no events appears under Upcoming, and moves to Matches after its first event
- [ ] Both sections sort by date in the stated directions
- [ ] Shorthand import is collapsed by default and still works
- [ ] Existing Playwright tests pass (update selectors if sections change them)

## Blocked by

None

## Comments

- 2026-09-28 (implemented): Done. Sections are titled Upcoming / Played under the Matches heading. A match with only a roster set counts as started (non-empty log).
