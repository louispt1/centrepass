//! The Team in Possession and the possessions it implies (ADR-0004).
//!
//! One fold over the log drives both the live UI's default team for the next
//! tap and the post-match possession segmentation, so the two can never
//! disagree. Nothing here is stored: it is re-derived from the coded truth
//! (ADR-0003).
//!
//! On-ball actions are trusted as recorded - a Feed coded for B means B had
//! the ball, whatever was predicted - so one corrected tap re-aligns every
//! later prediction. After a made goal or a quarter break the ball goes to the
//! team due the next centre pass under Centre Pass Alternation, anchored on
//! the team actually coded for each Centre Pass Receive.

use crate::event::{Action, LogEntry, Position, Team};
use crate::taxonomy::ActionKind;

/// A span of the log during which one team holds the ball. Events by the
/// other team (an infringement) may fall inside it.
pub(crate) struct Possession {
    pub team: Team,
    pub origin: Origin,
    /// Log indices of this possession's events, in order.
    pub events: Vec<usize>,
}

/// How a possession began.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Origin {
    /// From a centre pass - coded as a Centre Pass Receive or not: the first
    /// possession after a restart, held by the team that took it.
    CentrePass,
    Gain,
    /// Anything else, e.g. a defensive rebound.
    Other,
}

#[derive(Default)]
struct Fold {
    /// Who holds the ball now; `None` until it can be known.
    team_in_possession: Option<Team>,
    /// The team due the next centre pass; `None` until one has been coded.
    next_centre_pass: Option<Team>,
    /// A goal or quarter break has happened and its centre pass has not yet
    /// been seen.
    awaiting_centre_pass: bool,
}

impl Fold {
    fn new() -> Fold {
        Fold {
            awaiting_centre_pass: true,
            ..Fold::default()
        }
    }

    /// The team whose possession this event belongs to: its own team, except
    /// an infringement, which is committed against the team in possession.
    fn owner(&self, team: Team, action: &Action) -> Team {
        match action {
            Action::Infringement { .. } => self.team_in_possession.unwrap_or(team.other()),
            _ => team,
        }
    }

    /// The team that took the centre pass at a restart this event is the
    /// first thing after: the predicted team, or with nothing predicted yet
    /// (the toss), the team this event shows had the ball.
    fn centre_pass_taker(&self, team: Team, action: &Action) -> Team {
        self.next_centre_pass
            .unwrap_or_else(|| had_ball_before(team, action))
    }

    fn restart(&mut self) {
        self.team_in_possession = self.next_centre_pass;
        self.awaiting_centre_pass = true;
    }

    fn apply(&mut self, team: Team, action: &Action) {
        if let Action::CentrePassReceive { .. } = action {
            self.next_centre_pass = Some(team.other());
        } else if self.awaiting_centre_pass {
            // The restart's centre pass went uncoded: keep the alternation
            // going from whoever took it.
            self.next_centre_pass = Some(self.centre_pass_taker(team, action).other());
        }
        self.awaiting_centre_pass = false;

        match action {
            Action::Goal { failed: false, .. } => self.restart(),
            Action::UnforcedTurnover { .. } => self.team_in_possession = Some(team.other()),
            Action::Infringement { .. } => {
                self.team_in_possession.get_or_insert(team.other());
            }
            _ => self.team_in_possession = Some(team),
        }
    }
}

/// The team that held the ball just before an action coded for `team`: the
/// inverse of [`resolve_team`].
fn had_ball_before(team: Team, action: &Action) -> Team {
    match *action {
        Action::Gain { .. } | Action::Infringement { .. } => team.other(),
        Action::Rebound { position } if matches!(position.into(), Position::GD | Position::GK) => {
            team.other()
        }
        _ => team,
    }
}

/// The team holding the ball after the whole log - the default team for the
/// next coded event - or `None` when it cannot yet be known (before the first
/// centre pass is coded).
pub fn derive_team_in_possession(log: &[LogEntry]) -> Option<Team> {
    let mut fold = Fold::new();
    for entry in log {
        match entry {
            LogEntry::Event(event) => fold.apply(event.team, &event.action),
            LogEntry::QuarterBreak(_) => fold.restart(),
            LogEntry::Substitution(_) => {}
        }
    }
    fold.team_in_possession
}

/// The team an action at `position` is coded for, given who holds the ball.
/// Gains and infringements are always by the team out of possession; a
/// Rebound belongs to the shooting team (GS/GA) or the defending team
/// (GD/GK); everything else is by the team in possession.
pub fn resolve_team(
    team_in_possession: Option<Team>,
    kind: ActionKind,
    position: Position,
) -> Option<Team> {
    let other = team_in_possession.map(Team::other);
    match (kind, position) {
        (ActionKind::Gain | ActionKind::Infringement, _) => other,
        (ActionKind::Rebound, Position::GD | Position::GK) => other,
        _ => team_in_possession,
    }
}

/// Split the log's events into possessions in match order. A centre pass
/// (coded or not) or a gain always begins a new possession; a made goal, an unforced turnover, and
/// a quarter break end one; otherwise it runs until an event belongs to the
/// other team.
pub(crate) fn segment_possessions(log: &[LogEntry]) -> Vec<Possession> {
    let mut fold = Fold::new();
    let mut possessions = Vec::new();
    let mut current: Option<Possession> = None;
    for (index, entry) in log.iter().enumerate() {
        match entry {
            LogEntry::QuarterBreak(_) => {
                possessions.extend(current.take());
                fold.restart();
            }
            LogEntry::Substitution(_) => {}
            LogEntry::Event(event) => {
                let owner = fold.owner(event.team, &event.action);
                let origin = match event.action {
                    Action::CentrePassReceive { .. } => Origin::CentrePass,
                    Action::Gain { .. } => Origin::Gain,
                    _ if fold.awaiting_centre_pass
                        && fold.centre_pass_taker(event.team, &event.action) == owner =>
                    {
                        Origin::CentrePass
                    }
                    _ => Origin::Other,
                };
                if origin != Origin::Other || !matches!(&current, Some(p) if p.team == owner) {
                    possessions.extend(current.take());
                }
                current
                    .get_or_insert_with(|| Possession {
                        team: owner,
                        origin,
                        events: Vec::new(),
                    })
                    .events
                    .push(index);
                if matches!(
                    event.action,
                    Action::Goal { failed: false, .. } | Action::UnforcedTurnover { .. }
                ) {
                    possessions.extend(current.take());
                }
                fold.apply(event.team, &event.action);
            }
        }
    }
    possessions.extend(current);
    possessions
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{
        CentrePassReceivePosition, Event, FeedPosition, GoalPosition, QuarterBreak, ReboundPosition,
    };
    use Team::{A, B};

    fn event(team: Team, action: Action) -> LogEntry {
        LogEntry::Event(Event {
            team,
            action,
            flagged: false,
            timestamp_ms: None,
        })
    }
    fn cpr(team: Team) -> LogEntry {
        event(
            team,
            Action::CentrePassReceive {
                position: CentrePassReceivePosition::WA,
            },
        )
    }
    fn feed(team: Team, failed: bool) -> LogEntry {
        event(
            team,
            Action::Feed {
                position: FeedPosition::WA,
                failed,
            },
        )
    }
    fn shot(team: Team, failed: bool) -> LogEntry {
        event(
            team,
            Action::Goal {
                position: GoalPosition::GS,
                failed,
            },
        )
    }
    fn gain(team: Team) -> LogEntry {
        event(
            team,
            Action::Gain {
                position: Position::GK,
                sub_type: None,
            },
        )
    }
    fn turnover(team: Team) -> LogEntry {
        event(
            team,
            Action::UnforcedTurnover {
                position: Position::C,
            },
        )
    }
    fn infringement(team: Team) -> LogEntry {
        event(
            team,
            Action::Infringement {
                position: Position::WD,
            },
        )
    }
    fn rebound(team: Team, position: ReboundPosition) -> LogEntry {
        event(team, Action::Rebound { position })
    }
    fn quarter_break() -> LogEntry {
        LogEntry::QuarterBreak(QuarterBreak { timestamp_ms: None })
    }

    fn tip(log: &[LogEntry]) -> Option<Team> {
        derive_team_in_possession(log)
    }

    #[test]
    fn undetermined_until_the_first_centre_pass() {
        assert_eq!(tip(&[]), None);
        assert_eq!(tip(&[cpr(B)]), Some(B));
    }

    #[test]
    fn turnovers_flip_gains_and_rebounds_take_it_infringements_do_not_move_it() {
        assert_eq!(tip(&[cpr(A), turnover(A)]), Some(B));
        assert_eq!(tip(&[cpr(A), gain(B)]), Some(B));
        assert_eq!(tip(&[cpr(A), infringement(B)]), Some(A));
        assert_eq!(tip(&[cpr(A), feed(A, true)]), Some(A));
        assert_eq!(tip(&[cpr(A), shot(A, true)]), Some(A));
        assert_eq!(
            tip(&[cpr(A), shot(A, true), rebound(B, ReboundPosition::GK)]),
            Some(B)
        );
    }

    #[test]
    fn centre_passes_alternate_regardless_of_who_scored() {
        // A takes the centre pass, B intercepts and scores: B is due the next.
        assert_eq!(tip(&[cpr(A), gain(B), shot(B, false)]), Some(B));
        // A scores off their own centre pass: B is due the next.
        assert_eq!(tip(&[cpr(A), shot(A, false)]), Some(B));
    }

    #[test]
    fn the_alternation_carries_across_quarter_breaks() {
        assert_eq!(tip(&[cpr(A), quarter_break()]), Some(B));
        // A goal then the break is one restart, not two.
        assert_eq!(tip(&[cpr(A), shot(A, false), quarter_break()]), Some(B));
    }

    #[test]
    fn an_uncoded_centre_pass_is_assumed_to_be_the_predicted_team() {
        // After A's goal B is due; B's centre pass goes uncoded, so A is next.
        let log = [cpr(A), shot(A, false), feed(B, false), shot(B, false)];
        assert_eq!(tip(&log), Some(A));
    }

    #[test]
    fn a_coded_centre_pass_re_anchors_the_alternation() {
        // Predicted B, but the coder corrected the centre pass to A.
        let log = [cpr(A), shot(A, false), cpr(A), shot(A, false)];
        assert_eq!(tip(&log), Some(B));
    }

    #[test]
    fn on_ball_actions_are_trusted_over_the_prediction() {
        assert_eq!(tip(&[cpr(A), feed(B, false)]), Some(B));
    }

    #[test]
    fn the_first_event_anchors_the_alternation_without_a_coded_receive() {
        // A's first tap is a goal: A took the first centre pass, B is due.
        assert_eq!(tip(&[shot(A, false)]), Some(B));
        assert_eq!(tip(&[feed(A, false), shot(A, false)]), Some(B));
        // B gains first, so A had the first centre pass.
        assert_eq!(tip(&[gain(B), shot(B, false)]), Some(B));
    }

    #[test]
    fn gains_infringements_and_defensive_rebounds_resolve_to_the_other_team() {
        let r = |kind, position| resolve_team(Some(A), kind, position);
        assert_eq!(r(ActionKind::Feed, Position::WA), Some(A));
        assert_eq!(r(ActionKind::Gain, Position::GK), Some(B));
        assert_eq!(r(ActionKind::Infringement, Position::WD), Some(B));
        assert_eq!(r(ActionKind::Rebound, Position::GS), Some(A));
        assert_eq!(r(ActionKind::Rebound, Position::GD), Some(B));
        assert_eq!(resolve_team(None, ActionKind::Gain, Position::GK), None);
    }

    fn origins(log: &[LogEntry]) -> Vec<Origin> {
        segment_possessions(log)
            .into_iter()
            .map(|p| p.origin)
            .collect()
    }

    #[test]
    fn an_uncoded_centre_pass_still_begins_a_centre_pass_possession() {
        use Origin::{CentrePass, Gain, Other};
        // Goals straight off uncoded centre passes, both teams.
        let log = [feed(A, false), shot(A, false), shot(B, false)];
        assert_eq!(origins(&log), [CentrePass, CentrePass]);
        // An opposition infringement first doesn't stop it being A's centre pass.
        assert_eq!(origins(&[infringement(B), feed(A, false)]), [CentrePass]);
        // After a quarter break too; a turnover's follow-on is not one.
        let log = [
            cpr(A),
            quarter_break(),
            feed(B, false),
            turnover(B),
            feed(A, false),
        ];
        assert_eq!(origins(&log), [CentrePass, CentrePass, Other]);
        // Losing the uncoded centre pass to a gain is a gain possession.
        assert_eq!(origins(&[gain(B), shot(B, false)]), [Gain]);
    }

    fn spans(log: &[LogEntry]) -> Vec<(Team, Vec<usize>)> {
        segment_possessions(log)
            .into_iter()
            .map(|p| (p.team, p.events))
            .collect()
    }

    #[test]
    fn an_opposition_infringement_falls_inside_the_possession() {
        let log = [cpr(A), infringement(B), feed(A, false), shot(A, false)];
        assert_eq!(spans(&log), [(A, vec![0, 1, 2, 3])]);
    }

    #[test]
    fn a_goal_ends_a_possession_even_when_the_same_team_restarts() {
        let log = [cpr(A), shot(A, false), gain(B), shot(B, false), cpr(B)];
        assert_eq!(
            spans(&log),
            [(A, vec![0, 1]), (B, vec![2, 3]), (B, vec![4])]
        );
    }

    #[test]
    fn a_gain_always_begins_a_possession() {
        let log = [cpr(A), feed(A, true), gain(A), shot(A, false)];
        assert_eq!(spans(&log), [(A, vec![0, 1]), (A, vec![2, 3])]);
    }

    #[test]
    fn a_defensive_rebound_changes_hands_an_attacking_one_continues() {
        let log = [
            cpr(A),
            shot(A, true),
            rebound(A, ReboundPosition::GA),
            shot(A, true),
            rebound(B, ReboundPosition::GK),
        ];
        assert_eq!(spans(&log), [(A, vec![0, 1, 2, 3]), (B, vec![4])]);
    }

    #[test]
    fn a_quarter_break_ends_a_possession() {
        let log = [cpr(A), feed(A, false), quarter_break(), cpr(A)];
        assert_eq!(spans(&log), [(A, vec![0, 1]), (A, vec![3])]);
    }
}
