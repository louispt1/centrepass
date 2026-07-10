// Typed facade over the wasm-bindgen module. The parameter and result types
// are generated from the netball-core Rust types (`npm run build:types`), so
// the boundary cannot drift; the casts here are the one place the untyped
// wasm-bindgen signatures meet them.
import { action_taxonomy, derive_score, engine_description } from "./wasm/netball";
import type { ActionKindInfo } from "./types/ActionKindInfo";
import type { Event } from "./types/Event";
import type { Score } from "./types/Score";

export function engineDescription(): string {
  return engine_description();
}

/** Derive the score from an event log, in netball-core across the WASM boundary. */
export function deriveScore(events: Event[]): Score {
  return derive_score(events) as Score;
}

/**
 * The action taxonomy as data from netball-core: legal positions per action,
 * Failed applicability, and sub-types. The live screen derives its buttons
 * from this, so the UI can never offer a combination the core would reject.
 */
export function actionTaxonomy(): ActionKindInfo[] {
  return action_taxonomy() as ActionKindInfo[];
}
