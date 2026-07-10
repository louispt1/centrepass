//! Score derivation. Like every statistic, the score is derived from the
//! event log on demand and never stored (ADR-0003).

use serde::{Deserialize, Serialize};

use crate::event::{Action, Event, Team};

/// The running score of a match, one tally per team.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct Score {
    pub team_a: u32,
    pub team_b: u32,
}

impl Score {
    /// The tally for one team.
    pub fn for_team(&self, team: Team) -> u32 {
        match team {
            Team::A => self.team_a,
            Team::B => self.team_b,
        }
    }
}

/// Derive the score from an event log: one point per successful Goal event
/// (a Goal with `failed: true` is a missed shot), credited to the team the
/// event carries.
pub fn derive_score(events: &[Event]) -> Score {
    let mut score = Score {
        team_a: 0,
        team_b: 0,
    };
    for event in events {
        if let Action::Goal { failed: false, .. } = event.action {
            match event.team {
                Team::A => score.team_a += 1,
                Team::B => score.team_b += 1,
            }
        }
    }
    score
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{GainSubType, GoalPosition, Position, ReboundPosition};

    fn event(team: Team, action: Action) -> Event {
        Event {
            team,
            action,
            flagged: false,
            timestamp_ms: Some(1_770_000_000_000),
        }
    }

    fn goal(team: Team) -> Event {
        event(
            team,
            Action::Goal {
                position: GoalPosition::GS,
                failed: false,
            },
        )
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
        let log = [Event {
            team: Team::B,
            action: Action::Goal {
                position: GoalPosition::Team,
                failed: false,
            },
            flagged: false,
            timestamp_ms: None,
        }];
        assert_eq!(derive_score(&log).for_team(Team::B), 1);
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
}
