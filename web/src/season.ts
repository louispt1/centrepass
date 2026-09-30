// Season trends over a Collection team's series (issue 06). The core supplies
// raw counts only; each rate here divides once from counts - summed counts for
// the season value, one match's counts for a point - and is never averaged.
// Shared by the Collection screen (SVG) and the Season Summary Image (canvas).
import type { CollectionTeam } from "./types/CollectionTeam";
import type { SeasonPoint } from "./types/SeasonPoint";

type Counts = Pick<
  SeasonPoint,
  "goalsFor" | "goalsAgainst" | "totals" | "conversions" | "opponentConversions"
>;

export interface Metric {
  key: string;
  label: string;
  /** The metric for these counts, or null when its denominator is zero. */
  value: (counts: Counts) => number | null;
  format: (value: number) => string;
}

const rate = (made: number, total: number) => (total === 0 ? null : made / total);
const percent = (value: number) => `${Math.round(value * 100)}%`;

export const METRICS: Metric[] = [
  {
    key: "goal-difference",
    label: "Goal difference",
    value: (c) => c.goalsFor - c.goalsAgainst,
    // One decimal, for the per-match season average.
    format: (v) => `${v > 0 ? "+" : ""}${Math.round(v * 10) / 10}`,
  },
  {
    key: "shooting",
    label: "Shooting",
    value: (c) => rate(c.totals.goals, c.totals.shots),
    format: percent,
  },
  {
    key: "centre-pass",
    label: "CP → goal",
    value: (c) => rate(c.conversions.centrePassGoals, c.conversions.centrePassTotal),
    format: percent,
  },
  {
    key: "gain",
    label: "Gain → goal",
    value: (c) => rate(c.conversions.gainGoals, c.conversions.gainTotal),
    format: percent,
  },
  {
    key: "opponent-centre-pass",
    label: "Opp CP → goal",
    value: (c) =>
      rate(c.opponentConversions.centrePassGoals, c.opponentConversions.centrePassTotal),
    format: percent,
  },
  {
    key: "turnovers",
    label: "Turnovers / possession",
    value: (c) => rate(c.totals.unforcedTurnovers, c.totals.possessions),
    format: (v) => v.toFixed(2),
  },
];

/** The team's whole-season counts. Goals span every coded match, like the
 * rest (the Season Record's goals count Full Time matches only). */
export function seasonCounts(team: CollectionTeam): Counts {
  const sum = (pick: (point: SeasonPoint) => number) =>
    team.series.reduce((total, point) => total + pick(point), 0);
  return {
    goalsFor: sum((point) => point.goalsFor),
    goalsAgainst: sum((point) => point.goalsAgainst),
    totals: team.totals,
    conversions: team.conversions,
    opponentConversions: team.opponentConversions,
  };
}

/** The season reference line: the rate from summed counts, except goal
 * difference, whose line is the per-match average. */
export function seasonValue(metric: Metric, team: CollectionTeam): number | null {
  const value = metric.value(seasonCounts(team));
  if (value === null || metric.key !== "goal-difference") return value;
  return team.series.length === 0 ? null : value / team.series.length;
}

export interface SparkPoint {
  x: number;
  y: number;
  fullTime: boolean;
}

/**
 * Lay a metric's series out in a `width` × `height` box: one slot per match,
 * null where the match has no value (a gap), y scaled to the values and the
 * reference so the season line always fits.
 */
export function sparkline(
  metric: Metric,
  series: SeasonPoint[],
  reference: number | null,
  width: number,
  height: number,
): { points: (SparkPoint | null)[]; referenceY: number | null } {
  const values = series.map((point) => metric.value(point));
  const known = [...values, reference].filter((v): v is number => v !== null);
  const [min, max] = [Math.min(...known), Math.max(...known)];
  const pad = 3;
  const y = (v: number) =>
    max === min ? height / 2 : pad + ((max - v) / (max - min)) * (height - 2 * pad);
  const step = series.length > 1 ? (width - 2 * pad) / (series.length - 1) : 0;
  return {
    points: values.map((v, i) =>
      v === null
        ? null
        : { x: series.length > 1 ? pad + i * step : width / 2, y: y(v), fullTime: series[i].fullTime },
    ),
    referenceY: reference === null ? null : y(reference),
  };
}
