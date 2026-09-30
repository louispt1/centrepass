//! The Collection File: the portable form of a Collection - its stable id,
//! name, Player Aliases and member Match Files - shared as one file so a
//! season reaches every phone with the same name and aliases (ADR-0008).
//!
//! Each member is embedded as a complete, versioned Match File and read back
//! through [`MatchFile::from_json`], so match migrations apply unchanged.
//! Merging into a Collection already on the device is the UI's job.

use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize};

use crate::match_file::{is_plain_id, MatchFile, MatchFileError};

/// The Collection File format version this engine writes.
pub const COLLECTION_FILE_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct CollectionFile {
    /// The Collection's stable identity across devices.
    pub id: String,
    pub name: String,
    /// "Ali" -> "Alice", as the Collection stores them.
    pub player_aliases: BTreeMap<String, String>,
    pub matches: Vec<MatchFile>,
}

/// On disk, members are whole Match File documents with their own version.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VersionedCollectionFile {
    version: u32,
    id: String,
    name: String,
    player_aliases: BTreeMap<String, String>,
    matches: Vec<serde_json::Value>,
}

/// Why a candidate Collection File could not be imported, for a coder to read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CollectionFileError {
    UnsupportedVersion {
        found: u32,
    },
    Malformed,
    /// A member match is unreadable; nothing from the file is imported.
    Match(MatchFileError),
}

impl fmt::Display for CollectionFileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CollectionFileError::UnsupportedVersion { found } => write!(
                f,
                "This collection file is version {found}, but this version of CentrePass only \
                 understands up to version {COLLECTION_FILE_VERSION}. Update CentrePass and try again."
            ),
            CollectionFileError::Malformed => write!(
                f,
                "This file isn't a valid CentrePass collection file, or it has been corrupted."
            ),
            CollectionFileError::Match(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for CollectionFileError {}

impl CollectionFile {
    pub fn to_json(&self) -> String {
        let versioned = VersionedCollectionFile {
            version: COLLECTION_FILE_VERSION,
            id: self.id.clone(),
            name: self.name.clone(),
            player_aliases: self.player_aliases.clone(),
            matches: self
                .matches
                .iter()
                .map(|m| serde_json::from_str(&m.to_json()).expect("a Match File is JSON"))
                .collect(),
        };
        serde_json::to_string(&versioned).expect("CollectionFile always serializes")
    }

    /// Parse a Collection File. On any error - including one unreadable
    /// member - no value is produced, so an import is never partial.
    pub fn from_json(json: &str) -> Result<CollectionFile, CollectionFileError> {
        #[derive(Deserialize)]
        struct VersionPeek {
            version: Option<u32>,
        }
        let peek: VersionPeek =
            serde_json::from_str(json).map_err(|_| CollectionFileError::Malformed)?;
        match peek.version {
            Some(COLLECTION_FILE_VERSION) => {}
            None | Some(0) => return Err(CollectionFileError::Malformed),
            Some(found) => return Err(CollectionFileError::UnsupportedVersion { found }),
        }
        let versioned: VersionedCollectionFile =
            serde_json::from_str(json).map_err(|_| CollectionFileError::Malformed)?;
        if !is_plain_id(&versioned.id) {
            return Err(CollectionFileError::Malformed);
        }
        let matches = versioned
            .matches
            .iter()
            .map(|m| MatchFile::from_json(&m.to_string()).map_err(CollectionFileError::Match))
            .collect::<Result<_, _>>()?;
        Ok(CollectionFile {
            id: versioned.id,
            name: versioned.name,
            player_aliases: versioned.player_aliases,
            matches,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> CollectionFile {
        let game = |id: &str, log| MatchFile {
            id: Some(id.to_string()),
            team_a_name: "Hornets".into(),
            team_b_name: "Riverside".into(),
            date: "2026-09-14".into(),
            log,
        };
        let goal = serde_json::from_str(
            r#"{"kind":"Event","team":"A","action":{"type":"Goal","position":"GS","failed":false},"flagged":false,"timestampMs":null}"#,
        )
        .unwrap();
        CollectionFile {
            id: "autumn-2026".into(),
            name: "Autumn 2026".into(),
            player_aliases: BTreeMap::from([("Ali".into(), "Alice".into())]),
            matches: vec![game("m1", vec![goal]), game("m2", vec![])],
        }
    }

    #[test]
    fn a_written_file_reads_back_identical() {
        let file = sample();
        assert_eq!(CollectionFile::from_json(&file.to_json()), Ok(file));
    }

    #[test]
    fn members_are_migrated_like_any_match_file() {
        // A version 3 member with a Gain Deflection, from before version 4.
        let json = r#"{"version":1,"id":"c","name":"C","playerAliases":{},"matches":[
            {"version":3,"id":"m","teamAName":"A","teamBName":"B","date":"2026-09-14","log":[
              {"kind":"Event","team":"A","action":{"type":"Gain","position":"WD","subType":"Deflection"},"flagged":false,"timestampMs":null}]}]}"#;
        let file = CollectionFile::from_json(json).unwrap();
        let entry = serde_json::to_value(&file.matches[0].log[0]).unwrap();
        assert_eq!(entry["action"]["type"], "Deflection");
    }

    #[test]
    fn bad_versions_ids_and_members_are_rejected() {
        let with = |version: &str, id: &str, member_version: u32| {
            format!(
                r#"{{"version":{version},"id":"{id}","name":"C","playerAliases":{{}},"matches":[
                {{"version":{member_version},"id":"m","teamAName":"A","teamBName":"B","date":"d","log":[]}}]}}"#
            )
        };
        assert_eq!(
            CollectionFile::from_json(&with("2", "c", 4)),
            Err(CollectionFileError::UnsupportedVersion { found: 2 })
        );
        assert_eq!(
            CollectionFile::from_json(&with("1", "../c", 4)),
            Err(CollectionFileError::Malformed)
        );
        assert_eq!(
            CollectionFile::from_json(&with("1", "c", 99)),
            Err(CollectionFileError::Match(
                MatchFileError::UnsupportedVersion { found: 99 }
            ))
        );
        assert_eq!(
            CollectionFile::from_json("not json"),
            Err(CollectionFileError::Malformed)
        );
    }
}
