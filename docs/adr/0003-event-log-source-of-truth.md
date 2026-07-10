# Append-only event log as source of truth; JSON Match File as the interchange format

Each match is stored as its ordered log of coded events plus metadata; every statistic, possession boundary, score, and playing-time figure is derived on demand and never persisted as truth. The portable representation of a match — for export, sharing, backup, and migration from the old SQLite app — is a single self-contained JSON Match File containing exactly that log and metadata.

Why: stats definitions evolve (NVAC derivations, bug fixes in derivation rules) and event sourcing lets every past match be re-derived under new rules; it also makes undo and replay/review trivial. The event model is two-team-native from day one — every event carries a team — even though the v1 tap UI codes only the active team in detail, so full two-team coding later is a UI change, not a data-model migration. Rejected: persisting derived tables as truth (loses re-derivation and replay).
