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

/// Derive the full post-match statistics report (`StatsReport`) from a log
/// (`LogEntry[]`): per-player lines and team-level conversion rates for both
/// teams, plus the score and its quarter breakdown. One call, per issue 05.
#[wasm_bindgen]
pub fn derive_stats(log: JsValue) -> Result<JsValue, JsValue> {
    let report = netball_core::derive_stats(&parse_log(log)?);
    serde_wasm_bindgen::to_value(&report).map_err(JsValue::from)
}

/// Serialize a match to its portable Match File JSON (a `MatchFile` value in,
/// per `web/src/types/`, a version-tagged JSON string out). The core owns the
/// schema and version envelope; the UI only moves the bytes to a file or the
/// share sheet.
#[wasm_bindgen]
pub fn serialize_match_file(match_file: JsValue) -> Result<String, JsValue> {
    let match_file: netball_core::MatchFile = serde_wasm_bindgen::from_value(match_file)?;
    Ok(match_file.to_json())
}

/// Parse a Match File JSON string back into a `MatchFile` (per `web/src/types/`).
/// An unrecognised version or malformed content throws the core's clear,
/// human-readable message and yields no value, so the UI can surface it and
/// leave no partial import behind.
#[wasm_bindgen]
pub fn parse_match_file(json: &str) -> Result<JsValue, JsValue> {
    let match_file = netball_core::MatchFile::from_json(json)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&match_file).map_err(JsValue::from)
}

/// Parse Shorthand text into a match log (`LogEntry[]`, per `web/src/types/`).
/// On a malformed token the core's located, human-readable message is thrown
/// and no value is produced, so the UI can pinpoint the typo and leave no
/// partial import behind. The returned entries carry no timestamps; the UI
/// wraps them with team names and a date to make a match.
#[wasm_bindgen]
pub fn parse_shorthand(input: &str) -> Result<JsValue, JsValue> {
    let log = netball_core::parse_shorthand(input)
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_wasm_bindgen::to_value(&log).map_err(JsValue::from)
}

/// The action taxonomy as data (`ActionKindInfo[]`): which actions exist,
/// which positions each is legal for, whether Failed applies, and the
/// available sub-types. The UI derives its buttons from this so it can never
/// offer a combination the core would reject.
#[wasm_bindgen]
pub fn action_taxonomy() -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(&netball_core::action_taxonomy()).map_err(JsValue::from)
}

/// The action and modifier definitions as data: a `[Descriptor[], Descriptor[]]`
/// pair of `[actions, modifiers]`, each carrying the NVAC descriptor, its
/// definition text, and how it is resolved. The in-app quick reference renders
/// this, so it and the generated `DEFINITIONS.md` are the same core data
/// (issue 10).
#[wasm_bindgen]
pub fn definitions() -> Result<JsValue, JsValue> {
    let reference = (netball_core::definitions(), netball_core::modifiers());
    serde_wasm_bindgen::to_value(&reference).map_err(JsValue::from)
}
