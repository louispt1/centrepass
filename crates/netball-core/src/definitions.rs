//! The NVAC action definitions as data — the single source the in-app quick
//! reference and the generated `DEFINITIONS.md` both read (issue 10).
//!
//! Terminology follows the netball video analysis consensus (NVAC) taxonomy
//! (Mackay et al. 2023); where CentrePass deviates — a bare Gain with optional
//! sub-types, position-derived Rebound and Feed descriptors, derived possession
//! boundaries, and greedy Shorthand sub-type matching — the deviation is stated
//! in [`deviations`] rather than left implicit. Nothing here is hand-copied into
//! the UI or the docs: [`definitions`] crosses the wasm boundary to the app, and
//! [`definitions_markdown`] renders the committed document, which a test keeps
//! current.

use serde::{Deserialize, Serialize};

/// How a descriptor's value reaches the record: typed directly by the coder,
/// computed from other events, or an optional refinement the coder may add.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub enum Resolution {
    /// Entered directly by the coder (e.g. a Goal).
    Coded,
    /// Computed from the event log, never stored (e.g. a Goal Assist).
    Derived,
    /// An optional coded refinement (e.g. a Gain sub-type).
    Optional,
}

impl Resolution {
    fn label(self) -> &'static str {
        match self {
            Resolution::Coded => "coded",
            Resolution::Derived => "derived",
            Resolution::Optional => "optional",
        }
    }
}

/// One row of the taxonomy: an action, modifier, or derived descriptor, with
/// its Shorthand code, NVAC name, verbatim definition, and how it is resolved.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct Descriptor {
    /// The Shorthand code that records this, or `None` for a purely derived
    /// descriptor that has no code of its own (e.g. a Goal Assist).
    pub code: Option<String>,
    /// Short display label, e.g. "Centre Pass Receive".
    pub label: String,
    /// The NVAC descriptor name (Mackay et al. 2023, Table 2).
    pub nvac_descriptor: String,
    /// The definition, quoting NVAC where it defines the term.
    pub definition: String,
    /// Whether the coder records it, or the engine derives it.
    pub resolution: Resolution,
    /// The parent descriptor's label for a sub-type or derived refinement,
    /// e.g. Interception's parent is "Gain".
    pub parent: Option<String>,
}

/// A documented, deliberate divergence from NVAC or from a naive reading of the
/// event log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct Deviation {
    pub title: String,
    pub detail: String,
}

/// The citation every NVAC-defined term traces to.
pub const CITATION: &str =
    "Mackay et al. 2023, *Consensus on a netball video analysis framework of \
     descriptors and definitions*, BJSM 57(8):441, DOI 10.1136/bjsports-2022-106187";

fn descriptor(
    code: Option<&str>,
    label: &str,
    nvac: &str,
    definition: &str,
    resolution: Resolution,
    parent: Option<&str>,
) -> Descriptor {
    Descriptor {
        code: code.map(str::to_string),
        label: label.to_string(),
        nvac_descriptor: nvac.to_string(),
        definition: definition.to_string(),
        resolution,
        parent: parent.map(str::to_string),
    }
}

/// The full descriptor table, in reading order: coded actions, their optional
/// sub-types, and the descriptors the engine derives from them.
pub fn definitions() -> Vec<Descriptor> {
    use Resolution::{Coded, Derived, Optional};
    vec![
        descriptor(
            Some("c"),
            "Centre Pass Receive",
            "Centre Pass Receiver",
            "The player of the team in possession who receives the ball from the centre pass \
             within the centre third. Codeable for GA, WA, WD, or GD.",
            Coded,
            None,
        ),
        descriptor(
            Some("f"),
            "Feed",
            "Feed into circle",
            "A pass from outside the goal circle to a GA or GS positioned inside it. Codeable \
             for GS, GA, WA, or C.",
            Coded,
            None,
        ),
        descriptor(
            Some("g"),
            "Goal",
            "Goal",
            "A successful shot at goal, from within the goal circle (GS or GA). A shot that \
             misses is the same code with the Failed modifier.",
            Coded,
            None,
        ),
        descriptor(
            Some("p"),
            "Gain",
            "General play turnover",
            "Winning possession from the opposition while play continues. Codeable for any \
             position, or TEAM when unattributable.",
            Coded,
            None,
        ),
        descriptor(
            Some("e"),
            "Unforced Turnover",
            "Unforced turnover",
            "Losing possession through the active team's own error or infringement. Codeable \
             for any position, or TEAM.",
            Coded,
            None,
        ),
        descriptor(
            Some("i"),
            "Infringement",
            "Infringement",
            "An action contrary to the rules, penalised by the umpire. Codeable for any \
             position, or TEAM.",
            Coded,
            None,
        ),
        descriptor(
            Some("r"),
            "Rebound",
            "Rebound",
            "Regathering the ball after an unsuccessful shot. Codeable for GS, GA, GD, or GK; \
             attacking or defensive is derived from the position.",
            Coded,
            None,
        ),
        descriptor(
            Some("pi"),
            "Interception",
            "Interception",
            "A Gain by taking possession directly from an opposition pass, via a catch or a \
             deflection and pick-up.",
            Optional,
            Some("Gain"),
        ),
        descriptor(
            Some("pd"),
            "Deflection",
            "Deflection",
            "A Gain in which a player touches the ball and changes its course, motion, or speed \
             without retaining possession.",
            Optional,
            Some("Gain"),
        ),
        descriptor(
            Some("pp"),
            "Pick-up",
            "Pick-up",
            "A Gain by securing a loose ball that was not directly passed.",
            Optional,
            Some("Gain"),
        ),
        descriptor(
            None,
            "Shot",
            "Shot",
            "Any attempt at goal, successful or not: the count of Goal events regardless of the \
             Failed modifier.",
            Derived,
            Some("Goal"),
        ),
        descriptor(
            None,
            "Feed with Shot",
            "Feed into circle with shot",
            "A Feed followed by a shot before the possession ends. Derived from possession \
             context.",
            Derived,
            Some("Feed"),
        ),
        descriptor(
            None,
            "Goal Assist",
            "Goal Assist",
            "The final pass to a GA or GS directly before a goal, with no rebound in between. \
             Derived; a rebound between the feed and the goal breaks the link.",
            Derived,
            Some("Feed"),
        ),
        descriptor(
            None,
            "Attacking Rebound",
            "Attacking Rebound",
            "A Rebound taken under the attacking post, by GS or GA. Derived from the position.",
            Derived,
            Some("Rebound"),
        ),
        descriptor(
            None,
            "Defensive Rebound",
            "Defensive Rebound",
            "A Rebound taken under the defensive post, by GD or GK. Derived from the position.",
            Derived,
            Some("Rebound"),
        ),
    ]
}

/// The Failed and Flagged modifiers, in the shape the in-app reference shows.
pub fn modifiers() -> Vec<Descriptor> {
    vec![
        descriptor(
            Some("x"),
            "Failed",
            "Unsuccessful attempt",
            "Marks an unsuccessful attempt at the preceding action — a missed shot, an \
             incomplete feed. Applies only to a Receive, Feed, or Goal.",
            Resolution::Coded,
            None,
        ),
        descriptor(
            Some("!"),
            "Flagged",
            "Flagged for review",
            "Marks the event for later human review. Part of the event model even where no \
             review interface exists yet.",
            Resolution::Coded,
            None,
        ),
    ]
}

/// The intentional deviations from NVAC and from a naive log reading.
pub fn deviations() -> Vec<Deviation> {
    let deviation = |title: &str, detail: &str| Deviation {
        title: title.to_string(),
        detail: detail.to_string(),
    };
    vec![
        deviation(
            "Optional Gain sub-types",
            "NVAC has no bare \"Gain\": every general-play turnover is an Interception, \
             Deflection, or Pick-up. Courtside a coder rarely has time to classify one, so \
             CentrePass records a bare Gain (`p`) and treats the three sub-types (`pi`, `pd`, \
             `pp`) as optional refinements.",
        ),
        deviation(
            "Position-derived Rebound classification",
            "NVAC names Attacking and Defensive Rebounds as distinct descriptors. CentrePass \
             codes a single Rebound and derives which it is from the position that took it \
             (GS/GA attacking, GD/GK defensive), so the coder never has to choose.",
        ),
        deviation(
            "Derived team gains and possession boundaries",
            "Possession boundaries are derived from the log, not coded (ADR-0003): a possession \
             ends at a made goal, an unforced turnover, an infringement, a quarter break, or the \
             opposition taking the ball. A possession that begins from neither a centre pass nor \
             a coded player gain is understood as an unattributed team gain, derived rather than \
             recorded.",
        ),
        deviation(
            "Greedy Shorthand sub-type matching",
            "In the Shorthand grammar the two-letter Gain sub-types are matched greedily before \
             a bare `p`, so `1pi` is an interception at GS, not a gain (`p`) followed by an \
             infringement (`i`). Code those as separate tokens when that is what you mean.",
        ),
    ]
}

/// Render the committed `DEFINITIONS.md`: the descriptor table with NVAC
/// citations, the modifiers, and the deviations section. A test asserts the
/// file on disk equals this output, so the document can never drift from the
/// data.
pub fn definitions_markdown() -> String {
    let mut out = String::new();
    out.push_str("# CentrePass action definitions\n\n");
    out.push_str(
        "This file is generated from `crates/netball-core/src/definitions.rs` — the same data \
         the in-app quick reference reads. Do not edit it by hand; run \
         `cargo test -p netball-core regenerate_definitions_md` (with `REGEN_DEFINITIONS=1`) \
         after changing the definitions.\n\n",
    );
    out.push_str(
        "Terminology follows the netball video analysis consensus (NVAC) taxonomy where NVAC \
         defines a term. Citation:\n\n",
    );
    out.push_str(&format!("> {CITATION}\n\n"));

    out.push_str("## Actions\n\n");
    out.push_str("| Code | Descriptor | NVAC term | Resolution | Definition |\n");
    out.push_str("| --- | --- | --- | --- | --- |\n");
    for d in definitions() {
        out.push_str(&row(&d));
    }
    out.push('\n');

    out.push_str("## Modifiers\n\n");
    out.push_str("| Code | Modifier | Resolution | Definition |\n");
    out.push_str("| --- | --- | --- | --- |\n");
    for d in modifiers() {
        out.push_str(&format!(
            "| `{}` | {} | {} | {} |\n",
            d.code.as_deref().unwrap_or(""),
            d.label,
            d.resolution.label(),
            d.definition,
        ));
    }
    out.push('\n');

    out.push_str("## Deviations from NVAC\n\n");
    out.push_str(
        "CentrePass departs from a literal reading of NVAC in four deliberate ways, each to fit \
         courtside coding or the derived-truth model.\n\n",
    );
    for deviation in deviations() {
        out.push_str(&format!(
            "### {}\n\n{}\n\n",
            deviation.title, deviation.detail
        ));
    }
    out
}

fn row(d: &Descriptor) -> String {
    let code = match &d.code {
        Some(code) => format!("`{code}`"),
        None => "—".to_string(),
    };
    let descriptor = match &d.parent {
        Some(parent) => format!("{} _(← {parent})_", d.label),
        None => d.label.clone(),
    };
    format!(
        "| {} | {} | {} | {} | {} |\n",
        code,
        descriptor,
        d.nvac_descriptor,
        d.resolution.label(),
        d.definition,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn definitions_md_path() -> PathBuf {
        // The committed document lives at the repository root.
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../DEFINITIONS.md")
    }

    /// Regenerate the committed document. This is not really a test: it exists
    /// so `REGEN_DEFINITIONS=1 cargo test -p netball-core regenerate_definitions_md`
    /// rewrites `DEFINITIONS.md` after a definitions change. It is inert
    /// otherwise, so a normal run never touches the working tree.
    #[test]
    fn regenerate_definitions_md() {
        if std::env::var_os("REGEN_DEFINITIONS").is_none() {
            return;
        }
        std::fs::write(definitions_md_path(), definitions_markdown())
            .expect("write DEFINITIONS.md");
    }

    /// The generated document and the committed file must agree, so CI fails if
    /// someone changes the definitions data without regenerating (or edits the
    /// document by hand).
    #[test]
    fn committed_definitions_md_is_current() {
        let committed = std::fs::read_to_string(definitions_md_path())
            .expect("DEFINITIONS.md exists at the repository root");
        assert_eq!(
            committed,
            definitions_markdown(),
            "DEFINITIONS.md is stale. Regenerate it with \
             `REGEN_DEFINITIONS=1 cargo test -p netball-core regenerate_definitions_md`.",
        );
    }

    #[test]
    fn every_coded_action_kind_has_a_definition() {
        // Each Shorthand action code the parser accepts must be documented.
        let codes: Vec<String> = definitions().into_iter().filter_map(|d| d.code).collect();
        for code in ["c", "f", "g", "p", "e", "i", "r", "pi", "pd", "pp"] {
            assert!(
                codes.contains(&code.to_string()),
                "missing definition for `{code}`"
            );
        }
    }

    #[test]
    fn there_are_four_documented_deviations() {
        // The four deviations issue 10 calls for, kept explicit.
        assert_eq!(deviations().len(), 4);
    }
}
