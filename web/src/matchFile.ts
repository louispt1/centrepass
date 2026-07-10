// The Match File: export a match to a portable JSON document and import one
// back. (De)serialization and versioning live in netball-core (ADR-0003); this
// module is the thin TypeScript facade over that boundary plus the browser
// plumbing (share sheet or file download, file reading) the core cannot own.
import { parse_match_file, serialize_match_file } from "./wasm/netball";
import type { MatchFile } from "./types/MatchFile";
import type { StoredMatch } from "./storage";

/** A stored match reduced to its portable metadata-plus-log form. */
export function matchToFile(match: StoredMatch): MatchFile {
  return {
    teamAName: match.teamAName,
    teamBName: match.teamBName,
    date: match.date,
    log: match.log,
  };
}

/** Serialize a match to its versioned Match File JSON (core owns the schema). */
export function serializeMatch(match: StoredMatch): string {
  return serialize_match_file(matchToFile(match));
}

/**
 * Parse a Match File JSON string, or throw an `Error` carrying the core's
 * clear, human-readable message. An unrecognised version or malformed content
 * yields no value, so the caller never acts on a partial import.
 */
export function parseMatchFile(json: string): MatchFile {
  try {
    return parse_match_file(json) as MatchFile;
  } catch (thrown) {
    // wasm-bindgen throws the Rust error as a string; normalise to an Error.
    const message = typeof thrown === "string" ? thrown : (thrown as Error)?.message;
    throw new Error(message || "This file could not be read as a CentrePass match file.");
  }
}

/** A filesystem-safe, human-readable name for a match's exported file. */
export function matchFileName(match: StoredMatch): string {
  const base = `${match.teamAName} vs ${match.teamBName} ${match.date}`
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${base}.centrepass.json`;
}

/**
 * Export a match: hand it to the native share sheet when the platform can
 * share files (a phone courtside), otherwise fall back to a file download.
 * Either way the bytes are exactly what {@link serializeMatch} produced.
 */
export async function exportMatch(match: StoredMatch): Promise<void> {
  const json = serializeMatch(match);
  const fileName = matchFileName(match);
  const file = new File([json], fileName, { type: "application/json" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch (error) {
      // A user cancelling the share sheet is not a failure; anything else
      // falls through to a download so the export is never simply lost.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
