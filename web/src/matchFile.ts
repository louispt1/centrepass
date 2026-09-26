// The Match File: export a match to a portable JSON document and import one
// back. (De)serialization and versioning live in netball-core (ADR-0003); this
// module is the thin TypeScript facade over that boundary plus the browser
// plumbing (share sheet or file download, file reading) the core cannot own.
import { parse_match_file, serialize_match_file } from "./wasm/netball";
import { wasmCall } from "./engine";
import type { MatchFile } from "./types/MatchFile";
import type { StoredMatch } from "./storage";

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

/** A filesystem-safe, human-readable base name for a match's exported files. */
export function matchBaseName(match: StoredMatch): string {
  return `${match.teamAName} vs ${match.teamBName} ${match.date}`
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Hand a file to the native share sheet when the platform can share files (a
 * phone courtside), otherwise fall back to a download.
 */
export async function shareOrDownload(file: File, title: string): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (error) {
      // A user cancelling the share sheet is not a failure; anything else
      // falls through to a download so the file is never simply lost.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Export a match as its versioned Match File JSON (core owns the schema). */
export async function exportMatch(match: StoredMatch): Promise<void> {
  const { teamAName, teamBName, date, log } = match;
  const json = serialize_match_file({ teamAName, teamBName, date, log } satisfies MatchFile);
  const fileName = `${matchBaseName(match)}.centrepass.json`;
  await shareOrDownload(new File([json], fileName, { type: "application/json" }), fileName);
}
