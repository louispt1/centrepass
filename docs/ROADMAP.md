# CentrePass Roadmap

Plan for building CentrePass v1, as decided in the design session of 2026-07-10 in the predecessor repo ([louispt1/Netballstats](https://github.com/louispt1/Netballstats)). Companion documents: [CONTEXT.md](../CONTEXT.md) (glossary), [docs/adr/](./adr/) (decisions 0001–0003), and [.scratch/v1/PRD.md](../.scratch/v1/PRD.md) (the v1 spec). Implementation is broken into tracer-bullet issues under [.scratch/v1/issues/](../.scratch/v1/issues/).

## Decisions already made

- **Audience**: non-technical club volunteers; the primary interface is a **tap-based live coding UI** on a phone/tablet courtside. The shorthand grammar survives as a power-user fast path and import format.
- **Platform**: **local-first PWA**, static hosting on GitHub Pages, fully offline-capable, no server, no accounts (ADR-0001).
- **Architecture**: pure Rust domain crate (`netball-core`) behind wasm-bindgen; TypeScript UI (Vite-based; React or Svelte — pick at scaffold time) owning IndexedDB persistence (ADR-0002).
- **Data model**: append-only event log per match as source of truth; two-team-native events; JSON **Match File** as the export/share/migration format (ADR-0003).
- **v1 live coding scope**: active team coded in full + one-tap Opposition goals for the scoreboard. Full two-team tap coding is a later UI addition.
- **v1 features**: match setup with roster → live tap coding (undo, quarters, substitutions) → per-match stat views (goals, feeds, rebounds, errors, conversions, playing time) → Match File export/import + shareable **Summary Image**. Shorthand import included. Collections, flagged-review UI, and URL share links deferred to v1.x.
- **License**: MIT OR Apache-2.0 (dual, Rust convention).
- **Name**: **CentrePass** — verified free on crates.io and unique on GitHub at decision time (2026-07-10).

## Design notes settled during the session

- **Timestamps are optional on events.** Live tap coding records real wall-clock times (enabling playing time and time-to-goal stats); shorthand-imported matches have no meaningful timestamps, and derivations must degrade gracefully (playing time unavailable, order-based stats still exact).
- **Quarter boundaries and substitutions are events in the log**, not side tables, so replay reconstructs everything.
- **The Flagged modifier is in the event model from day one** even though the review UI is deferred.
- **NVAC definitions live in `netball-core` as data** and generate the human-readable DEFINITIONS.md.
- **Opposition goals are ordinary Goal events attributed to the other team** — no special case in the core.

## Phases

The tracer-bullet issues in `.scratch/v1/issues/` supersede the phase-by-phase plan; dependency order there is authoritative. Broad shape:

1. **Walking skeleton** (issue 01) — workspace, PWA shell, CI, Pages deploy; a Rust function called from the deployed offline-capable app.
2. **Domain slices** (issues 02–05) — record a Goal end to end, then widen: full taxonomy, quarters/rosters/substitutions, stat views.
3. **Data in and out** (issues 06–08) — Match File, shorthand import, golden parity against the Python oracle + migration.
4. **Launch surface** (issues 09–10) — Summary Image, in-app reference, generated definitions, docs.

**Correctness anchor**: the golden parity suite (issue 08) — real matches from the predecessor's SQLite database with the Python app's derived stats as fixtures; the Rust engine must reproduce them exactly.

**Make-or-break UI**: the live coding screen. Test it at an actual match early; the v1 exit criterion is coding a full real match live on a phone, offline, then sharing the Summary Image to a club chat.

## v1.x backlog (explicitly deferred)

Collections + cross-match/season stats · flagged-review UI · read-only share links (compressed event log in URL fragment — still zero-server) · full two-team tap coding (auto possession-flip with manual override) · replay/recode mode · time-to-goal analytics · voice input research · optional sync server (only if real demand; `netball-core` already runs server-side unchanged).
