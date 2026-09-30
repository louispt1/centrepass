//! Cross-match statistics for a Collection (`CONTEXT.md`): each member match
//! is replayed through [`derive_stats`] unchanged, then the per-match player
//! lines are summed.
//!
//! Identity across matches is by name only. Teams bucket by trimmed,
//! case-insensitive name, whichever A/B slot they were coded in. Players
//! bucket the same way, then fold through the Collection's Player Aliases,
//! transitively. Only counts are summed - rates are left to the caller to
//! divide once, never averaged as percentages.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::match_file::MatchFile;
use crate::stats::{derive_stats, Conversions, PlayerStats, TeamTotals};

/// Every team seen across a Collection's matches, most matches first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct CollectionStats {
    pub teams: Vec<CollectionTeam>,
}

/// One team-name bucket's summed player lines.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct CollectionTeam {
    /// The name as first spelled in the Collection.
    pub name: String,
    /// Member matches this team played in.
    pub matches: u32,
    /// …of which Playing Time was unavailable (no timestamps), so each
    /// player's `playingTimeMs` covers only the rest.
    pub untimed_matches: u32,
    /// In order of first appearance across the matches.
    pub players: Vec<CollectionPlayer>,
    /// Played / Won / Drawn / Lost and goals, over Full Time matches only.
    pub record: SeasonRecord,
    /// Summed over every coded match, Full Time or not. Rates are the
    /// caller's to divide once from these counts.
    pub totals: TeamTotals,
    pub conversions: Conversions,
    /// The opposition's conversions in this team's matches (how well it
    /// defends their centre pass).
    pub opponent_conversions: Conversions,
    /// One point per coded match, in date order, for trends.
    pub series: Vec<SeasonPoint>,
}

/// A team's Season Record (`CONTEXT.md`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct SeasonRecord {
    pub played: u32,
    pub won: u32,
    pub drawn: u32,
    pub lost: u32,
    pub goals_for: u32,
    pub goals_against: u32,
}

/// One coded match from a team's side: the raw counts behind its trends.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct SeasonPoint {
    pub match_id: Option<String>,
    pub date: String,
    pub full_time: bool,
    pub goals_for: u32,
    pub goals_against: u32,
    pub totals: TeamTotals,
    pub conversions: Conversions,
    pub opponent_conversions: Conversions,
}

/// One player's stats summed across the matches they appeared in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS), ts(export))]
pub struct CollectionPlayer {
    /// Summed counts. `playingTimeMs` sums only the matches where it was
    /// available, and is null only when it was available in none of them.
    pub stats: PlayerStats,
    /// Member matches where the player appears in that match's stats.
    pub games_played: u32,
}

fn add_conversions(total: &mut Conversions, more: &Conversions) {
    total.centre_pass_total += more.centre_pass_total;
    total.centre_pass_goals += more.centre_pass_goals;
    total.gain_total += more.gain_total;
    total.gain_goals += more.gain_goals;
}

fn add_totals(total: &mut TeamTotals, more: &TeamTotals) {
    total.goals += more.goals;
    total.shots += more.shots;
    total.gains += more.gains;
    total.deflections += more.deflections;
    total.unforced_turnovers += more.unforced_turnovers;
    total.infringements += more.infringements;
    total.possessions += more.possessions;
    total.possession_goals += more.possession_goals;
}

fn key(name: &str) -> String {
    name.trim().to_lowercase()
}

/// The player's bucket key and display name after following the aliases.
/// Bounded by the alias count, so a cycle cannot loop forever.
fn resolve(name: &str, aliases: &HashMap<String, String>) -> (String, String) {
    let mut display = name.trim().to_string();
    let mut current = key(name);
    for _ in 0..aliases.len() {
        match aliases.get(&current) {
            Some(target) if key(target) != current => {
                display = target.trim().to_string();
                current = key(target);
            }
            _ => break,
        }
    }
    (current, display)
}

fn add(total: &mut PlayerStats, line: &PlayerStats) {
    total.goals += line.goals;
    total.shots += line.shots;
    total.feeds += line.feeds;
    total.completed_feeds += line.completed_feeds;
    total.feeds_with_shot += line.feeds_with_shot;
    total.goal_assists += line.goal_assists;
    total.attacking_rebounds += line.attacking_rebounds;
    total.defensive_rebounds += line.defensive_rebounds;
    total.unforced_turnovers += line.unforced_turnovers;
    total.infringements += line.infringements;
    total.gains += line.gains;
    total.gain_interceptions += line.gain_interceptions;
    total.gain_pick_ups += line.gain_pick_ups;
    total.deflections += line.deflections;
    if let Some(ms) = line.playing_time_ms {
        total.playing_time_ms = Some(total.playing_time_ms.unwrap_or(0) + ms);
    }
}

/// Accumulators carry the index of the last match they counted, so a name on
/// both sides of one match still counts that match once.
struct TeamAcc {
    key: String,
    team: CollectionTeam,
    last_match: usize,
    players: Vec<(String, usize)>,
}

/// Sum the stats of `matches` per team name and player name, folding player
/// names through `aliases` (keys and values compared trimmed and
/// case-insensitive).
pub fn derive_collection_stats(
    matches: &[MatchFile],
    aliases: &HashMap<String, String>,
) -> CollectionStats {
    let aliases: HashMap<String, String> = aliases
        .iter()
        .map(|(from, to)| (key(from), to.clone()))
        .collect();
    let mut teams: Vec<TeamAcc> = Vec::new();

    for (match_index, match_file) in matches.iter().enumerate() {
        // A Fixture (empty log) hasn't been played, so it counts for nothing.
        if match_file.log.is_empty() {
            continue;
        }
        let report = derive_stats(&match_file.log);
        let names = [&match_file.team_a_name, &match_file.team_b_name];
        for (side, (team_stats, name)) in report.teams.iter().zip(names).enumerate() {
            let opponent = &report.teams[1 - side];
            let team_key = key(name);
            let position = match teams.iter().position(|t| t.key == team_key) {
                Some(position) => position,
                None => {
                    teams.push(TeamAcc {
                        key: team_key,
                        team: CollectionTeam {
                            name: name.trim().to_string(),
                            matches: 0,
                            untimed_matches: 0,
                            players: Vec::new(),
                            record: SeasonRecord::default(),
                            totals: TeamTotals::default(),
                            conversions: Conversions::default(),
                            opponent_conversions: Conversions::default(),
                            series: Vec::new(),
                        },
                        last_match: usize::MAX,
                        players: Vec::new(),
                    });
                    teams.len() - 1
                }
            };
            let acc = &mut teams[position];
            // A name on both sides of one match (an internal game) counts
            // its first side only.
            if acc.last_match != match_index {
                acc.last_match = match_index;
                acc.team.matches += 1;
                let (goals_for, goals_against) = (
                    report.score.for_team(team_stats.team),
                    report.score.for_team(opponent.team),
                );
                let team = &mut acc.team;
                if report.full_time {
                    let record = &mut team.record;
                    record.played += 1;
                    match goals_for.cmp(&goals_against) {
                        std::cmp::Ordering::Greater => record.won += 1,
                        std::cmp::Ordering::Equal => record.drawn += 1,
                        std::cmp::Ordering::Less => record.lost += 1,
                    }
                    record.goals_for += goals_for;
                    record.goals_against += goals_against;
                }
                add_totals(&mut team.totals, &team_stats.totals);
                add_conversions(&mut team.conversions, &team_stats.conversions);
                add_conversions(&mut team.opponent_conversions, &opponent.conversions);
                team.series.push(SeasonPoint {
                    match_id: match_file.id.clone(),
                    date: match_file.date.clone(),
                    full_time: report.full_time,
                    goals_for,
                    goals_against,
                    totals: team_stats.totals,
                    conversions: team_stats.conversions,
                    opponent_conversions: opponent.conversions,
                });
            }
            if !team_stats.playing_time_available {
                acc.team.untimed_matches += 1;
            }

            for line in &team_stats.players {
                let (player_key, display) = resolve(&line.player, &aliases);
                let slot = match acc.players.iter().position(|(k, _)| *k == player_key) {
                    Some(slot) => slot,
                    None => {
                        acc.players.push((player_key, usize::MAX));
                        acc.team.players.push(CollectionPlayer {
                            stats: PlayerStats::new(display),
                            games_played: 0,
                        });
                        acc.players.len() - 1
                    }
                };
                let player = &mut acc.team.players[slot];
                add(&mut player.stats, line);
                if acc.players[slot].1 != match_index {
                    acc.players[slot].1 = match_index;
                    player.games_played += 1;
                }
            }
        }
    }

    let mut teams: Vec<CollectionTeam> = teams.into_iter().map(|acc| acc.team).collect();
    for team in &mut teams {
        // Stable, so same-day matches keep the caller's order.
        team.series.sort_by(|a, b| a.date.cmp(&b.date));
    }
    // Stable: ties keep first-appearance order.
    teams.sort_by_key(|team| std::cmp::Reverse(team.matches));
    CollectionStats { teams }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{
        Action, CentrePassReceivePosition, CourtPosition, Event, GoalPosition, LogEntry,
        QuarterBreak, Substitution, Team,
    };

    fn sub(team: Team, position: CourtPosition, player: &str, at: Option<i64>) -> LogEntry {
        LogEntry::Substitution(Substitution {
            team,
            position,
            player: player.to_string(),
            timestamp_ms: at,
        })
    }

    fn goal(team: Team, position: GoalPosition, at: Option<i64>) -> LogEntry {
        LogEntry::Event(Event {
            team,
            action: Action::Goal {
                position,
                failed: false,
            },
            flagged: false,
            timestamp_ms: at,
        })
    }

    fn game(a: &str, b: &str, log: Vec<LogEntry>) -> MatchFile {
        MatchFile {
            id: None,
            team_a_name: a.to_string(),
            team_b_name: b.to_string(),
            date: "2026-09-26".to_string(),
            log,
        }
    }

    fn team<'a>(stats: &'a CollectionStats, name: &str) -> &'a CollectionTeam {
        stats
            .teams
            .iter()
            .find(|t| t.name.eq_ignore_ascii_case(name))
            .unwrap()
    }

    fn player<'a>(team: &'a CollectionTeam, name: &str) -> &'a CollectionPlayer {
        team.players
            .iter()
            .find(|p| p.stats.player == name)
            .unwrap_or_else(|| panic!("no player {name} in {}", team.name))
    }

    #[test]
    fn sums_across_a_b_slots_and_capitalization() {
        let matches = [
            game(
                "Hornets",
                "Riverside",
                vec![
                    sub(Team::A, CourtPosition::GS, "Alice", Some(0)),
                    goal(Team::A, GoalPosition::GS, Some(1)),
                    goal(Team::A, GoalPosition::GS, Some(2)),
                ],
            ),
            game(
                "Oakfield",
                " hornets ",
                vec![
                    sub(Team::B, CourtPosition::GS, "alice ", Some(0)),
                    goal(Team::B, GoalPosition::GS, Some(1)),
                ],
            ),
            game(
                "HORNETS",
                "Oakfield",
                vec![goal(Team::A, GoalPosition::Team, None)],
            ),
        ];
        let stats = derive_collection_stats(&matches, &HashMap::new());

        let hornets = team(&stats, "Hornets");
        assert_eq!(hornets.name, "Hornets");
        assert_eq!(hornets.matches, 3);
        assert_eq!(hornets.players.len(), 1);
        let alice = player(hornets, "Alice");
        assert_eq!((alice.stats.goals, alice.stats.shots), (3, 3));
        assert_eq!(alice.games_played, 2);

        // Sorted by match count, not first appearance.
        let order: Vec<&str> = stats.teams.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(order, ["Hornets", "Oakfield", "Riverside"]);
    }

    fn cpr(team: Team) -> LogEntry {
        LogEntry::Event(Event {
            team,
            action: Action::CentrePassReceive {
                position: CentrePassReceivePosition::GA,
            },
            flagged: false,
            timestamp_ms: None,
        })
    }

    /// Centre passes alternating from A, each converted when its team is
    /// listed in `scorers`; `full_time` appends the four Quarter Breaks.
    fn played(date: &str, a: &str, b: &str, scorers: &[Team], full_time: bool) -> MatchFile {
        let mut log = Vec::new();
        for (i, scorer) in scorers.iter().enumerate() {
            log.push(cpr(if i % 2 == 0 { Team::A } else { Team::B }));
            log.push(goal(*scorer, GoalPosition::GS, None));
        }
        if full_time {
            log.extend((0..4).map(|_| LogEntry::QuarterBreak(QuarterBreak { timestamp_ms: None })));
        }
        MatchFile {
            date: date.to_string(),
            ..game(a, b, log)
        }
    }

    #[test]
    fn the_season_record_counts_full_time_matches_from_either_slot() {
        use Team::{A, B};
        let matches = [
            played("2026-09-01", "Hornets", "Riverside", &[A, A, B], true), // W 2-1
            played("2026-09-08", "Oakfield", "hornets", &[A, B], true),     // D 1-1
            played("2026-09-15", "Lakeside", "Hornets", &[A, A], true),     // L 0-2
            played("2026-09-22", "Hornets", "Riverside", &[A, A, A], false), // not finished
        ];
        let stats = derive_collection_stats(&matches, &HashMap::new());
        let hornets = team(&stats, "Hornets");
        assert_eq!(hornets.matches, 4);
        assert_eq!(
            hornets.record,
            SeasonRecord {
                played: 3,
                won: 1,
                drawn: 1,
                lost: 1,
                goals_for: 3,
                goals_against: 4,
            }
        );
        // Every coded match feeds totals and trends, finished or not.
        assert_eq!(hornets.totals.goals, 6);
        let full_times: Vec<bool> = hornets.series.iter().map(|p| p.full_time).collect();
        assert_eq!(full_times, [true, true, true, false]);
    }

    #[test]
    fn conversions_sum_counts_and_track_the_opposition() {
        use Team::{A, B};
        // Hornets are A: their centre passes are the 1st and 3rd.
        let matches = [
            played("2026-09-01", "Hornets", "Riverside", &[A, B, B], true),
            played("2026-09-08", "Hornets", "Oakfield", &[A], true),
        ];
        let stats = derive_collection_stats(&matches, &HashMap::new());
        let hornets = team(&stats, "Hornets");
        assert_eq!(
            (
                hornets.conversions.centre_pass_goals,
                hornets.conversions.centre_pass_total
            ),
            (2, 3)
        );
        assert_eq!(
            (
                hornets.opponent_conversions.centre_pass_goals,
                hornets.opponent_conversions.centre_pass_total
            ),
            (1, 1)
        );
    }

    #[test]
    fn the_series_is_in_date_order_without_fixtures() {
        use Team::A;
        let matches = [
            played("2026-09-15", "Hornets", "Lakeside", &[A], true),
            played("2026-09-22", "Hornets", "Oakfield", &[], false), // a fixture
            played("2026-09-01", "Hornets", "Riverside", &[A], true),
        ];
        let stats = derive_collection_stats(&matches, &HashMap::new());
        let dates: Vec<&str> = team(&stats, "Hornets")
            .series
            .iter()
            .map(|p| p.date.as_str())
            .collect();
        assert_eq!(dates, ["2026-09-01", "2026-09-15"]);
    }

    #[test]
    fn a_fixture_counts_for_nothing() {
        let matches = [
            game(
                "Hornets",
                "Riverside",
                vec![goal(Team::A, GoalPosition::GS, None)],
            ),
            game("Hornets", "Oakfield", vec![]),
        ];
        let stats = derive_collection_stats(&matches, &HashMap::new());
        assert_eq!(team(&stats, "Hornets").matches, 1);
        assert!(stats.teams.iter().all(|t| t.name != "Oakfield"));
    }

    #[test]
    fn a_chained_merge_folds_three_names_into_one_line() {
        let one = |name: &str| {
            game(
                "Hornets",
                "Riverside",
                vec![
                    sub(Team::A, CourtPosition::GS, name, Some(0)),
                    goal(Team::A, GoalPosition::GS, Some(1)),
                ],
            )
        };
        let matches = [one("Ali"), one("Alice"), one("Alicia")];
        let aliases = HashMap::from([
            ("Ali".to_string(), "Alice".to_string()),
            ("alice".to_string(), "Alicia".to_string()),
        ]);
        let stats = derive_collection_stats(&matches, &aliases);

        let hornets = team(&stats, "Hornets");
        assert_eq!(hornets.players.len(), 1);
        let alicia = player(hornets, "Alicia");
        assert_eq!(alicia.stats.goals, 3);
        assert_eq!(alicia.games_played, 3);
    }

    #[test]
    fn an_alias_cycle_terminates() {
        let matches = [game(
            "Hornets",
            "Riverside",
            vec![sub(Team::A, CourtPosition::GS, "A", Some(0))],
        )];
        let aliases = HashMap::from([
            ("a".to_string(), "b".to_string()),
            ("b".to_string(), "a".to_string()),
        ]);
        let stats = derive_collection_stats(&matches, &aliases);
        assert_eq!(stats.teams[0].players.len(), 1);
    }

    #[test]
    fn playing_time_sums_only_timed_matches_and_stays_available() {
        let timed = game(
            "Hornets",
            "Riverside",
            vec![
                sub(Team::A, CourtPosition::GS, "Alice", Some(0)),
                goal(Team::A, GoalPosition::GS, Some(0)),
                goal(Team::A, GoalPosition::GS, Some(60_000)),
            ],
        );
        let untimed = game(
            "Hornets",
            "Riverside",
            vec![
                sub(Team::A, CourtPosition::GS, "Alice", None),
                goal(Team::A, GoalPosition::GS, None),
            ],
        );
        let stats = derive_collection_stats(&[timed.clone(), untimed, timed], &HashMap::new());

        let hornets = team(&stats, "Hornets");
        assert_eq!(hornets.untimed_matches, 1);
        let alice = player(hornets, "Alice");
        assert_eq!(alice.stats.playing_time_ms, Some(120_000));
        assert_eq!(alice.stats.goals, 5);
        assert_eq!(alice.games_played, 3);
    }
}
