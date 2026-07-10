//! Thin wasm-bindgen wrapper around `netball-core`.
//!
//! Nothing in here may contain domain logic — it only translates between
//! JavaScript values and `netball-core`'s pure API (ADR-0002).

use wasm_bindgen::prelude::wasm_bindgen;

/// Taxonomy and engine version string, computed by `netball-core`.
#[wasm_bindgen]
pub fn engine_description() -> String {
    netball_core::engine_description()
}
