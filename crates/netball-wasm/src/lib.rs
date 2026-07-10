//! Thin wasm-bindgen wrapper around `netball-core`.
//!
//! Nothing in here may contain domain logic — it only translates between
//! JavaScript values and `netball-core`'s pure API (ADR-0002).

use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

/// Taxonomy and engine version string, computed by `netball-core`.
#[wasm_bindgen]
pub fn engine_description() -> String {
    netball_core::engine_description()
}

/// Derive the score from an event log.
///
/// `events` is an `Event[]` and the result a `Score`, per the TypeScript
/// types generated from the `netball-core` types (`web/src/types/`); the
/// typed wrapper lives in `web/src/engine.ts`.
#[wasm_bindgen]
pub fn derive_score(events: JsValue) -> Result<JsValue, JsValue> {
    let events: Vec<netball_core::Event> =
        serde_wasm_bindgen::from_value(events).map_err(JsValue::from)?;
    let score = netball_core::derive_score(&events);
    serde_wasm_bindgen::to_value(&score).map_err(JsValue::from)
}

/// The action taxonomy as data (`ActionKindInfo[]`): which actions exist,
/// which positions each is legal for, whether Failed applies, and the
/// available sub-types. The UI derives its buttons from this so it can never
/// offer a combination the core would reject.
#[wasm_bindgen]
pub fn action_taxonomy() -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(&netball_core::action_taxonomy()).map_err(JsValue::from)
}
