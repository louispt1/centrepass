//! Pure netball match statistics domain engine.
//!
//! This crate has no WASM, browser, or I/O dependencies (ADR-0002): it is
//! plain data-in, data-out Rust, tested natively with `cargo test`. The
//! browser boundary lives in the sibling `netball-wasm` crate.

/// The event taxonomy this engine implements, with its citation.
///
/// CentrePass follows the netball video analysis consensus (NVAC) taxonomy
/// (Mackay et al. 2023, <https://doi.org/10.1136/bjsports-2022-106187>);
/// deviations are documented in the repository's `CONTEXT.md`.
pub const TAXONOMY: &str = "NVAC taxonomy (Mackay et al. 2023)";

/// A human-readable identity string for the engine: taxonomy plus crate
/// version. The walking-skeleton UI renders this to prove the full
/// Rust-to-browser plumbing works.
pub fn engine_description() -> String {
    format!("{TAXONOMY} — netball-core v{}", env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_description_names_taxonomy_and_version() {
        let description = engine_description();
        assert!(description.contains("NVAC"));
        assert!(description.contains(env!("CARGO_PKG_VERSION")));
    }
}
