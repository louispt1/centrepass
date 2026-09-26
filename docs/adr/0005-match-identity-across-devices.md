# A Match keeps a stable identity across devices; re-import replaces

Clubs rotate coders, so matches are spread across several phones and reach a club stats-keeper — and each coder's own backup — only as shared Match Files (ADR-0001: no sync server). Until now a Match File carried no identity and every import minted a fresh id, so re-sharing a corrected match, or restoring a backup onto a new phone, silently duplicated it and would double-count in cross-match (Collection) statistics.

We decided the Match File carries the match's id (format version bump). On import, an unknown id is added; a known id **replaces** the local copy after the coder confirms the overwrite. Files from earlier versions have no id and import as new matches, as before.

Why replace rather than merge: the event log is the whole truth (ADR-0003), and the most recently shared file of a match is its most-corrected log. Rejected: content-based duplicate detection (breaks as soon as one event is corrected) and leaving de-duplication to the user (silently wrong season totals). Consequence: two coders independently coding the *same* match produce two distinct matches, which is correct — they are different observations.
