// Typed facade over the wasm-bindgen module. The parameter and result types
// are generated from the netball-core Rust types (`npm run build:types`), so
// the boundary cannot drift; the casts here are the one place the untyped
// wasm-bindgen signatures meet them.
import {
  action_taxonomy,
  definitions,
  derive_attributions,
  derive_playing_time,
  derive_quarter_scores,
  derive_roster,
  derive_score,
  derive_stats,
  engine_description,
  parse_shorthand,
} from "./wasm/netball";
import type { ActionKindInfo } from "./types/ActionKindInfo";
import type { Descriptor } from "./types/Descriptor";
import type { LogEntry } from "./types/LogEntry";
import type { PlayingTime } from "./types/PlayingTime";
import type { Roster } from "./types/Roster";
import type { Score } from "./types/Score";
import type { StatsReport } from "./types/StatsReport";
import type { Team } from "./types/Team";

export function engineDescription(): string {
  return engine_description();
}

/** Derive the match score from a log, in netball-core across the WASM boundary. */
export function deriveScore(log: LogEntry[]): Score {
  return derive_score(log) as Score;
}

/**
 * The score of each quarter separately, in match order. The current quarter
 * of a live match is the length of this array.
 */
export function deriveQuarterScores(log: LogEntry[]): Score[] {
  return derive_quarter_scores(log) as Score[];
}

/** One team's roster after replaying the whole log. */
export function deriveRoster(log: LogEntry[], team: Team): Roster {
  return derive_roster(log, team) as Roster;
}

/**
 * The player each log entry attributes to (parallel to the log): the
 * occupant of the event's position at that point, or null for markers,
 * TEAM events, and positions no substitution has filled yet.
 */
export function deriveAttributions(log: LogEntry[]): (string | null)[] {
  return (derive_attributions(log) as (string | null | undefined)[]).map(
    (player) => player ?? null,
  );
}

/**
 * One team's per-player time on court, or null when the log lacks the
 * timestamps to derive it (never zeroed or guessed).
 */
export function derivePlayingTime(log: LogEntry[], team: Team): PlayingTime[] | null {
  return (derive_playing_time(log, team) as PlayingTime[] | null | undefined) ?? null;
}

/**
 * The full post-match statistics report from netball-core: per-player lines
 * and team-level conversion rates for both teams, plus the score and its
 * quarter breakdown. Everything is re-derived from the log on every call.
 */
export function deriveStats(log: LogEntry[]): StatsReport {
  return derive_stats(log) as StatsReport;
}

/**
 * Parse Shorthand text into a match log in netball-core, or throw an `Error`
 * carrying the core's located, human-readable message ("Line 2, column 4: …").
 * A single malformed token fails the whole parse and yields no value, so the
 * caller never imports a partial match. The entries carry no timestamps.
 */
export function parseShorthand(input: string): LogEntry[] {
  try {
    return parse_shorthand(input) as LogEntry[];
  } catch (thrown) {
    // wasm-bindgen throws the Rust error as a string; normalise to an Error.
    const message = typeof thrown === "string" ? thrown : (thrown as Error)?.message;
    throw new Error(message || "This Shorthand could not be parsed.");
  }
}

/**
 * The action taxonomy as data from netball-core: legal positions per action,
 * Failed applicability, and sub-types. The live screen derives its buttons
 * from this, so the UI can never offer a combination the core would reject.
 */
export function actionTaxonomy(): ActionKindInfo[] {
  return action_taxonomy() as ActionKindInfo[];
}

/** The action and modifier reference from netball-core. */
export interface Definitions {
  actions: Descriptor[];
  modifiers: Descriptor[];
}

/**
 * The NVAC action and modifier definitions as data from netball-core: the same
 * descriptors that generate DEFINITIONS.md, so the in-app quick reference is
 * never a hand-maintained copy (issue 10).
 */
export function definitionsReference(): Definitions {
  const [actions, modifiers] = definitions() as [Descriptor[], Descriptor[]];
  return { actions, modifiers };
}
