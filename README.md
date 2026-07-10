# CentrePass

Netball match statistics for clubs — coded live, courtside, on the phone in your pocket.

CentrePass is a local-first Progressive Web App: open a link, add it to your home screen, and record a match with big tap targets, fully offline. Every statistic is derived from an append-only event log by a pure Rust engine compiled to WebAssembly, following the [NVAC](https://doi.org/10.1136/bjsports-2022-106187) video-analysis taxonomy. No server, no accounts, no install.

**Status: planning.** The build hasn't started yet — see [docs/ROADMAP.md](docs/ROADMAP.md) for the plan, [.scratch/v1/PRD.md](.scratch/v1/PRD.md) for the v1 spec, and [.scratch/v1/issues/](.scratch/v1/issues/) for the implementation issues.

- Domain glossary: [CONTEXT.md](CONTEXT.md)
- Architecture decisions: [docs/adr/](docs/adr/)
- Predecessor (Python CLI + Streamlit): [louispt1/Netballstats](https://github.com/louispt1/Netballstats)

## License

Dual-licensed under MIT or Apache-2.0, at your option (license files land with the first code).
