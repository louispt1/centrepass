// The Match File: export a match to a portable JSON document and import one
// back. (De)serialization and versioning live in netball-core (ADR-0003); this
// module is the thin TypeScript facade over that boundary plus the browser
// plumbing (share sheet or file download, file reading) the core cannot own.
import {
  parse_collection_file,
  parse_match_file,
  serialize_collection_file,
  serialize_match_file,
} from "./wasm/netball";
import { wasmCall } from "./engine";
import type { CollectionFile } from "./types/CollectionFile";
import type { MatchFile } from "./types/MatchFile";
import {
  getCollection,
  getMatch,
  markSent,
  putCollection,
  putMatch,
  type StoredCollection,
  type StoredMatch,
} from "./storage";

/**
 * Parse a Match File JSON string, or throw an `Error` carrying the core's
 * clear, human-readable message. An unrecognised version or malformed content
 * yields no value, so the caller never acts on a partial import.
 */
export function parseMatchFile(json: string): MatchFile {
  return wasmCall(
    () => parse_match_file(json) as MatchFile,
    "This file could not be read as a CentrePass match file.",
  );
}

/** Parse a Collection File JSON string, or throw the core's message. Any
 * unreadable member match fails the whole file. */
export function parseCollectionFile(json: string): CollectionFile {
  return wasmCall(
    () => parse_collection_file(json) as CollectionFile,
    "This file could not be read as a CentrePass collection file.",
  );
}

/** Whether JSON text is a Collection File (it has members) rather than a Match File. */
export function isCollectionFile(json: string): boolean {
  try {
    return Array.isArray(JSON.parse(json)?.matches);
  } catch {
    return false;
  }
}

/** `name` made safe to use as a file name. */
export function safeName(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** A filesystem-safe, human-readable base name for a match's exported files. */
export function matchBaseName(match: StoredMatch): string {
  return safeName(`${match.teamAName} vs ${match.teamBName} ${match.date}`);
}

/**
 * Hand files to the native share sheet when the platform can share them (a
 * phone courtside), otherwise fall back to downloading each. Resolves false
 * only when the coder cancelled the share sheet.
 */
export async function shareOrDownload(files: File[], title: string): Promise<boolean> {
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title });
      return true;
    } catch (error) {
      // A user cancelling the share sheet is not a failure; anything else
      // falls through to a download so the file is never simply lost.
      if (error instanceof DOMException && error.name === "AbortError") return false;
    }
  }

  for (const file of files) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  return true;
}

const matchFileData = ({ id, teamAName, teamBName, date, log }: StoredMatch): MatchFile => ({
  id,
  teamAName,
  teamBName,
  date,
  log,
});

/** A match as its versioned Match File JSON (core owns the schema). */
function matchFileOf(match: StoredMatch): File {
  const json = serialize_match_file(matchFileData(match));
  return new File([json], `${matchBaseName(match)}.centrepass.json`, { type: "application/json" });
}

/** Export a match as its Match File, marking it sent unless the coder cancelled. */
export async function exportMatch(match: StoredMatch): Promise<void> {
  const file = matchFileOf(match);
  if (await shareOrDownload([file], file.name)) await markSent(match.id);
}

/** Export a Collection as one Collection File (ADR-0008), marking its
 * members sent unless the coder cancelled. */
export async function exportCollection(collection: StoredCollection, members: StoredMatch[]): Promise<void> {
  const json = serialize_collection_file({
    id: collection.id,
    name: collection.name,
    playerAliases: collection.playerAliases,
    matches: members.map(matchFileData),
  } satisfies CollectionFile);
  const file = new File([json], `${safeName(collection.name)}.centrepass-collection.json`, {
    type: "application/json",
  });
  if (await shareOrDownload([file], collection.name)) {
    for (const match of members) await markSent(match.id);
  }
}

/** What importing a Match File does to this device's copy (ADR-0007): only a
 * coded file over a coded copy needs the coder's say. */
export type ImportOutcome = "added" | "filled" | "updated" | "kept" | "ask";

export function importOutcome(local: StoredMatch | undefined, file: MatchFile): ImportOutcome {
  if (!local) return "added";
  if (local.log.length === 0) return file.log.length > 0 ? "filled" : "updated";
  return file.log.length > 0 ? "ask" : "kept";
}

/** Replace the local copy with an imported file's match. It arrived as a
 * file, so the club already has this version: it counts as sent. */
export async function replaceWithImport(local: StoredMatch, file: MatchFile): Promise<void> {
  const { teamAName, teamBName, date, log } = file;
  await putMatch({ ...local, teamAName, teamBName, date, log });
  await markSent(local.id);
}

/** Store an imported match per its outcome. "ask" and "kept" store nothing;
 * for "ask" the caller confirms, then calls `replaceWithImport` with `local`. */
export async function importMatch(
  file: MatchFile,
): Promise<{ id: string; outcome: ImportOutcome; local?: StoredMatch }> {
  // Pre-v3 files have no id: always a new match.
  const local = file.id ? await getMatch(file.id) : undefined;
  const outcome = importOutcome(local, file);
  const id = local?.id ?? file.id ?? crypto.randomUUID();
  if (outcome === "added") {
    const { teamAName, teamBName, date, log } = file;
    await putMatch({ id, teamAName, teamBName, date, log, createdAtMs: Date.now() });
    await markSent(id);
  } else if (outcome === "filled" || outcome === "updated") {
    await replaceWithImport(local!, file);
  }
  return { id, outcome, local };
}

/** Merge an imported Collection into this device's copy (ADR-0008):
 * membership only grows, the file's name wins, and its aliases win on a
 * conflicting key. `matchIds` are the file's members as stored here. */
export async function mergeCollection(file: CollectionFile, matchIds: string[]): Promise<void> {
  const local = await getCollection(file.id);
  await putCollection({
    id: file.id,
    name: file.name,
    matchIds: [...new Set([...(local?.matchIds ?? []), ...matchIds])],
    playerAliases: { ...local?.playerAliases, ...file.playerAliases },
    createdAtMs: local?.createdAtMs ?? Date.now(),
  });
}
