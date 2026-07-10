//! Roster reconstruction, per-event player attribution, and Playing Time.
//!
//! The roster is never stored: it is the fold of a team's Substitution
//! entries over the log (ADR-0003), so it can be reconstructed at any point
//! in the match. Attribution assigns each coded event to the player occupying
//! its position at that moment; Playing Time integrates the substitution
//! timestamps and is unavailable — never zeroed or guessed — when a log has
//! no timestamps (e.g. Shorthand imports).

use serde::{Deserialize, Serialize};

use crate::event::{CourtPosition, LogEntry, Team};

/// Which player occupies each position for one team at some point in a
/// match. Unassigned positions (an incomplete roster) are `None`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct Roster {
    pub gs: Option<String>,
    pub ga: Option<String>,
    pub wa: Option<String>,
    pub c: Option<String>,
    pub wd: Option<String>,
    pub gd: Option<String>,
    pub gk: Option<String>,
}

impl Roster {
    /// The player currently occupying `position`, if any.
    pub fn player_at(&self, position: CourtPosition) -> Option<&str> {
        self.slot(position).as_deref()
    }

    /// Put `player` in `position`, replacing any previous occupant.
    pub fn assign(&mut self, position: CourtPosition, player: String) {
        *self.slot_mut(position) = Some(player);
    }

    fn slot(&self, position: CourtPosition) -> &Option<String> {
        match position {
            CourtPosition::GS => &self.gs,
            CourtPosition::GA => &self.ga,
            CourtPosition::WA => &self.wa,
            CourtPosition::C => &self.c,
            CourtPosition::WD => &self.wd,
            CourtPosition::GD => &self.gd,
            CourtPosition::GK => &self.gk,
        }
    }

    fn slot_mut(&mut self, position: CourtPosition) -> &mut Option<String> {
        match position {
            CourtPosition::GS => &mut self.gs,
            CourtPosition::GA => &mut self.ga,
            CourtPosition::WA => &mut self.wa,
            CourtPosition::C => &mut self.c,
            CourtPosition::WD => &mut self.wd,
            CourtPosition::GD => &mut self.gd,
            CourtPosition::GK => &mut self.gk,
        }
    }
}

/// Derive one team's roster after replaying the whole log: each position
/// holds the player named by the team's most recent Substitution to it.
pub fn derive_roster(log: &[LogEntry], team: Team) -> Roster {
    let mut roster = Roster::default();
    for entry in log {
        if let LogEntry::Substitution(substitution) = entry {
            if substitution.team == team {
                roster.assign(substitution.position, substitution.player.clone());
            }
        }
    }
    roster
}

/// Attribute every log entry to a player: for a coded event, the player
/// occupying its position for its team at that point in the log. `None` for
/// marker entries, TEAM-attributed events, and positions no substitution has
/// filled yet. The result is parallel to `log`.
pub fn derive_attributions(log: &[LogEntry]) -> Vec<Option<String>> {
    let mut rosters = [Roster::default(), Roster::default()];
    let roster_index = |team: Team| match team {
        Team::A => 0,
        Team::B => 1,
    };
    log.iter()
        .map(|entry| match entry {
            LogEntry::Substitution(substitution) => {
                rosters[roster_index(substitution.team)]
                    .assign(substitution.position, substitution.player.clone());
                None
            }
            LogEntry::QuarterBreak(_) => None,
            LogEntry::Event(event) => CourtPosition::from_position(event.action.position())
                .and_then(|position| rosters[roster_index(event.team)].player_at(position))
                .map(str::to_string),
        })
        .collect()
}

/// One player's derived time on court.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct PlayingTime {
    pub player: String,
    // Date.now()-scale values well inside the safe-integer range.
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub milliseconds: i64,
}

/// Derive each of one team's players' time on court, in order of first
/// appearance. A player is on court from the timestamp of the substitution
/// that placed them until another substitution replaces them in that
/// position, or until the last timestamped moment the log knows about; a
/// player who occupies several positions in sequence accumulates across
/// stints.
///
/// Returns `None` — playing time unavailable, not zero — when any of the
/// team's substitutions lacks a timestamp (e.g. a Shorthand import).
pub fn derive_playing_time(log: &[LogEntry], team: Team) -> Option<Vec<PlayingTime>> {
    let substitutions: Vec<_> = log
        .iter()
        .filter_map(|entry| match entry {
            LogEntry::Substitution(substitution) if substitution.team == team => Some(substitution),
            _ => None,
        })
        .collect();
    // No roster yet means nobody to time — that is knowledge, not absence
    // of it, so it is an empty list rather than None.
    if substitutions.is_empty() {
        return Some(Vec::new());
    }
    if substitutions.iter().any(|s| s.timestamp_ms.is_none()) {
        return None;
    }

    let end_ms = log.iter().filter_map(LogEntry::timestamp_ms).max();
    let mut totals: Vec<PlayingTime> = Vec::new();
    let mut credit = |player: &str, on_ms: i64, off_ms: i64| {
        // Saturate rather than trust a clock that ran backwards.
        let stint = (off_ms - on_ms).max(0);
        match totals.iter_mut().find(|total| total.player == player) {
            Some(total) => total.milliseconds += stint,
            None => totals.push(PlayingTime {
                player: player.to_string(),
                milliseconds: stint,
            }),
        }
    };

    let mut on_court: Vec<(CourtPosition, &str, i64)> = Vec::new();
    for substitution in substitutions {
        let now_ms = substitution.timestamp_ms.expect("checked above");
        if let Some(slot) = on_court
            .iter_mut()
            .find(|(position, ..)| *position == substitution.position)
        {
            credit(slot.1, slot.2, now_ms);
            slot.1 = &substitution.player;
            slot.2 = now_ms;
        } else {
            on_court.push((substitution.position, &substitution.player, now_ms));
        }
    }
    let end_ms = end_ms.expect("a timestamped substitution implies a max timestamp");
    for (_, player, on_ms) in on_court {
        credit(player, on_ms, end_ms);
    }
    Some(totals)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{Action, Event, GoalPosition, QuarterBreak, Substitution};

    fn substitution(team: Team, position: CourtPosition, player: &str, at_ms: i64) -> LogEntry {
        LogEntry::Substitution(Substitution {
            team,
            position,
            player: player.to_string(),
            timestamp_ms: Some(at_ms),
        })
    }

    fn goal_by(team: Team, position: GoalPosition, at_ms: i64) -> LogEntry {
        LogEntry::Event(Event {
            team,
            action: Action::Goal {
                position,
                failed: false,
            },
            flagged: false,
            timestamp_ms: Some(at_ms),
        })
    }

    fn quarter_break(at_ms: i64) -> LogEntry {
        LogEntry::QuarterBreak(QuarterBreak {
            timestamp_ms: Some(at_ms),
        })
    }

    fn strip_timestamps(log: &[LogEntry]) -> Vec<LogEntry> {
        log.iter()
            .map(|entry| match entry.clone() {
                LogEntry::Event(event) => LogEntry::Event(Event {
                    timestamp_ms: None,
                    ..event
                }),
                LogEntry::QuarterBreak(_) => {
                    LogEntry::QuarterBreak(QuarterBreak { timestamp_ms: None })
                }
                LogEntry::Substitution(substitution) => LogEntry::Substitution(Substitution {
                    timestamp_ms: None,
                    ..substitution
                }),
            })
            .collect()
    }

    #[test]
    fn an_empty_log_has_an_empty_roster() {
        assert_eq!(derive_roster(&[], Team::A), Roster::default());
    }

    #[test]
    fn setup_substitutions_fill_the_roster_and_gaps_stay_open() {
        let log = [
            substitution(Team::A, CourtPosition::GS, "Alice", 0),
            substitution(Team::A, CourtPosition::C, "Cara", 0),
        ];
        let roster = derive_roster(&log, Team::A);
        assert_eq!(roster.player_at(CourtPosition::GS), Some("Alice"));
        assert_eq!(roster.player_at(CourtPosition::C), Some("Cara"));
        assert_eq!(roster.player_at(CourtPosition::GK), None);
    }

    #[test]
    fn a_later_substitution_replaces_the_occupant() {
        let log = [
            substitution(Team::A, CourtPosition::GA, "Beth", 0),
            substitution(Team::A, CourtPosition::GA, "Dana", 600_000),
        ];
        assert_eq!(
            derive_roster(&log, Team::A).player_at(CourtPosition::GA),
            Some("Dana")
        );
    }

    #[test]
    fn each_team_has_its_own_roster() {
        let log = [
            substitution(Team::A, CourtPosition::GS, "Alice", 0),
            substitution(Team::B, CourtPosition::GS, "Zoe", 0),
        ];
        assert_eq!(
            derive_roster(&log, Team::A).player_at(CourtPosition::GS),
            Some("Alice")
        );
        assert_eq!(
            derive_roster(&log, Team::B).player_at(CourtPosition::GS),
            Some("Zoe")
        );
    }

    #[test]
    fn events_attribute_to_the_occupant_at_that_moment() {
        // Beth shoots, is substituted for Dana at the same position, Dana
        // shoots: the two goals attribute to different players.
        let log = [
            substitution(Team::A, CourtPosition::GA, "Beth", 0),
            goal_by(Team::A, GoalPosition::GA, 1_000),
            substitution(Team::A, CourtPosition::GA, "Dana", 2_000),
            goal_by(Team::A, GoalPosition::GA, 3_000),
        ];
        assert_eq!(
            derive_attributions(&log),
            vec![
                None,
                Some("Beth".to_string()),
                None,
                Some("Dana".to_string())
            ]
        );
    }

    #[test]
    fn attribution_is_none_for_team_events_and_unfilled_positions() {
        let log = [
            substitution(Team::A, CourtPosition::GA, "Beth", 0),
            // TEAM-attributed goal: no individual to attribute.
            goal_by(Team::A, GoalPosition::Team, 1_000),
            // GS has no substitution yet: attributable position, no player.
            goal_by(Team::A, GoalPosition::GS, 2_000),
        ];
        assert_eq!(derive_attributions(&log), vec![None, None, None]);
    }

    #[test]
    fn attribution_respects_the_event_team() {
        // Team B's roster never answers for team A's events.
        let log = [
            substitution(Team::B, CourtPosition::GS, "Zoe", 0),
            goal_by(Team::A, GoalPosition::GS, 1_000),
            goal_by(Team::B, GoalPosition::GS, 2_000),
        ];
        assert_eq!(
            derive_attributions(&log),
            vec![None, None, Some("Zoe".to_string())]
        );
    }

    #[test]
    fn attribution_works_without_timestamps() {
        // Order-based derivations stay exact on timestamp-free logs.
        let log = strip_timestamps(&[
            substitution(Team::A, CourtPosition::GA, "Beth", 0),
            goal_by(Team::A, GoalPosition::GA, 0),
        ]);
        assert_eq!(
            derive_attributions(&log),
            vec![None, Some("Beth".to_string())]
        );
    }

    #[test]
    fn playing_time_runs_from_going_on_to_being_replaced_or_the_end() {
        let log = [
            substitution(Team::A, CourtPosition::GA, "Beth", 0),
            substitution(Team::A, CourtPosition::GA, "Dana", 600_000),
            goal_by(Team::A, GoalPosition::GA, 900_000),
        ];
        assert_eq!(
            derive_playing_time(&log, Team::A).unwrap(),
            vec![
                PlayingTime {
                    player: "Beth".to_string(),
                    milliseconds: 600_000
                },
                PlayingTime {
                    player: "Dana".to_string(),
                    milliseconds: 300_000
                },
            ]
        );
    }

    #[test]
    fn a_substitution_at_a_quarter_break_splits_time_at_the_break() {
        let log = [
            substitution(Team::A, CourtPosition::GA, "Beth", 0),
            quarter_break(600_000),
            substitution(Team::A, CourtPosition::GA, "Dana", 600_000),
            goal_by(Team::A, GoalPosition::GA, 1_000_000),
        ];
        let times = derive_playing_time(&log, Team::A).unwrap();
        assert_eq!(times[0].milliseconds, 600_000); // Beth: up to the break
        assert_eq!(times[1].milliseconds, 400_000); // Dana: the break onward
    }

    #[test]
    fn a_player_in_two_positions_in_sequence_accumulates_across_stints() {
        // Alice starts GS, moves to GA when Eve takes GS; Alice's total spans
        // both stints.
        let log = [
            substitution(Team::A, CourtPosition::GS, "Alice", 0),
            substitution(Team::A, CourtPosition::GS, "Eve", 400_000),
            substitution(Team::A, CourtPosition::GA, "Alice", 400_000),
            goal_by(Team::A, GoalPosition::GA, 1_000_000),
        ];
        assert_eq!(
            derive_playing_time(&log, Team::A).unwrap(),
            vec![
                PlayingTime {
                    player: "Alice".to_string(),
                    milliseconds: 1_000_000
                },
                PlayingTime {
                    player: "Eve".to_string(),
                    milliseconds: 600_000
                },
            ]
        );
    }

    #[test]
    fn playing_time_is_unavailable_without_timestamps() {
        let log = strip_timestamps(&[
            substitution(Team::A, CourtPosition::GA, "Beth", 0),
            goal_by(Team::A, GoalPosition::GA, 0),
        ]);
        assert_eq!(derive_playing_time(&log, Team::A), None);
    }

    #[test]
    fn one_untimestamped_substitution_withholds_playing_time_entirely() {
        let log = [
            substitution(Team::A, CourtPosition::GA, "Beth", 0),
            LogEntry::Substitution(Substitution {
                team: Team::A,
                position: CourtPosition::GS,
                player: "Alice".to_string(),
                timestamp_ms: None,
            }),
            goal_by(Team::A, GoalPosition::GA, 600_000),
        ];
        assert_eq!(derive_playing_time(&log, Team::A), None);
    }

    #[test]
    fn playing_time_without_a_roster_is_an_empty_list_not_unavailable() {
        let log = [goal_by(Team::A, GoalPosition::GS, 1_000)];
        assert_eq!(derive_playing_time(&log, Team::A), Some(vec![]));
        // Even with nothing timestamped — or nothing at all — in the log.
        assert_eq!(derive_playing_time(&[], Team::A), Some(vec![]));
        assert_eq!(
            derive_playing_time(&strip_timestamps(&log), Team::A),
            Some(vec![])
        );
    }

    #[test]
    fn playing_time_only_counts_the_asked_teams_players() {
        let log = [
            substitution(Team::A, CourtPosition::GS, "Alice", 0),
            substitution(Team::B, CourtPosition::GS, "Zoe", 0),
            goal_by(Team::A, GoalPosition::GS, 500_000),
        ];
        let times = derive_playing_time(&log, Team::A).unwrap();
        assert_eq!(times.len(), 1);
        assert_eq!(times[0].player, "Alice");
    }
}
