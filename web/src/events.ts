// Helpers for constructing and displaying events on the TypeScript side.
// Legality (which positions may do which action) is core-owned data — see
// actionTaxonomy() in engine.ts — and the live screen only enables legal
// combinations; the core re-validates whenever events cross the boundary.
import type { Action } from "./types/Action";
import type { ActionKind } from "./types/ActionKind";
import type { CentrePassReceivePosition } from "./types/CentrePassReceivePosition";
import type { Event } from "./types/Event";
import type { FeedPosition } from "./types/FeedPosition";
import type { GainSubType } from "./types/GainSubType";
import type { GoalPosition } from "./types/GoalPosition";
import type { Position } from "./types/Position";
import type { ReboundPosition } from "./types/ReboundPosition";

/**
 * Build an Action for a taxonomy-driven tap. The casts narrow Position to
 * each variant's subset type; they are safe because callers only pass
 * combinations the taxonomy lists as legal.
 */
export function buildAction(
  kind: ActionKind,
  position: Position,
  failed: boolean,
  subType: GainSubType | null = null,
): Action {
  switch (kind) {
    case "CentrePassReceive":
      return { type: "CentrePassReceive", position: position as CentrePassReceivePosition, failed };
    case "Feed":
      return { type: "Feed", position: position as FeedPosition, failed };
    case "Goal":
      return { type: "Goal", position: position as GoalPosition, failed };
    case "Gain":
      return { type: "Gain", position, subType };
    case "UnforcedTurnover":
      return { type: "UnforcedTurnover", position };
    case "Infringement":
      return { type: "Infringement", position };
    case "Rebound":
      return { type: "Rebound", position: position as ReboundPosition };
  }
}

/** Button labels for the live screen. */
export const ACTION_LABELS: Record<ActionKind, string> = {
  CentrePassReceive: "CP Receive",
  Feed: "Feed",
  Goal: "Goal / Shot",
  Gain: "Gain",
  UnforcedTurnover: "Turnover",
  Infringement: "Infringe",
  Rebound: "Rebound",
};

/** Compact labels for the last-events strip. */
const STRIP_LABELS: Record<ActionKind, string> = {
  CentrePassReceive: "CPR",
  Feed: "Feed",
  Goal: "Goal",
  Gain: "Gain",
  UnforcedTurnover: "TO",
  Infringement: "Inf",
  Rebound: "Reb",
};

export const SUB_TYPE_LABELS: Record<GainSubType, string> = {
  Interception: "Intercept",
  Deflection: "Deflect",
  PickUp: "Pick-up",
};

/** One-line rendering of an event for the spot-check strip, e.g. "WD Intercept" or "GA Goal ✕ ⚑". */
export function formatEvent(event: Event): string {
  const action = event.action;
  const label =
    action.type === "Gain" && action.subType
      ? SUB_TYPE_LABELS[action.subType]
      : STRIP_LABELS[action.type];
  const parts = [`${action.position} ${label}`];
  if ("failed" in action && action.failed) parts.push("✕");
  if (event.flagged) parts.push("⚑");
  if (event.team === "B") parts.unshift("Opp");
  return parts.join(" ");
}
