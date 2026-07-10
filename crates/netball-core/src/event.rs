//! The coded event model: the only stored truth for a match (ADR-0003).
//!
//! The model is two-team-native — every event carries a [`Team`] — even
//! though the v1 tap UI codes only the active team in detail. Opposition
//! goals are ordinary Goal events attributed to the other team; nothing in
//! this crate special-cases them.
//!
//! Invalid events are unrepresentable: each [`Action`] variant that is only
//! legal for some positions carries a position-subset enum rather than a bare
//! [`Position`], so an illegal combination (a shot by WD, a feed by TEAM)
//! cannot be constructed in Rust and fails deserialization at the boundary.
//! The runtime legality table the UI consumes lives in [`crate::taxonomy`];
//! a test there proves the two stay in agreement.

use serde::{Deserialize, Serialize};

/// One of the two teams in a match, identified positionally. Which name each
/// slot carries (and which one the coder codes in detail) is match metadata
/// owned by the caller, not part of the event model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub enum Team {
    A,
    B,
}

impl Team {
    /// The opposing team.
    pub fn other(self) -> Team {
        match self {
            Team::A => Team::B,
            Team::B => Team::A,
        }
    }
}

/// The seven on-court netball positions, plus TEAM for events not
/// attributable to an individual.
#[allow(clippy::upper_case_acronyms)] // GS/GA/… are the canonical position codes
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub enum Position {
    GS,
    GA,
    WA,
    C,
    WD,
    GD,
    GK,
    Team,
}

impl Position {
    pub const ALL: [Position; 8] = [
        Position::GS,
        Position::GA,
        Position::WA,
        Position::C,
        Position::WD,
        Position::GD,
        Position::GK,
        Position::Team,
    ];
}

/// Defines an enum of a subset of [`Position`]s, convertible into `Position`.
/// Serialization uses the same strings as `Position`, so a subset field
/// rejects exactly the positions it omits.
macro_rules! position_subset {
    ($(#[$doc:meta])* $name:ident { $($variant:ident),+ $(,)? }) => {
        $(#[$doc])*
        #[allow(clippy::upper_case_acronyms)] // canonical position codes
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        #[serde(rename_all = "UPPERCASE")]
        #[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
        pub enum $name {
            $($variant),+
        }

        impl From<$name> for Position {
            fn from(position: $name) -> Position {
                match position {
                    $($name::$variant => Position::$variant),+
                }
            }
        }
    };
}

position_subset!(
    /// Positions that may receive a centre pass: those allowed in the centre
    /// third at a centre pass. C takes the pass, GS and GK may not enter the
    /// centre third, and a receive is always attributable to the player who
    /// caught it, so TEAM is excluded.
    CentrePassReceivePosition { GA, WA, WD, GD }
);

position_subset!(
    /// Positions that can pass from outside the goal circle to a shooter
    /// inside it: those allowed in the attacking goal third. WD, GD, and GK
    /// may not enter it; TEAM is excluded because a feed is always
    /// attributable to the passer.
    FeedPosition { GS, GA, WA, C }
);

position_subset!(
    /// Shots may only be taken by GS or GA. TEAM covers a goal whose shooter
    /// is not coded — the one-tap Opposition goal in the v1 UI.
    GoalPosition { GS, GA, Team }
);

position_subset!(
    /// Rebounds are regathered under the post by the shooters (GS/GA,
    /// attacking) or their markers (GD/GK, defensive); the classification is
    /// derived from the position, so TEAM would make it underivable.
    ReboundPosition { GS, GA, GD, GK }
);

/// Optional detail on how possession was won, coded when time pressure
/// allows (a deviation from NVAC, which has no bare Gain — see `CONTEXT.md`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub enum GainSubType {
    Interception,
    Deflection,
    PickUp,
}

/// A coded action, per the NVAC-aligned taxonomy in `CONTEXT.md`.
///
/// Variants carry their own position (restricted to the legal subset) and,
/// where an unsuccessful attempt is meaningful, a `failed` flag: a Goal with
/// `failed: true` is a missed shot, a failed Feed is an incomplete one.
/// Turnovers and infringements are already failures, and a Rebound is by
/// definition a successful regather, so those cannot carry `failed`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub enum Action {
    CentrePassReceive {
        position: CentrePassReceivePosition,
        failed: bool,
    },
    Feed {
        position: FeedPosition,
        failed: bool,
    },
    Goal {
        position: GoalPosition,
        failed: bool,
    },
    Gain {
        position: Position,
        #[serde(default, rename = "subType")]
        sub_type: Option<GainSubType>,
    },
    UnforcedTurnover {
        position: Position,
    },
    Infringement {
        position: Position,
    },
    Rebound {
        position: ReboundPosition,
    },
}

impl Action {
    /// This action's kind, for keying into the [`crate::taxonomy`] table.
    pub fn kind(&self) -> crate::taxonomy::ActionKind {
        use crate::taxonomy::ActionKind;
        match self {
            Action::CentrePassReceive { .. } => ActionKind::CentrePassReceive,
            Action::Feed { .. } => ActionKind::Feed,
            Action::Goal { .. } => ActionKind::Goal,
            Action::Gain { .. } => ActionKind::Gain,
            Action::UnforcedTurnover { .. } => ActionKind::UnforcedTurnover,
            Action::Infringement { .. } => ActionKind::Infringement,
            Action::Rebound { .. } => ActionKind::Rebound,
        }
    }

    /// The position this action is attributed to, widened to [`Position`].
    pub fn position(&self) -> Position {
        match *self {
            Action::CentrePassReceive { position, .. } => position.into(),
            Action::Feed { position, .. } => position.into(),
            Action::Goal { position, .. } => position.into(),
            Action::Gain { position, .. } => position,
            Action::UnforcedTurnover { position } => position,
            Action::Infringement { position } => position,
            Action::Rebound { position } => position.into(),
        }
    }
}

/// One coded observation in a match's append-only event log.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct Event {
    pub team: Team,
    pub action: Action,
    /// Marks the event for later human review.
    pub flagged: bool,
    /// Wall-clock capture time, milliseconds since the Unix epoch. Present on
    /// live taps; absent for entry paths with no clock (e.g. Shorthand
    /// imports). Derivations must degrade gracefully without it.
    // ts-rs would map i64 to bigint, but these values come from Date.now()
    // and must stay plain JSON numbers in the Match File.
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub timestamp_ms: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_json_is_the_match_file_shape() {
        let event = Event {
            team: Team::A,
            action: Action::Gain {
                position: Position::WD,
                sub_type: Some(GainSubType::Interception),
            },
            flagged: true,
            timestamp_ms: Some(123),
        };
        assert_eq!(
            serde_json::to_string(&event).unwrap(),
            r#"{"team":"A","action":{"type":"Gain","position":"WD","subType":"Interception"},"flagged":true,"timestampMs":123}"#
        );
    }

    #[test]
    fn events_round_trip_through_json() {
        let events = vec![
            Event {
                team: Team::A,
                action: Action::CentrePassReceive {
                    position: CentrePassReceivePosition::GA,
                    failed: false,
                },
                flagged: false,
                timestamp_ms: Some(1),
            },
            Event {
                team: Team::A,
                action: Action::Gain {
                    position: Position::Team,
                    sub_type: None,
                },
                flagged: false,
                timestamp_ms: None,
            },
            Event {
                team: Team::B,
                action: Action::Goal {
                    position: GoalPosition::Team,
                    failed: false,
                },
                flagged: false,
                timestamp_ms: Some(2),
            },
        ];
        let json = serde_json::to_string(&events).unwrap();
        assert_eq!(serde_json::from_str::<Vec<Event>>(&json).unwrap(), events);
    }

    #[test]
    fn a_bare_gain_deserializes_without_a_sub_type_field() {
        let action: Action = serde_json::from_str(r#"{"type":"Gain","position":"GK"}"#).unwrap();
        assert_eq!(
            action,
            Action::Gain {
                position: Position::GK,
                sub_type: None
            }
        );
    }

    #[test]
    fn a_shot_by_a_non_shooter_fails_to_deserialize() {
        let illegal = r#"{"type":"Goal","position":"WD","failed":false}"#;
        assert!(serde_json::from_str::<Action>(illegal).is_err());
    }

    #[test]
    fn subset_positions_widen_to_the_matching_position() {
        assert_eq!(Position::from(GoalPosition::Team), Position::Team);
        assert_eq!(Position::from(ReboundPosition::GK), Position::GK);
        assert_eq!(
            Action::Feed {
                position: FeedPosition::WA,
                failed: true
            }
            .position(),
            Position::WA
        );
    }
}
