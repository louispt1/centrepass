# Pure Rust domain core behind WASM; TypeScript owns the UI and persistence

The domain engine — event model, shorthand parser, validation, stat derivation, NVAC definitions — is a pure, stateless Rust crate (`netball-core`) with no browser or I/O dependencies, compiled to WASM via wasm-bindgen. The UI is TypeScript, and TypeScript also owns persistence (IndexedDB): event logs are passed across the WASM boundary as data, and the core never reads or writes storage.

Why: the maintainer's goal is Rust practice where Rust earns its keep (the domain logic), while keeping the UI in the mature web ecosystem where contributors are plentiful. Keeping the core pure means it tests natively with `cargo test` and can later power a CLI or sync server unchanged. Rejected: a full-Rust frontend (Leptos/Dioxus — smaller contributor pool, slower UI iteration), SQLite-in-WASM owned by the core (heavyweight, drags browser APIs into the crate), and a TS-only app (abandons the Rust goal).
