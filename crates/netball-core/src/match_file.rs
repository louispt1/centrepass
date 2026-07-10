//! The Match File: the portable, self-contained representation of one match —
//! its event log plus metadata — and the unit of export, import, backup, and
//! migration (ADR-0003, `CONTEXT.md`).
//!
//! A Match File is a versioned JSON document (`"version": 1`). (De)serialization
//! lives here in the core, not the UI, so every entry path shares one schema and
//! one validation: a file round-trips perfectly (importing an exported match on
//! another device yields an identical match, and so identical stats), and an
//! unrecognised version or malformed content is rejected with a clear,
//! human-readable message rather than a broken or partial import.

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::event::LogEntry;

/// The Match File format version this engine reads and writes. Bump this only
/// alongside a migration; [`MatchFile::from_json`] rejects any other version.
pub const MATCH_FILE_VERSION: u32 = 1;

/// One match in its portable form: the append-only log that is the only stored
/// truth (ADR-0003), plus the metadata needed to name and date it. The `version`
/// envelope is not part of this in-memory value — it is written by
/// [`MatchFile::to_json`] and checked by [`MatchFile::from_json`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct MatchFile {
    /// Name of team A — the active team, coded in detail.
    pub team_a_name: String,
    /// Name of team B — the opposition.
    pub team_b_name: String,
    /// Match date, `YYYY-MM-DD`.
    pub date: String,
    /// The append-only log: coded events plus quarter and substitution markers.
    pub log: Vec<LogEntry>,
}

/// The on-disk shape: a [`MatchFile`] under its version envelope. Kept private
/// so the version can only ever be written as [`MATCH_FILE_VERSION`] and read
/// back through the validation in [`MatchFile::from_json`].
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionedMatchFile {
    version: u32,
    team_a_name: String,
    team_b_name: String,
    date: String,
    log: Vec<LogEntry>,
}

/// Why a candidate Match File could not be imported. The [`fmt::Display`] text
/// is written for a coder to read, not a developer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MatchFileError {
    /// A Match File from a version this engine does not understand — almost
    /// always a newer app that wrote a format this one predates.
    UnsupportedVersion { found: u32 },
    /// Not a Match File at all, or one whose contents are corrupt: invalid
    /// JSON, a missing version, or an event the model rejects.
    Malformed,
}

impl fmt::Display for MatchFileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MatchFileError::UnsupportedVersion { found } => write!(
                f,
                "This match file is version {found}, but this version of CentrePass only \
                 understands up to version {MATCH_FILE_VERSION}. Update CentrePass and try again."
            ),
            MatchFileError::Malformed => write!(
                f,
                "This file isn't a valid CentrePass match file, or it has been corrupted."
            ),
        }
    }
}

impl std::error::Error for MatchFileError {}

impl MatchFile {
    /// Serialize to the canonical Match File JSON, tagged with the current
    /// [`MATCH_FILE_VERSION`]. Infallible: every `MatchFile` is representable.
    pub fn to_json(&self) -> String {
        let versioned = VersionedMatchFile {
            version: MATCH_FILE_VERSION,
            team_a_name: self.team_a_name.clone(),
            team_b_name: self.team_b_name.clone(),
            date: self.date.clone(),
            log: self.log.clone(),
        };
        serde_json::to_string(&versioned).expect("MatchFile always serializes")
    }

    /// Parse a Match File, validating its version before its contents so a
    /// future format fails as [`MatchFileError::UnsupportedVersion`] with a
    /// clear message rather than as an opaque malformed error. On any error no
    /// value is produced, so a caller can never act on a partial import.
    pub fn from_json(json: &str) -> Result<MatchFile, MatchFileError> {
        // Peek at the version first. serde ignores the other fields here, so a
        // newer file is diagnosed as an unsupported version even if the rest of
        // its shape has since changed.
        #[derive(Deserialize)]
        struct VersionPeek {
            version: Option<u32>,
        }
        let peek: VersionPeek =
            serde_json::from_str(json).map_err(|_| MatchFileError::Malformed)?;
        match peek.version {
            None => return Err(MatchFileError::Malformed),
            Some(version) if version != MATCH_FILE_VERSION => {
                return Err(MatchFileError::UnsupportedVersion { found: version })
            }
            Some(_) => {}
        }

        let versioned: VersionedMatchFile =
            serde_json::from_str(json).map_err(|_| MatchFileError::Malformed)?;
        Ok(MatchFile {
            team_a_name: versioned.team_a_name,
            team_b_name: versioned.team_b_name,
            date: versioned.date,
            log: versioned.log,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{
        Action, CentrePassReceivePosition, CourtPosition, Event, FeedPosition, GainSubType,
        GoalPosition, Position, QuarterBreak, ReboundPosition, Substitution, Team,
    };
    use proptest::prelude::*;

    fn sample_match() -> MatchFile {
        MatchFile {
            team_a_name: "Hornets U13".to_string(),
            team_b_name: "Riverside".to_string(),
            date: "2026-07-10".to_string(),
            log: vec![
                LogEntry::Substitution(Substitution {
                    team: Team::A,
                    position: CourtPosition::GS,
                    player: "Alice".to_string(),
                    timestamp_ms: Some(1_000),
                }),
                LogEntry::Event(Event {
                    team: Team::A,
                    action: Action::Goal {
                        position: GoalPosition::GS,
                        failed: false,
                    },
                    flagged: false,
                    timestamp_ms: Some(2_000),
                }),
                LogEntry::QuarterBreak(QuarterBreak {
                    timestamp_ms: Some(3_000),
                }),
            ],
        }
    }

    #[test]
    fn to_json_tags_the_current_version() {
        let json = sample_match().to_json();
        assert!(
            json.starts_with(r#"{"version":1,"#),
            "expected a version-1 envelope, got {json}"
        );
    }

    #[test]
    fn a_written_file_reads_back_identical() {
        let match_file = sample_match();
        let reparsed = MatchFile::from_json(&match_file.to_json()).unwrap();
        assert_eq!(reparsed, match_file);
    }

    #[test]
    fn an_unrecognised_version_is_rejected_with_its_number() {
        let json = r#"{"version":2,"teamAName":"A","teamBName":"B","date":"2026-07-10","log":[]}"#;
        assert_eq!(
            MatchFile::from_json(json),
            Err(MatchFileError::UnsupportedVersion { found: 2 })
        );
        // The message names the offending version and points at the fix.
        let message = MatchFileError::UnsupportedVersion { found: 2 }.to_string();
        assert!(message.contains('2'));
        assert!(message.contains("Update CentrePass"));
    }

    #[test]
    fn a_file_without_a_version_is_malformed_not_imported() {
        let json = r#"{"teamAName":"A","teamBName":"B","date":"2026-07-10","log":[]}"#;
        assert_eq!(MatchFile::from_json(json), Err(MatchFileError::Malformed));
    }

    #[test]
    fn invalid_json_is_malformed() {
        assert_eq!(
            MatchFile::from_json("not json at all"),
            Err(MatchFileError::Malformed)
        );
    }

    #[test]
    fn an_illegal_event_fails_the_whole_import() {
        // A shot by WD cannot exist in the model; the file is rejected whole,
        // leaving no partial match behind.
        let json = concat!(
            r#"{"version":1,"teamAName":"A","teamBName":"B","date":"2026-07-10","#,
            r#""log":[{"kind":"Event","team":"A","#,
            r#""action":{"type":"Goal","position":"WD","failed":false},"#,
            r#""flagged":false,"timestampMs":1}]}"#
        );
        assert_eq!(MatchFile::from_json(json), Err(MatchFileError::Malformed));
    }

    // --- Property: any valid match round-trips through its Match File --------

    fn arb_gain_sub_type() -> impl Strategy<Value = Option<GainSubType>> {
        prop_oneof![
            Just(None),
            Just(Some(GainSubType::Interception)),
            Just(Some(GainSubType::Deflection)),
            Just(Some(GainSubType::PickUp)),
        ]
    }

    fn arb_position() -> impl Strategy<Value = Position> {
        prop_oneof![
            Just(Position::GS),
            Just(Position::GA),
            Just(Position::WA),
            Just(Position::C),
            Just(Position::WD),
            Just(Position::GD),
            Just(Position::GK),
            Just(Position::Team),
        ]
    }

    fn arb_court_position() -> impl Strategy<Value = CourtPosition> {
        prop_oneof![
            Just(CourtPosition::GS),
            Just(CourtPosition::GA),
            Just(CourtPosition::WA),
            Just(CourtPosition::C),
            Just(CourtPosition::WD),
            Just(CourtPosition::GD),
            Just(CourtPosition::GK),
        ]
    }

    fn arb_action() -> impl Strategy<Value = Action> {
        prop_oneof![
            (
                prop_oneof![
                    Just(CentrePassReceivePosition::GA),
                    Just(CentrePassReceivePosition::WA),
                    Just(CentrePassReceivePosition::WD),
                    Just(CentrePassReceivePosition::GD),
                ],
                any::<bool>()
            )
                .prop_map(|(position, failed)| Action::CentrePassReceive { position, failed }),
            (
                prop_oneof![
                    Just(FeedPosition::GS),
                    Just(FeedPosition::GA),
                    Just(FeedPosition::WA),
                    Just(FeedPosition::C),
                ],
                any::<bool>()
            )
                .prop_map(|(position, failed)| Action::Feed { position, failed }),
            (
                prop_oneof![
                    Just(GoalPosition::GS),
                    Just(GoalPosition::GA),
                    Just(GoalPosition::Team),
                ],
                any::<bool>()
            )
                .prop_map(|(position, failed)| Action::Goal { position, failed }),
            (arb_position(), arb_gain_sub_type())
                .prop_map(|(position, sub_type)| Action::Gain { position, sub_type }),
            arb_position().prop_map(|position| Action::UnforcedTurnover { position }),
            arb_position().prop_map(|position| Action::Infringement { position }),
            prop_oneof![
                Just(ReboundPosition::GS),
                Just(ReboundPosition::GA),
                Just(ReboundPosition::GD),
                Just(ReboundPosition::GK),
            ]
            .prop_map(|position| Action::Rebound { position }),
        ]
    }

    fn arb_team() -> impl Strategy<Value = Team> {
        prop_oneof![Just(Team::A), Just(Team::B)]
    }

    fn arb_timestamp() -> impl Strategy<Value = Option<i64>> {
        prop_oneof![Just(None), any::<i64>().prop_map(Some)]
    }

    fn arb_log_entry() -> impl Strategy<Value = LogEntry> {
        prop_oneof![
            (arb_team(), arb_action(), any::<bool>(), arb_timestamp()).prop_map(
                |(team, action, flagged, timestamp_ms)| LogEntry::Event(Event {
                    team,
                    action,
                    flagged,
                    timestamp_ms,
                })
            ),
            arb_timestamp()
                .prop_map(|timestamp_ms| LogEntry::QuarterBreak(QuarterBreak { timestamp_ms })),
            (arb_team(), arb_court_position(), ".*", arb_timestamp()).prop_map(
                |(team, position, player, timestamp_ms)| LogEntry::Substitution(Substitution {
                    team,
                    position,
                    player,
                    timestamp_ms,
                })
            ),
        ]
    }

    fn arb_match_file() -> impl Strategy<Value = MatchFile> {
        (
            ".*",
            ".*",
            ".*",
            prop::collection::vec(arb_log_entry(), 0..40),
        )
            .prop_map(|(team_a_name, team_b_name, date, log)| MatchFile {
                team_a_name,
                team_b_name,
                date,
                log,
            })
    }

    proptest! {
        /// Serialize → deserialize round-trips to an identical match for any
        /// valid match: this is what makes an exported file reproduce the
        /// exporting device's stats exactly (they are all derived from the log).
        #[test]
        fn any_match_round_trips_through_its_match_file(match_file in arb_match_file()) {
            let reparsed = MatchFile::from_json(&match_file.to_json()).unwrap();
            prop_assert_eq!(reparsed, match_file);
        }
    }
}
