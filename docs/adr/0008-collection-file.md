# A Collection travels as one Collection File with a stable id; import merges, never removes

The rollout decided Collections were local-only and exported as a bundle of member Match Files, with no new format. With season fixtures (ADR-0007) the Collection itself becomes the thing clubs share: the keeper sends the season out, and coders and parents want the same named season, with the same Player Aliases, on their phones. A bundle of 20 attachments is clumsy in a chat app, and it carries neither the name nor the aliases.

We decided a Collection is exported as a single **Collection File** containing a version, the Collection's stable id, its name, its Player Aliases and its member Match Files, which are embedded unchanged. The format and its versioning live in `netball-core`, like the Match File. Single Match File export remains for sending back one coded game.

On import, each embedded match follows the replace rules of ADR-0007, reported in one summary. An unknown Collection id creates the Collection. For a known id:
- membership is the **union** of local and incoming, so an import never removes a match;
- the incoming name replaces the local one;
- aliases are merged, with incoming winning on a conflicting key.

Why union-only: with no server there's no authority to decide a removal was intended. Adding is safe, but a remote delete could silently drop a game from someone's season. Consequence: taking a match out of a Collection has to be done on each device. Rejected: keeping the bundle and asking for a target Collection on import. It's cheaper, but names drift between phones, aliases are redone per device, and re-sharing duplicates the Collection.
