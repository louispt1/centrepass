# CentrePass

Netball match statistics for clubs — coded live, courtside, on the phone in your pocket.

CentrePass is a local-first Progressive Web App: open a link, add it to your home screen, and record a match with big tap targets, fully offline. Every statistic is derived from an append-only event log by a pure Rust engine compiled to WebAssembly, following the [NVAC](https://doi.org/10.1136/bjsports-2022-106187) video-analysis taxonomy. No server, no accounts, no install.

**Status: walking skeleton.** The deployed app is a thin end-to-end slice — a Rust value rendered through WASM in an installable, offline-capable PWA shell — with no netball behaviour yet. See [docs/ROADMAP.md](docs/ROADMAP.md) for the plan, [.scratch/v1/PRD.md](.scratch/v1/PRD.md) for the v1 spec, and [.scratch/v1/issues/](.scratch/v1/issues/) for the implementation issues.

- Domain glossary: [CONTEXT.md](CONTEXT.md)
- Architecture decisions: [docs/adr/](docs/adr/)
- Predecessor (Python CLI + Streamlit): [louispt1/Netballstats](https://github.com/louispt1/Netballstats)

## Layout

- `crates/netball-core` — the pure Rust domain engine: no WASM, browser, or I/O dependencies (ADR-0002). Tested natively with `cargo test`.
- `crates/netball-wasm` — thin wasm-bindgen wrapper exposing the core to the browser; no domain logic.
- `web` — the PWA frontend: Vite + **React** + TypeScript (framework choice made when the app was scaffolded, per the PRD), with `vite-plugin-pwa` providing the manifest and service worker.

## Developing

Requires stable Rust (with the `wasm32-unknown-unknown` target), [wasm-pack](https://rustwasm.github.io/wasm-pack/), and Node 20+.

```sh
cargo test --workspace          # domain engine tests
cd web
npm install
npm run dev                     # builds the WASM, serves the app
npm run build && npm test       # production build + Playwright smoke tests
```

Pushes to `main` deploy the built app to GitHub Pages via CI.

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.
