//! The post-match statistics report: one derivation over the event log
//! producing every per-player and team-level figure the coach reads
//! (issue 05).
//!
//! Everything here is derived from the log, never stored (ADR-0003), and
//! every derived descriptor is computed from possession context, never coded:
//! a Rebound is attacking or defensive by the shooter/marker position that
//! took it; a Feed is a *feed-with-shot* when a shot follows it before the
//! possession ends, and a *Goal Assist* when that shot scores directly (a
//! rebound between feed and goal breaks the link); the conversion rates count
//! possessions that began with a centre pass or a gain and ended in a goal.
//! These follow the NVAC deviations recorded in `CONTEXT.md`.
//!
//! Count-based statistics stay exact on a timestamp-free log (e.g. a Shorthand
//! import); only Playing Time needs the clock, so it is reported absent —
//! never zeroed or guessed — when the timestamps are missing.

use serde::{Deserialize, Serialize};

use crate::event::{Action, LogEntry, Position, Team};
use crate::roster::{derive_attributions, derive_playing_time};
use crate::score::{derive_quarter_scores, derive_score, Score};

/// The full statistics report for a match: the score, its quarter-by-quarter
/// breakdown, and one [`TeamStats`] per team.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct StatsReport {
    pub score: Score,
    pub quarter_scores: Vec<Score>,
    /// One entry per team, in `[Team::A, Team::B]` order.
    pub teams: Vec<TeamStats>,
}

/// One team's statistics: its players' individual lines plus team-level
/// conversion rates.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct TeamStats {
    pub team: Team,
    /// Players who occupied a position or were credited an event, in order of
    /// first appearance in the log.
    pub players: Vec<PlayerStats>,
    pub conversions: Conversions,
    /// Whether Playing Time could be derived for this team (false when any of
    /// its substitutions lacks a timestamp); when false every player's
    /// `playingTimeMs` is null.
    pub playing_time_available: bool,
}

/// One player's derived statistics for a match. Percentages are left to the
/// caller (`goals / shots`, `completedFeeds / feeds`) so a zero denominator
/// renders as "–" rather than a spurious 0%.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct PlayerStats {
    pub player: String,
    /// Successful shots (a Goal event without the Failed modifier).
    pub goals: u32,
    /// All shot attempts, made or missed.
    pub shots: u32,
    /// All feeds, complete or incomplete.
    pub feeds: u32,
    /// Feeds that reached the shooter (a Feed without the Failed modifier).
    pub completed_feeds: u32,
    /// Feeds followed by a shot before the possession ended (derived).
    pub feeds_with_shot: u32,
    /// Feeds that led directly to a goal, with no rebound in between
    /// (derived).
    pub goal_assists: u32,
    /// Rebounds taken under the attacking post (by GS or GA).
    pub attacking_rebounds: u32,
    /// Rebounds taken under the defensive post (by GD or GK).
    pub defensive_rebounds: u32,
    pub unforced_turnovers: u32,
    pub infringements: u32,
    /// All gains, whatever the sub-type (or none).
    pub gains: u32,
    pub gain_interceptions: u32,
    pub gain_deflections: u32,
    pub gain_pick_ups: u32,
    /// Milliseconds on court, or null when Playing Time is unavailable for the
    /// team (a timestamp-free log).
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub playing_time_ms: Option<i64>,
}

impl PlayerStats {
    fn new(player: String) -> PlayerStats {
        PlayerStats {
            player,
            goals: 0,
            shots: 0,
            feeds: 0,
            completed_feeds: 0,
            feeds_with_shot: 0,
            goal_assists: 0,
            attacking_rebounds: 0,
            defensive_rebounds: 0,
            unforced_turnovers: 0,
            infringements: 0,
            gains: 0,
            gain_interceptions: 0,
            gain_deflections: 0,
            gain_pick_ups: 0,
            playing_time_ms: None,
        }
    }
}

/// A team's possession-conversion rates: how many possessions that started a
/// given way ended in a goal.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct Conversions {
    /// Possessions that began with a centre pass receive.
    pub centre_pass_total: u32,
    /// …of which ended in a goal.
    pub centre_pass_goals: u32,
    /// Possessions that began with a gain.
    pub gain_total: u32,
    /// …of which ended in a goal.
    pub gain_goals: u32,
}

/// A maximal run of one team's consecutive events, ended by the team losing
/// the ball. Beyond the "team changes" boundary of the glossary definition, a
/// made goal, an unforced turnover, and an infringement each end a possession
/// even when the same team is coded next (they have to win the ball back
/// first, which the log records as a new gain or centre pass). Quarter breaks
/// end a possession; substitutions are transparent to it.
struct Possession {
    team: Team,
    /// Log indices of this possession's events, in order.
    events: Vec<usize>,
}

/// Whether this action, once recorded, ends the active team's possession.
fn ends_possession(action: &Action) -> bool {
    matches!(
        action,
        Action::Goal { failed: false, .. }
            | Action::UnforcedTurnover { .. }
            | Action::Infringement { .. }
    )
}

/// Split the log's events into possessions in match order.
fn segment_possessions(log: &[LogEntry]) -> Vec<Possession> {
    let mut possessions = Vec::new();
    let mut current: Option<Possession> = None;
    for (index, entry) in log.iter().enumerate() {
        match entry {
            LogEntry::QuarterBreak(_) => {
                if let Some(possession) = current.take() {
                    possessions.push(possession);
                }
            }
            LogEntry::Substitution(_) => {}
            LogEntry::Event(event) => {
                let continues = matches!(&current, Some(p) if p.team == event.team);
                if !continues {
                    if let Some(possession) = current.take() {
                        possessions.push(possession);
                    }
                    current = Some(Possession {
                        team: event.team,
                        events: Vec::new(),
                    });
                }
                current
                    .as_mut()
                    .expect("just ensured Some")
                    .events
                    .push(index);
                if ends_possession(&event.action) {
                    possessions.push(current.take().expect("just pushed onto Some"));
                }
            }
        }
    }
    if let Some(possession) = current.take() {
        possessions.push(possession);
    }
    possessions
}

/// The [`Event`](crate::event::Event) at `index`, which callers only ever hand
/// indices they collected from `LogEntry::Event` entries.
fn event_at(log: &[LogEntry], index: usize) -> &crate::event::Event {
    match &log[index] {
        LogEntry::Event(event) => event,
        _ => unreachable!("possession indices only point at events"),
    }
}

/// The mutable stat line for an attributed player, if the event was
/// attributed to one of this team's known players.
fn tally<'a>(
    players: &'a mut [PlayerStats],
    player: &Option<String>,
) -> Option<&'a mut PlayerStats> {
    let name = player.as_deref()?;
    players.iter_mut().find(|stats| stats.player == name)
}

/// Derive the full statistics report from a match log in one pass over the
/// coded truth.
pub fn derive_stats(log: &[LogEntry]) -> StatsReport {
    let attributions = derive_attributions(log);
    let possessions = segment_possessions(log);
    let teams = vec![
        build_team_stats(log, &attributions, &possessions, Team::A),
        build_team_stats(log, &attributions, &possessions, Team::B),
    ];
    StatsReport {
        score: derive_score(log),
        quarter_scores: derive_quarter_scores(log),
        teams,
    }
}

/// The team's players, in order of first appearance in the log — whether that
/// first appearance is a substitution onto court or a credited event.
fn team_players_in_order(
    log: &[LogEntry],
    attributions: &[Option<String>],
    team: Team,
) -> Vec<String> {
    let mut order: Vec<String> = Vec::new();
    let mut note = |player: &str| {
        if !order.iter().any(|seen| seen == player) {
            order.push(player.to_string());
        }
    };
    for (index, entry) in log.iter().enumerate() {
        match entry {
            LogEntry::Substitution(substitution) if substitution.team == team => {
                note(&substitution.player);
            }
            LogEntry::Event(event) if event.team == team => {
                if let Some(player) = &attributions[index] {
                    note(player);
                }
            }
            _ => {}
        }
    }
    order
}

fn build_team_stats(
    log: &[LogEntry],
    attributions: &[Option<String>],
    possessions: &[Possession],
    team: Team,
) -> TeamStats {
    let mut players: Vec<PlayerStats> = team_players_in_order(log, attributions, team)
        .into_iter()
        .map(PlayerStats::new)
        .collect();

    // Direct per-event counts, credited to the event's attributed player.
    for (index, entry) in log.iter().enumerate() {
        let LogEntry::Event(event) = entry else {
            continue;
        };
        if event.team != team {
            continue;
        }
        let Some(stats) = tally(&mut players, &attributions[index]) else {
            continue;
        };
        match event.action {
            Action::Goal { failed, .. } => {
                stats.shots += 1;
                if !failed {
                    stats.goals += 1;
                }
            }
            Action::Feed { failed, .. } => {
                stats.feeds += 1;
                if !failed {
                    stats.completed_feeds += 1;
                }
            }
            Action::Rebound { position } => match Position::from(position) {
                Position::GS | Position::GA => stats.attacking_rebounds += 1,
                _ => stats.defensive_rebounds += 1,
            },
            Action::UnforcedTurnover { .. } => stats.unforced_turnovers += 1,
            Action::Infringement { .. } => stats.infringements += 1,
            Action::Gain { sub_type, .. } => {
                stats.gains += 1;
                match sub_type {
                    Some(crate::event::GainSubType::Interception) => stats.gain_interceptions += 1,
                    Some(crate::event::GainSubType::Deflection) => stats.gain_deflections += 1,
                    Some(crate::event::GainSubType::PickUp) => stats.gain_pick_ups += 1,
                    None => {}
                }
            }
            Action::CentrePassReceive { .. } => {}
        }
    }

    // Possession-derived feed descriptors: within each possession the most
    // recent feed is credited feed-with-shot when a shot follows, and a goal
    // assist when that shot scores. A rebound clears the pending feed, so a
    // goal off a rebound assists no one (the rebound chain edge case).
    let mut conversions = Conversions::default();
    for possession in possessions.iter().filter(|p| p.team == team) {
        let mut last_feed: Option<usize> = None;
        for &index in &possession.events {
            match event_at(log, index).action {
                Action::Feed { .. } => last_feed = Some(index),
                Action::Goal { failed, .. } => {
                    if let Some(feed_index) = last_feed.take() {
                        if let Some(stats) = tally(&mut players, &attributions[feed_index]) {
                            stats.feeds_with_shot += 1;
                            if !failed {
                                stats.goal_assists += 1;
                            }
                        }
                    }
                }
                Action::Rebound { .. } => last_feed = None,
                _ => {}
            }
        }

        // Conversion rates: classify the possession by how it started and
        // whether it ended in a goal.
        let converted = possession.events.iter().any(|&index| {
            matches!(
                event_at(log, index).action,
                Action::Goal { failed: false, .. }
            )
        });
        match event_at(log, possession.events[0]).action {
            Action::CentrePassReceive { .. } => {
                conversions.centre_pass_total += 1;
                conversions.centre_pass_goals += u32::from(converted);
            }
            Action::Gain { .. } => {
                conversions.gain_total += 1;
                conversions.gain_goals += u32::from(converted);
            }
            _ => {}
        }
    }

    // Playing Time: attach each player's minutes on court, or leave every
    // player null when the log lacks the timestamps to derive them.
    let playing_time = derive_playing_time(log, team);
    let playing_time_available = playing_time.is_some();
    if let Some(times) = playing_time {
        for time in times {
            if let Some(stats) = players.iter_mut().find(|stats| stats.player == time.player) {
                stats.playing_time_ms = Some(time.milliseconds);
            }
        }
    }

    TeamStats {
        team,
        players,
        conversions,
        playing_time_available,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{
        CentrePassReceivePosition, CourtPosition, Event, FeedPosition, GainSubType, GoalPosition,
        QuarterBreak, ReboundPosition, Substitution,
    };

    // --- Log-building helpers ------------------------------------------------

    fn event(team: Team, action: Action) -> LogEntry {
        LogEntry::Event(Event {
            team,
            action,
            flagged: false,
            timestamp_ms: Some(1_000),
        })
    }

    fn sub(team: Team, position: CourtPosition, player: &str, at_ms: i64) -> LogEntry {
        LogEntry::Substitution(Substitution {
            team,
            position,
            player: player.to_string(),
            timestamp_ms: Some(at_ms),
        })
    }

    fn cpr(team: Team, position: CentrePassReceivePosition) -> LogEntry {
        event(
            team,
            Action::CentrePassReceive {
                position,
                failed: false,
            },
        )
    }

    fn feed(team: Team, position: FeedPosition, failed: bool) -> LogEntry {
        event(team, Action::Feed { position, failed })
    }

    fn shot(team: Team, position: GoalPosition, failed: bool) -> LogEntry {
        event(team, Action::Goal { position, failed })
    }

    fn goal(team: Team, position: GoalPosition) -> LogEntry {
        shot(team, position, false)
    }

    fn gain(team: Team, position: Position, sub_type: Option<GainSubType>) -> LogEntry {
        event(team, Action::Gain { position, sub_type })
    }

    fn rebound(team: Team, position: ReboundPosition) -> LogEntry {
        event(team, Action::Rebound { position })
    }

    fn turnover(team: Team, position: Position) -> LogEntry {
        event(team, Action::UnforcedTurnover { position })
    }

    fn infringement(team: Team, position: Position) -> LogEntry {
        event(team, Action::Infringement { position })
    }

    fn quarter_break() -> LogEntry {
        LogEntry::QuarterBreak(QuarterBreak {
            timestamp_ms: Some(1_000),
        })
    }

    /// Team A's players from a report, by name (panics if absent).
    fn player<'a>(report: &'a StatsReport, name: &str) -> &'a PlayerStats {
        report.teams[0]
            .players
            .iter()
            .find(|stats| stats.player == name)
            .unwrap_or_else(|| panic!("no player {name} in team A"))
    }

    fn strip_timestamps(log: &[LogEntry]) -> Vec<LogEntry> {
        log.iter()
            .map(|entry| match entry.clone() {
                LogEntry::Event(e) => LogEntry::Event(Event {
                    timestamp_ms: None,
                    ..e
                }),
                LogEntry::QuarterBreak(_) => {
                    LogEntry::QuarterBreak(QuarterBreak { timestamp_ms: None })
                }
                LogEntry::Substitution(s) => LogEntry::Substitution(Substitution {
                    timestamp_ms: None,
                    ..s
                }),
            })
            .collect()
    }

    // --- Per-player counts ---------------------------------------------------

    #[test]
    fn shots_and_goals_split_made_from_missed() {
        let log = [
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            goal(Team::A, GoalPosition::GS),
            shot(Team::A, GoalPosition::GS, true),
            goal(Team::A, GoalPosition::GS),
        ];
        let report = derive_stats(&log);
        let alice = player(&report, "Alice");
        assert_eq!(alice.shots, 3);
        assert_eq!(alice.goals, 2);
    }

    #[test]
    fn feeds_split_complete_from_incomplete() {
        let log = [
            sub(Team::A, CourtPosition::WA, "Wanda", 0),
            feed(Team::A, FeedPosition::WA, false),
            feed(Team::A, FeedPosition::WA, true),
            feed(Team::A, FeedPosition::WA, false),
        ];
        let report = derive_stats(&log);
        let wanda = player(&report, "Wanda");
        assert_eq!(wanda.feeds, 3);
        assert_eq!(wanda.completed_feeds, 2);
    }

    #[test]
    fn rebounds_are_attacking_or_defensive_by_position() {
        let log = [
            sub(Team::A, CourtPosition::GA, "Attie", 0),
            sub(Team::A, CourtPosition::GK, "Deffo", 0),
            rebound(Team::A, ReboundPosition::GA),
            rebound(Team::A, ReboundPosition::GK),
            rebound(Team::A, ReboundPosition::GK),
        ];
        let report = derive_stats(&log);
        assert_eq!(player(&report, "Attie").attacking_rebounds, 1);
        assert_eq!(player(&report, "Attie").defensive_rebounds, 0);
        assert_eq!(player(&report, "Deffo").defensive_rebounds, 2);
        assert_eq!(player(&report, "Deffo").attacking_rebounds, 0);
    }

    #[test]
    fn turnovers_and_infringements_are_counted() {
        let log = [
            sub(Team::A, CourtPosition::C, "Cara", 0),
            turnover(Team::A, Position::C),
            infringement(Team::A, Position::C),
            infringement(Team::A, Position::C),
        ];
        let report = derive_stats(&log);
        assert_eq!(player(&report, "Cara").unforced_turnovers, 1);
        assert_eq!(player(&report, "Cara").infringements, 2);
    }

    #[test]
    fn gains_total_and_break_down_by_sub_type() {
        let log = [
            sub(Team::A, CourtPosition::GD, "Gina", 0),
            gain(Team::A, Position::GD, Some(GainSubType::Interception)),
            gain(Team::A, Position::GD, Some(GainSubType::Deflection)),
            gain(Team::A, Position::GD, Some(GainSubType::PickUp)),
            gain(Team::A, Position::GD, None),
        ];
        let report = derive_stats(&log);
        let gina = player(&report, "Gina");
        assert_eq!(gina.gains, 4);
        assert_eq!(gina.gain_interceptions, 1);
        assert_eq!(gina.gain_deflections, 1);
        assert_eq!(gina.gain_pick_ups, 1);
        // The bare gain is in the total but no sub-type bucket.
        assert_eq!(
            gina.gains,
            gina.gain_interceptions + gina.gain_deflections + gina.gain_pick_ups + 1
        );
    }

    // --- Derived feed descriptors -------------------------------------------

    #[test]
    fn a_feed_then_goal_is_a_feed_with_shot_and_an_assist() {
        let log = [
            sub(Team::A, CourtPosition::WA, "Wanda", 0),
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            feed(Team::A, FeedPosition::WA, false),
            goal(Team::A, GoalPosition::GS),
        ];
        let report = derive_stats(&log);
        let wanda = player(&report, "Wanda");
        assert_eq!(wanda.feeds_with_shot, 1);
        assert_eq!(wanda.goal_assists, 1);
    }

    #[test]
    fn a_feed_then_missed_shot_is_a_feed_with_shot_but_no_assist() {
        let log = [
            sub(Team::A, CourtPosition::WA, "Wanda", 0),
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            feed(Team::A, FeedPosition::WA, false),
            shot(Team::A, GoalPosition::GS, true),
        ];
        let report = derive_stats(&log);
        let wanda = player(&report, "Wanda");
        assert_eq!(wanda.feeds_with_shot, 1);
        assert_eq!(wanda.goal_assists, 0);
    }

    #[test]
    fn a_goal_off_a_rebound_does_not_assist_the_original_feed() {
        // feed → miss → rebound → goal: the feed produced a shot (with-shot),
        // but the rebound breaks the assist link, so no assist is credited.
        let log = [
            sub(Team::A, CourtPosition::WA, "Wanda", 0),
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            feed(Team::A, FeedPosition::WA, false),
            shot(Team::A, GoalPosition::GS, true),
            rebound(Team::A, ReboundPosition::GS),
            goal(Team::A, GoalPosition::GS),
        ];
        let report = derive_stats(&log);
        let wanda = player(&report, "Wanda");
        assert_eq!(wanda.feeds_with_shot, 1);
        assert_eq!(wanda.goal_assists, 0);
        // The rebound and second goal still land on the shooter.
        let alice = player(&report, "Alice");
        assert_eq!(alice.attacking_rebounds, 1);
        assert_eq!(alice.goals, 1);
        assert_eq!(alice.shots, 2);
    }

    #[test]
    fn only_the_last_feed_before_a_shot_is_credited() {
        // Two feeds then a goal: the ball was re-fed, so the second feeder
        // gets the with-shot and assist, not the first.
        let log = [
            sub(Team::A, CourtPosition::WA, "Wanda", 0),
            sub(Team::A, CourtPosition::C, "Cara", 0),
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            feed(Team::A, FeedPosition::WA, false),
            feed(Team::A, FeedPosition::C, false),
            goal(Team::A, GoalPosition::GS),
        ];
        let report = derive_stats(&log);
        assert_eq!(player(&report, "Wanda").feeds_with_shot, 0);
        assert_eq!(player(&report, "Wanda").goal_assists, 0);
        assert_eq!(player(&report, "Cara").feeds_with_shot, 1);
        assert_eq!(player(&report, "Cara").goal_assists, 1);
    }

    #[test]
    fn a_feed_the_opposition_ends_carries_no_shot() {
        // feed then the possession is lost (turnover): no shot follows.
        let log = [
            sub(Team::A, CourtPosition::WA, "Wanda", 0),
            feed(Team::A, FeedPosition::WA, false),
            turnover(Team::A, Position::GS),
        ];
        let report = derive_stats(&log);
        assert_eq!(player(&report, "Wanda").feeds_with_shot, 0);
    }

    // --- Conversion rates ----------------------------------------------------

    #[test]
    fn centre_pass_to_goal_conversion_counts_possessions_that_scored() {
        // CP → feed → goal converts; CP → turnover does not.
        let log = [
            sub(Team::A, CourtPosition::WA, "Wanda", 0),
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            cpr(Team::A, CentrePassReceivePosition::WA),
            feed(Team::A, FeedPosition::WA, false),
            goal(Team::A, GoalPosition::GS),
            cpr(Team::A, CentrePassReceivePosition::WA),
            turnover(Team::A, Position::WA),
        ];
        let conversions = derive_stats(&log).teams[0].conversions;
        assert_eq!(conversions.centre_pass_total, 2);
        assert_eq!(conversions.centre_pass_goals, 1);
    }

    #[test]
    fn a_turnover_directly_off_a_centre_pass_is_an_unconverted_possession() {
        let log = [
            sub(Team::A, CourtPosition::WA, "Wanda", 0),
            cpr(Team::A, CentrePassReceivePosition::WA),
            turnover(Team::A, Position::WA),
        ];
        let conversions = derive_stats(&log).teams[0].conversions;
        assert_eq!(conversions.centre_pass_total, 1);
        assert_eq!(conversions.centre_pass_goals, 0);
    }

    #[test]
    fn gain_to_goal_conversion_counts_possessions_that_scored() {
        // A gain that leads to a goal converts; a gain answered by the
        // opposition's goal does not.
        let log = [
            sub(Team::A, CourtPosition::GD, "Gina", 0),
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            gain(Team::A, Position::GD, Some(GainSubType::Interception)),
            goal(Team::A, GoalPosition::GS),
            gain(Team::A, Position::GD, None),
            goal(Team::B, GoalPosition::Team),
        ];
        let conversions = derive_stats(&log).teams[0].conversions;
        assert_eq!(conversions.gain_total, 2);
        assert_eq!(conversions.gain_goals, 1);
    }

    #[test]
    fn a_goal_off_a_rebound_still_converts_the_centre_pass() {
        // The made goal ends the possession even though it came off a rebound;
        // the whole possession began with a centre pass, so it converts.
        let log = [
            sub(Team::A, CourtPosition::WA, "Wanda", 0),
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            cpr(Team::A, CentrePassReceivePosition::WA),
            feed(Team::A, FeedPosition::WA, false),
            shot(Team::A, GoalPosition::GS, true),
            rebound(Team::A, ReboundPosition::GS),
            goal(Team::A, GoalPosition::GS),
        ];
        let conversions = derive_stats(&log).teams[0].conversions;
        assert_eq!(conversions.centre_pass_total, 1);
        assert_eq!(conversions.centre_pass_goals, 1);
    }

    // --- Attribution, teams, and ordering -----------------------------------

    #[test]
    fn a_substitution_splits_a_positions_stats_between_players() {
        let log = [
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            goal(Team::A, GoalPosition::GS),
            sub(Team::A, CourtPosition::GS, "Eve", 2_000),
            goal(Team::A, GoalPosition::GS),
            goal(Team::A, GoalPosition::GS),
        ];
        let report = derive_stats(&log);
        assert_eq!(player(&report, "Alice").goals, 1);
        assert_eq!(player(&report, "Eve").goals, 2);
    }

    #[test]
    fn opposition_goals_score_but_attribute_to_no_player() {
        let log = [
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            goal(Team::A, GoalPosition::GS),
            goal(Team::B, GoalPosition::Team),
            goal(Team::B, GoalPosition::Team),
        ];
        let report = derive_stats(&log);
        assert_eq!(
            report.score,
            Score {
                team_a: 1,
                team_b: 2
            }
        );
        // Team B coded only its goals as TEAM: no per-player rows.
        assert!(report.teams[1].players.is_empty());
    }

    #[test]
    fn players_appear_in_order_of_first_appearance() {
        let log = [
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            sub(Team::A, CourtPosition::GA, "Beth", 0),
            sub(Team::A, CourtPosition::WA, "Wanda", 0),
        ];
        let report = derive_stats(&log);
        let names: Vec<&str> = report.teams[0]
            .players
            .iter()
            .map(|stats| stats.player.as_str())
            .collect();
        assert_eq!(names, ["Alice", "Beth", "Wanda"]);
    }

    #[test]
    fn quarter_breaks_end_the_possession_they_fall_in() {
        // A centre-pass possession interrupted by the end of the quarter never
        // scored, so it does not convert.
        let log = [
            sub(Team::A, CourtPosition::WA, "Wanda", 0),
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            cpr(Team::A, CentrePassReceivePosition::WA),
            feed(Team::A, FeedPosition::WA, false),
            quarter_break(),
            goal(Team::A, GoalPosition::GS),
        ];
        let report = derive_stats(&log);
        let conversions = report.teams[0].conversions;
        assert_eq!(conversions.centre_pass_total, 1);
        assert_eq!(conversions.centre_pass_goals, 0);
        // The feed and the goal are in different possessions, so no assist.
        assert_eq!(player(&report, "Wanda").feeds_with_shot, 0);
    }

    // --- Timestamp-free logs -------------------------------------------------

    #[test]
    fn counts_are_exact_without_timestamps_but_playing_time_is_absent() {
        let log = [
            sub(Team::A, CourtPosition::WA, "Wanda", 0),
            sub(Team::A, CourtPosition::GS, "Alice", 0),
            cpr(Team::A, CentrePassReceivePosition::WA),
            feed(Team::A, FeedPosition::WA, false),
            goal(Team::A, GoalPosition::GS),
        ];
        let timed = derive_stats(&log);
        let untimed = derive_stats(&strip_timestamps(&log));

        // Every count-based figure is identical…
        assert_eq!(timed.score, untimed.score);
        assert_eq!(timed.teams[0].conversions, untimed.teams[0].conversions);
        assert_eq!(
            player_in(&timed, "Alice").goals,
            player_in(&untimed, "Alice").goals
        );
        assert_eq!(
            player_in(&timed, "Wanda").goal_assists,
            player_in(&untimed, "Wanda").goal_assists
        );

        // …but Playing Time is available only with timestamps.
        assert!(timed.teams[0].playing_time_available);
        assert!(player_in(&timed, "Alice").playing_time_ms.is_some());
        assert!(!untimed.teams[0].playing_time_available);
        assert!(player_in(&untimed, "Alice").playing_time_ms.is_none());
    }

    fn player_in<'a>(report: &'a StatsReport, name: &str) -> &'a PlayerStats {
        report.teams[0]
            .players
            .iter()
            .find(|stats| stats.player == name)
            .unwrap()
    }

    #[test]
    fn an_empty_log_reports_nothing_scored_and_no_players() {
        let report = derive_stats(&[]);
        assert_eq!(
            report.score,
            Score {
                team_a: 0,
                team_b: 0
            }
        );
        assert_eq!(report.quarter_scores.len(), 1);
        assert!(report.teams[0].players.is_empty());
        assert!(report.teams[1].players.is_empty());
        assert_eq!(report.teams[0].conversions, Conversions::default());
        // With no substitutions at all, Playing Time is an empty availability,
        // not withheld.
        assert!(report.teams[0].playing_time_available);
    }
}
