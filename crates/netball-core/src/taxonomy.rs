//! The action taxonomy as runtime data: which actions exist, which positions
//! each is legal for, and which modifiers and sub-types apply.
//!
//! The type-level truth lives in [`crate::event::Action`]'s position-subset
//! enums; this module restates it as data so the UI can drive its buttons
//! from the core instead of duplicating the rules (a test below proves the
//! two agree). It is also the seed of the generated NVAC definitions
//! document planned in the PRD.

use serde::{Deserialize, Serialize};

use crate::event::{GainSubType, Position};

/// An [`crate::event::Action`] variant without its payload.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub enum ActionKind {
    CentrePassReceive,
    Feed,
    Goal,
    Gain,
    UnforcedTurnover,
    Infringement,
    Rebound,
}

impl ActionKind {
    pub const ALL: [ActionKind; 7] = [
        ActionKind::CentrePassReceive,
        ActionKind::Feed,
        ActionKind::Goal,
        ActionKind::Gain,
        ActionKind::UnforcedTurnover,
        ActionKind::Infringement,
        ActionKind::Rebound,
    ];

    /// The positions this action may be coded for — exactly the variants of
    /// the corresponding position-subset enum on [`crate::event::Action`].
    /// Gains, turnovers, and infringements can happen to any player (or be
    /// coded TEAM when unattributable); the rationale for each restricted
    /// subset is documented on its enum in [`crate::event`].
    pub fn legal_positions(self) -> &'static [Position] {
        match self {
            ActionKind::CentrePassReceive => {
                &[Position::GA, Position::WA, Position::WD, Position::GD]
            }
            ActionKind::Feed => &[Position::GS, Position::GA, Position::WA, Position::C],
            ActionKind::Goal => &[Position::GS, Position::GA, Position::Team],
            ActionKind::Gain | ActionKind::UnforcedTurnover | ActionKind::Infringement => {
                &Position::ALL
            }
            ActionKind::Rebound => &[Position::GS, Position::GA, Position::GD, Position::GK],
        }
    }

    /// Whether the Failed modifier is meaningful for this action — i.e.
    /// whether the corresponding [`crate::event::Action`] variant carries a
    /// `failed` flag.
    pub fn can_fail(self) -> bool {
        matches!(
            self,
            ActionKind::CentrePassReceive | ActionKind::Feed | ActionKind::Goal
        )
    }

    /// The optional sub-types this action can carry (only Gain has any).
    pub fn sub_types(self) -> &'static [GainSubType] {
        match self {
            ActionKind::Gain => &[
                GainSubType::Interception,
                GainSubType::Deflection,
                GainSubType::PickUp,
            ],
            _ => &[],
        }
    }
}

/// One taxonomy row, in the boundary-friendly shape consumed by the UI.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct ActionKindInfo {
    pub kind: ActionKind,
    pub legal_positions: Vec<Position>,
    pub can_fail: bool,
    pub sub_types: Vec<GainSubType>,
}

/// The full action taxonomy, one row per [`ActionKind`].
pub fn action_taxonomy() -> Vec<ActionKindInfo> {
    ActionKind::ALL
        .iter()
        .map(|&kind| ActionKindInfo {
            kind,
            legal_positions: kind.legal_positions().to_vec(),
            can_fail: kind.can_fail(),
            sub_types: kind.sub_types().to_vec(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::Action;

    /// The JSON an event for this kind/position pair would arrive as at the
    /// boundary, with minimal payload.
    fn action_json(kind: ActionKind, position: Position) -> String {
        let position = serde_json::to_string(&position).unwrap();
        match kind {
            ActionKind::CentrePassReceive => {
                format!(r#"{{"type":"CentrePassReceive","position":{position},"failed":false}}"#)
            }
            ActionKind::Feed => {
                format!(r#"{{"type":"Feed","position":{position},"failed":false}}"#)
            }
            ActionKind::Goal => {
                format!(r#"{{"type":"Goal","position":{position},"failed":false}}"#)
            }
            ActionKind::Gain => format!(r#"{{"type":"Gain","position":{position}}}"#),
            ActionKind::UnforcedTurnover => {
                format!(r#"{{"type":"UnforcedTurnover","position":{position}}}"#)
            }
            ActionKind::Infringement => {
                format!(r#"{{"type":"Infringement","position":{position}}}"#)
            }
            ActionKind::Rebound => format!(r#"{{"type":"Rebound","position":{position}}}"#),
        }
    }

    /// The taxonomy table must agree exactly with what the type system
    /// accepts: a kind/position combination deserializes into an [`Action`]
    /// if and only if the table lists it as legal.
    #[test]
    fn legality_table_agrees_with_type_level_validation() {
        for kind in ActionKind::ALL {
            for position in Position::ALL {
                let parsed = serde_json::from_str::<Action>(&action_json(kind, position));
                assert_eq!(
                    parsed.is_ok(),
                    kind.legal_positions().contains(&position),
                    "taxonomy table and Action types disagree for {kind:?} by {position:?}"
                );
                if let Ok(action) = parsed {
                    assert_eq!(action.kind(), kind);
                    assert_eq!(action.position(), position);
                }
            }
        }
    }

    #[test]
    fn only_receives_feeds_and_shots_can_fail() {
        let failable: Vec<ActionKind> = ActionKind::ALL
            .into_iter()
            .filter(|kind| kind.can_fail())
            .collect();
        assert_eq!(
            failable,
            [
                ActionKind::CentrePassReceive,
                ActionKind::Feed,
                ActionKind::Goal
            ]
        );
    }

    #[test]
    fn only_gain_has_sub_types_and_it_has_all_three() {
        for kind in ActionKind::ALL {
            let expected: &[GainSubType] = if kind == ActionKind::Gain {
                &[
                    GainSubType::Interception,
                    GainSubType::Deflection,
                    GainSubType::PickUp,
                ]
            } else {
                &[]
            };
            assert_eq!(kind.sub_types(), expected);
        }
    }

    #[test]
    fn taxonomy_has_one_row_per_kind_in_order() {
        let kinds: Vec<ActionKind> = action_taxonomy().into_iter().map(|row| row.kind).collect();
        assert_eq!(kinds, ActionKind::ALL);
    }
}
