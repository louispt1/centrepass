//! Cross-match statistics for a Collection (`CONTEXT.md`): each member match
//! is replayed through [`derive_stats`] unchanged, then the per-match player
//! lines are summed.
//!
//! Identity across matches is by name only. Teams bucket by trimmed,
//! case-insensitive name, whichever A/B slot they were coded in. Players
//! bucket the same way, then fold through the Collection's Player Aliases,
//! transitively. Only counts are summed — rates are left to the caller to
//! divide once, never averaged as percentages.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::match_file::MatchFile;
use crate::stats::{derive_stats, PlayerStats};

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
    total.gain_deflections += line.gain_deflections;
    total.gain_pick_ups += line.gain_pick_ups;
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
        let report = derive_stats(&match_file.log);
        let names = [&match_file.team_a_name, &match_file.team_b_name];
        for (team_stats, name) in report.teams.iter().zip(names) {
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
                        },
                        last_match: usize::MAX,
                        players: Vec::new(),
                    });
                    teams.len() - 1
                }
            };
            let acc = &mut teams[position];
            if acc.last_match != match_index {
                acc.last_match = match_index;
                acc.team.matches += 1;
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
    // Stable: ties keep first-appearance order.
    teams.sort_by_key(|team| std::cmp::Reverse(team.matches));
    CollectionStats { teams }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{Action, CourtPosition, Event, GoalPosition, LogEntry, Substitution, Team};

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
        assert_eq!(alice.stats.goals, 3);
        assert_eq!(alice.games_played, 3);
    }
}
