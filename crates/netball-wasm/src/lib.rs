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

fn parse_log(log: JsValue) -> Result<Vec<netball_core::LogEntry>, JsValue> {
    serde_wasm_bindgen::from_value(log).map_err(JsValue::from)
}

fn parse_team(team: JsValue) -> Result<netball_core::Team, JsValue> {
    serde_wasm_bindgen::from_value(team).map_err(JsValue::from)
}

/// Derive the match score from a log.
///
/// `log` is a `LogEntry[]` and the result a `Score`, per the TypeScript
/// types generated from the `netball-core` types (`web/src/types/`); the
/// typed wrapper lives in `web/src/engine.ts`.
#[wasm_bindgen]
pub fn derive_score(log: JsValue) -> Result<JsValue, JsValue> {
    let score = netball_core::derive_score(&parse_log(log)?);
    serde_wasm_bindgen::to_value(&score).map_err(JsValue::from)
}

/// Derive per-quarter scores (`Score[]`, one per quarter so far) from a log
/// (`LogEntry[]`). The current quarter is the length of the result.
#[wasm_bindgen]
pub fn derive_quarter_scores(log: JsValue) -> Result<JsValue, JsValue> {
    let scores = netball_core::derive_quarter_scores(&parse_log(log)?);
    serde_wasm_bindgen::to_value(&scores).map_err(JsValue::from)
}

/// Derive one team's current roster (`Roster`) from a log (`LogEntry[]`)
/// and a team (`Team`).
#[wasm_bindgen]
pub fn derive_roster(log: JsValue, team: JsValue) -> Result<JsValue, JsValue> {
    let roster = netball_core::derive_roster(&parse_log(log)?, parse_team(team)?);
    serde_wasm_bindgen::to_value(&roster).map_err(JsValue::from)
}

/// Attribute each log entry to a player (`(string | null)[]`, parallel to
/// the `LogEntry[]` argument): the occupant of the event's position at that
/// point, or null for markers, TEAM events, and unfilled positions.
#[wasm_bindgen]
pub fn derive_attributions(log: JsValue) -> Result<JsValue, JsValue> {
    let attributions = netball_core::derive_attributions(&parse_log(log)?);
    serde_wasm_bindgen::to_value(&attributions).map_err(JsValue::from)
}

/// Derive one team's per-player time on court (`PlayingTime[]`) from a log
/// (`LogEntry[]`) and a team (`Team`); null/undefined when the log lacks the
/// timestamps to compute it.
#[wasm_bindgen]
pub fn derive_playing_time(log: JsValue, team: JsValue) -> Result<JsValue, JsValue> {
    let times = netball_core::derive_playing_time(&parse_log(log)?, parse_team(team)?);
    serde_wasm_bindgen::to_value(&times).map_err(JsValue::from)
}

/// The action taxonomy as data (`ActionKindInfo[]`): which actions exist,
/// which positions each is legal for, whether Failed applies, and the
/// available sub-types. The UI derives its buttons from this so it can never
/// offer a combination the core would reject.
#[wasm_bindgen]
pub fn action_taxonomy() -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(&netball_core::action_taxonomy()).map_err(JsValue::from)
}
