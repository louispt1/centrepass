//! Score derivation. Like every statistic, the score is derived from the
//! event log on demand and never stored (ADR-0003).

use serde::{Deserialize, Serialize};

use crate::event::{Action, LogEntry, Team};

/// The running score of a match, one tally per team.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct Score {
    pub team_a: u32,
    pub team_b: u32,
}

impl Score {
    const NIL_ALL: Score = Score {
        team_a: 0,
        team_b: 0,
    };

    /// The tally for one team.
    pub fn for_team(&self, team: Team) -> u32 {
        match team {
            Team::A => self.team_a,
            Team::B => self.team_b,
        }
    }

    fn credit(&mut self, team: Team) {
        match team {
            Team::A => self.team_a += 1,
            Team::B => self.team_b += 1,
        }
    }
}

/// Derive the match score from a log: one point per successful Goal event
/// (a Goal with `failed: true` is a missed shot), credited to the team the
/// event carries. Marker entries never score.
pub fn derive_score(log: &[LogEntry]) -> Score {
    let mut score = Score::NIL_ALL;
    for entry in log {
        if let LogEntry::Event(event) = entry {
            if let Action::Goal { failed: false, .. } = event.action {
                score.credit(event.team);
            }
        }
    }
    score
}

/// Derive the score of each quarter separately: the log split at its
/// QuarterBreak markers, one [`Score`] per segment in match order. The
/// current quarter of a live match is the length of this vector (an empty
/// log is in quarter 1), and the match score is the elementwise sum.
pub fn derive_quarter_scores(log: &[LogEntry]) -> Vec<Score> {
    let mut quarters = vec![Score::NIL_ALL];
    for entry in log {
        match entry {
            LogEntry::QuarterBreak(_) => quarters.push(Score::NIL_ALL),
            LogEntry::Event(event) => {
                if let Action::Goal { failed: false, .. } = event.action {
                    quarters.last_mut().unwrap().credit(event.team);
                }
            }
            LogEntry::Substitution(_) => {}
        }
    }
    quarters
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{
        CourtPosition, Event, GainSubType, GoalPosition, Position, QuarterBreak, ReboundPosition,
        Substitution,
    };

    fn event(team: Team, action: Action) -> LogEntry {
        LogEntry::Event(Event {
            team,
            action,
            flagged: false,
            timestamp_ms: Some(1_770_000_000_000),
        })
    }

    fn goal(team: Team) -> LogEntry {
        event(
            team,
            Action::Goal {
                position: GoalPosition::GS,
                failed: false,
            },
        )
    }

    fn quarter_break() -> LogEntry {
        LogEntry::QuarterBreak(QuarterBreak {
            timestamp_ms: Some(1_770_000_000_000),
        })
    }

    #[test]
    fn empty_log_scores_nil_all() {
        assert_eq!(
            derive_score(&[]),
            Score {
                team_a: 0,
                team_b: 0
            }
        );
    }

    #[test]
    fn goals_are_credited_to_the_team_each_event_carries() {
        let log = [goal(Team::A), goal(Team::B), goal(Team::A)];
        assert_eq!(
            derive_score(&log),
            Score {
                team_a: 2,
                team_b: 1
            }
        );
    }

    #[test]
    fn missed_shots_do_not_score() {
        let log = [
            goal(Team::A),
            event(
                Team::A,
                Action::Goal {
                    position: GoalPosition::GA,
                    failed: true,
                },
            ),
        ];
        assert_eq!(derive_score(&log).for_team(Team::A), 1);
    }

    #[test]
    fn non_goal_actions_do_not_score() {
        let log = [
            event(
                Team::A,
                Action::Gain {
                    position: Position::WD,
                    sub_type: Some(GainSubType::Interception),
                },
            ),
            event(
                Team::A,
                Action::Rebound {
                    position: ReboundPosition::GS,
                },
            ),
            event(
                Team::A,
                Action::Infringement {
                    position: Position::Team,
                },
            ),
        ];
        assert_eq!(
            derive_score(&log),
            Score {
                team_a: 0,
                team_b: 0
            }
        );
    }

    #[test]
    fn team_attributed_goals_score_like_any_other() {
        // The one-tap Opposition goal: an ordinary Goal event, position TEAM.
        let log = [event(
            Team::B,
            Action::Goal {
                position: GoalPosition::Team,
                failed: false,
            },
        )];
        assert_eq!(derive_score(&log).for_team(Team::B), 1);
    }

    #[test]
    fn score_ignores_missing_timestamps() {
        let log = [LogEntry::Event(Event {
            team: Team::B,
            action: Action::Goal {
                position: GoalPosition::Team,
                failed: false,
            },
            flagged: false,
            timestamp_ms: None,
        })];
        assert_eq!(derive_score(&log).for_team(Team::B), 1);
    }

    #[test]
    fn markers_never_score() {
        let log = [
            LogEntry::Substitution(Substitution {
                team: Team::A,
                position: CourtPosition::GS,
                player: "Alice".to_string(),
                timestamp_ms: Some(1),
            }),
            quarter_break(),
        ];
        assert_eq!(
            derive_score(&log),
            Score {
                team_a: 0,
                team_b: 0
            }
        );
    }

    #[test]
    fn post_undo_log_re_derives_without_the_last_event() {
        let log = [goal(Team::A), goal(Team::A), goal(Team::B)];
        let undone = &log[..log.len() - 1];
        assert_eq!(
            derive_score(undone),
            Score {
                team_a: 2,
                team_b: 0
            }
        );
    }

    #[test]
    fn undoing_every_event_returns_to_nil_all() {
        let log = [goal(Team::A)];
        assert_eq!(
            derive_score(&log[..0]),
            Score {
                team_a: 0,
                team_b: 0
            }
        );
    }

    #[test]
    fn an_empty_log_is_in_quarter_one() {
        assert_eq!(derive_quarter_scores(&[]), vec![Score::NIL_ALL]);
    }

    #[test]
    fn quarter_breaks_split_the_score_by_quarter() {
        let log = [
            goal(Team::A),
            goal(Team::B),
            quarter_break(),
            goal(Team::A),
            quarter_break(),
            // Quarter 3 scoreless so far; the break was still just tapped.
        ];
        assert_eq!(
            derive_quarter_scores(&log),
            vec![
                Score {
                    team_a: 1,
                    team_b: 1
                },
                Score {
                    team_a: 1,
                    team_b: 0
                },
                Score::NIL_ALL,
            ]
        );
    }

    #[test]
    fn quarter_scores_sum_to_the_match_score() {
        let log = [
            goal(Team::A),
            quarter_break(),
            goal(Team::B),
            goal(Team::A),
            quarter_break(),
            goal(Team::B),
        ];
        let quarters = derive_quarter_scores(&log);
        let summed = quarters.iter().fold(Score::NIL_ALL, |sum, q| Score {
            team_a: sum.team_a + q.team_a,
            team_b: sum.team_b + q.team_b,
        });
        assert_eq!(summed, derive_score(&log));
    }
}
