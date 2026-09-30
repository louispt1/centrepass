# Fixtures are empty Matches that share identity; import only asks when both copies are coded

Clubs know their season schedule in advance. The stats-keeper imports it once as **Fixtures**, which are Matches with an empty log, and shares the Collection (as a Collection File, ADR-0008). Coders import it and code the fixture on match day, and the coded Match File that comes back replaces the empty fixture under ADR-0005. No new record type. A Fixture is just a Match that nobody has coded yet.

This narrows one consequence of ADR-0005. Two coders coding the *same* fixture now share an id and collide on import, where before they would have been two distinct matches. We accept this: a club codes a fixture once, and the collision surfaces as a prompt, not silent loss.

Because fixtures travel back and forth, replace-on-import now depends on whether each side has been coded:

| Local | Incoming | Result |
|---|---|---|
| empty | empty | replace silently (fixture metadata updated) |
| empty | coded | replace silently (fixture filled in) |
| coded | empty | keep local silently. An empty fixture never overwrites coded data. |
| coded | coded | ask, showing each side's event count, score, and whether it reached Full Time |

Rejected: preferring the copy with more events, because undo removes events, so a longer log is not necessarily the more-corrected one. Also rejected: fixtures as a separate local concept linked to coded matches by date and team names. That is the fuzzy matching ADR-0005 already rejected.
