import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  createCollection,
  deleteMatch,
  getMatch,
  listCollections,
  listMatches,
  markSent,
  notSent,
  putCollection,
  putMatch,
  type StoredCollection,
  type StoredMatch,
} from "./storage";
import { exportMatch, parseMatchFile } from "./matchFile";
import type { MatchFile } from "./types/MatchFile";
import { parseShorthand } from "./engine";

// Swedish locale formats as YYYY-MM-DD in local time.
const todayIsoDate = () => new Date().toLocaleDateString("sv-SE");

const fieldStyle = { display: "block", marginBottom: "0.75rem" } as const;
const inputStyle = {
  display: "block",
  width: "100%",
  padding: "0.5rem",
  fontSize: "1rem",
  marginTop: "0.25rem",
  boxSizing: "border-box",
} as const;
const smallButton = {
  padding: "0.35rem 0.6rem",
  fontSize: "0.85rem",
  border: "1px solid #999",
  borderRadius: "6px",
  background: "#fff",
  // Explicit, so no browser default (dark mode, iOS tint) can hide the label.
  color: "#222",
  whiteSpace: "nowrap",
  cursor: "pointer",
} as const;

export default function MatchListScreen() {
  const [matches, setMatches] = useState<StoredMatch[] | null>(null);
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  const [date, setDate] = useState(todayIsoDate);
  const [importError, setImportError] = useState<string | null>(null);
  // An imported file for a match already on this device, awaiting the coder's
  // go-ahead to replace the local copy (ADR-0005).
  const [pendingReplace, setPendingReplace] = useState<{ local: StoredMatch; file: MatchFile } | null>(null);
  const [shorthand, setShorthand] = useState("");
  const [shorthandError, setShorthandError] = useState<string | null>(null);
  // Which match, if any, is mid-rename or awaiting a delete confirmation.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameA, setRenameA] = useState("");
  const [renameB, setRenameB] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [collections, setCollections] = useState<StoredCollection[]>([]);
  const [newCollectionName, setNewCollectionName] = useState("");
  // Which match, if any, has its Collections picker open, and the name typed
  // there for a new collection to add it to.
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [pickerCollectionName, setPickerCollectionName] = useState("");

  const refresh = () =>
    Promise.all([listMatches(), listCollections()]).then(([all, groups]) => {
      setMatches(all);
      setCollections(groups);
    });

  useEffect(() => {
    void refresh();
  }, []);

  async function createMatch(submit: FormEvent) {
    submit.preventDefault();
    const match: StoredMatch = {
      id: crypto.randomUUID(),
      teamAName: teamAName.trim(),
      teamBName: teamBName.trim(),
      date,
      createdAtMs: Date.now(),
      log: [],
    };
    await putMatch(match);
    // Match setup continues with the roster; it can be left blank or partial
    // and completed mid-match, so it never delays the first centre pass.
    window.location.hash = `#/match/${match.id}/roster`;
  }

  async function importFile(change: ChangeEvent<HTMLInputElement>) {
    const file = change.target.files?.[0];
    // Let the same file be picked again after an error (input keeps its value).
    change.target.value = "";
    if (!file) return;
    setImportError(null);
    setPendingReplace(null);
    try {
      // Validate through the core before touching storage, so a bad file
      // leaves no partial match behind.
      const parsed = parseMatchFile(await file.text());
      // A match keeps its id across devices; one already here is replaced
      // only once the coder confirms. Pre-v3 files have no id: always new.
      const local = parsed.id ? await getMatch(parsed.id) : undefined;
      if (local) {
        setPendingReplace({ local, file: parsed });
        return;
      }
      const match: StoredMatch = {
        id: parsed.id ?? crypto.randomUUID(),
        teamAName: parsed.teamAName,
        teamBName: parsed.teamBName,
        date: parsed.date,
        createdAtMs: Date.now(),
        log: parsed.log,
      };
      await putMatch(match);
      // It arrived as a file, so the club already has this version.
      await markSent(match.id);
      await refresh();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  }

  async function confirmReplace() {
    if (!pendingReplace) return;
    const { local, file } = pendingReplace;
    const { teamAName, teamBName, date, log } = file;
    await putMatch({ ...local, teamAName, teamBName, date, log });
    await markSent(local.id);
    setPendingReplace(null);
    await refresh();
  }

  async function importShorthand(submit: FormEvent) {
    submit.preventDefault();
    setShorthandError(null);
    try {
      // Parse through the core before touching storage, so a bad token leaves
      // no partial match behind. Team names and date come from the form above;
      // the transcription itself carries neither.
      const log = parseShorthand(shorthand);
      const match: StoredMatch = {
        id: crypto.randomUUID(),
        teamAName: teamAName.trim(),
        teamBName: teamBName.trim(),
        date,
        createdAtMs: Date.now(),
        log,
      };
      await putMatch(match);
      // Imported matches have no timestamps (no Playing Time); the stat views
      // are where an import proves out, so land there.
      window.location.hash = `#/match/${match.id}/stats`;
    } catch (error) {
      setShorthandError(error instanceof Error ? error.message : String(error));
    }
  }

  function startRename(match: StoredMatch) {
    setConfirmDeleteId(null);
    setRenamingId(match.id);
    setRenameA(match.teamAName);
    setRenameB(match.teamBName);
  }

  async function saveRename(match: StoredMatch, submit: FormEvent) {
    submit.preventDefault();
    await putMatch({ ...match, teamAName: renameA.trim(), teamBName: renameB.trim() });
    setRenamingId(null);
    await refresh();
  }

  async function toggleInCollection(collection: StoredCollection, matchId: string) {
    const matchIds = collection.matchIds.includes(matchId)
      ? collection.matchIds.filter((id) => id !== matchId)
      : [...collection.matchIds, matchId];
    await putCollection({ ...collection, matchIds });
    await refresh();
  }

  async function addCollection(submit: FormEvent) {
    submit.preventDefault();
    await createCollection(newCollectionName);
    setNewCollectionName("");
    await refresh();
  }

  async function addCollectionWithMatch(submit: FormEvent, matchId: string) {
    submit.preventDefault();
    const collection = await createCollection(pickerCollectionName);
    await putCollection({ ...collection, matchIds: [matchId] });
    setPickerCollectionName("");
    await refresh();
  }

  async function confirmDelete(id: string) {
    await deleteMatch(id);
    setConfirmDeleteId(null);
    await refresh();
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: "28rem", margin: "0 auto" }}>
      <h1>CentrePass</h1>

      <details data-testid="how-to" style={{ marginBottom: "1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>How to use this app</summary>
        <ol style={{ paddingLeft: "1.25rem", lineHeight: 1.5 }}>
          <li>Create a match below, then enter your roster (a name against each position).</li>
          <li>
            To record something, tap the <strong>position</strong> (or TEAM), then the{" "}
            <strong>action</strong>. That's it — the event is saved.
          </li>
          <li>
            Missed shot or incomplete feed? Tap <strong>Failed ✕</strong> straight after. Want to
            review an event later? Tap <strong>Flag ⚑</strong>. Both apply to the last event;
            tap again to undo.
          </li>
          <li>
            <strong>Undo</strong> removes the last event. <strong>End Q1</strong>… marks each
            quarter; <strong>Roster / Sub</strong> records substitutions.
          </li>
          <li>
            <strong>Stats</strong> shows scores and per-player numbers, and makes a summary image
            to share.
          </li>
        </ol>
        <p style={{ fontSize: "0.9rem", color: "#555" }}>
          Your matches are stored in this browser on this device only — Chrome, Firefox, and the
          home-screen app each keep their own. Use <strong>Export</strong> and{" "}
          <strong>Import</strong> to move or back up a match.
        </p>
      </details>

      <h2>New match</h2>
      <form onSubmit={createMatch}>
        <label style={fieldStyle}>
          Your team
          <input
            style={inputStyle}
            value={teamAName}
            onChange={(change) => setTeamAName(change.target.value)}
            required
          />
        </label>
        <label style={fieldStyle}>
          Opposition
          <input
            style={inputStyle}
            value={teamBName}
            onChange={(change) => setTeamBName(change.target.value)}
            required
          />
        </label>
        <label style={fieldStyle}>
          Date
          <input
            style={inputStyle}
            type="date"
            value={date}
            onChange={(change) => setDate(change.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          style={{ padding: "0.75rem 1.5rem", fontSize: "1rem", marginTop: "0.25rem" }}
        >
          Create match
        </button>
      </form>

      <h2>Collections</h2>
      <p style={{ margin: "0 0 0.5rem", color: "#666", fontSize: "0.85rem" }}>
        Group matches — a season, a tournament — for per-player totals across them.
      </p>
      {collections.length > 0 && (
        <ul data-testid="collection-list" style={{ paddingLeft: "1.25rem" }}>
          {collections.map((collection) => (
            <li key={collection.id} style={{ marginBottom: "0.4rem" }}>
              <a href={`#/collection/${collection.id}`}>{collection.name}</a>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(submit) => void addCollection(submit)}
        style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}
      >
        <input
          data-testid="new-collection-name"
          aria-label="Collection name"
          placeholder="e.g. Autumn 2026"
          style={{ flex: 1, padding: "0.5rem", fontSize: "1rem" }}
          value={newCollectionName}
          onChange={(change) => setNewCollectionName(change.target.value)}
          required
        />
        <button data-testid="create-collection" type="submit" style={smallButton}>
          Create
        </button>
      </form>

      <h2>Matches</h2>
      <label style={{ ...fieldStyle, fontSize: "0.9rem" }}>
        Import a match file
        <input
          data-testid="import-match"
          style={inputStyle}
          type="file"
          accept="application/json,.json"
          onChange={importFile}
        />
      </label>
      {importError && (
        <p data-testid="import-error" role="alert" style={{ color: "#a11", fontSize: "0.9rem" }}>
          {importError}
        </p>
      )}
      {pendingReplace && (
        <div data-testid="confirm-replace" role="alert" style={{ marginBottom: "0.75rem", fontSize: "0.9rem" }}>
          <p style={{ margin: "0 0 0.5rem" }}>
            You already have {pendingReplace.local.teamAName} vs {pendingReplace.local.teamBName} —{" "}
            {pendingReplace.local.date}. Replace your copy with the one in this file?
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              style={{ ...smallButton, borderColor: "#a11", color: "#a11" }}
              onClick={() => void confirmReplace()}
            >
              Replace my copy
            </button>
            <button style={smallButton} onClick={() => setPendingReplace(null)}>
              Keep mine
            </button>
          </div>
        </div>
      )}

      <form onSubmit={(submit) => void importShorthand(submit)}>
        <label style={{ ...fieldStyle, fontSize: "0.9rem" }}>
          Import from Shorthand
          <textarea
            data-testid="shorthand-input"
            style={{ ...inputStyle, minHeight: "6rem", fontFamily: "ui-monospace, monospace" }}
            value={shorthand}
            onChange={(change) => setShorthand(change.target.value)}
            placeholder={"a2c 2f 1g\nQT\nb8g"}
            required
          />
        </label>
        <p style={{ margin: "0 0 0.5rem", color: "#666", fontSize: "0.8rem" }}>
          Uses the team names and date above. Imported matches have no timing, so Playing Time is
          unavailable.
        </p>
        <button data-testid="import-shorthand" type="submit" style={smallButton}>
          Import Shorthand
        </button>
      </form>
      {shorthandError && (
        <p data-testid="shorthand-error" role="alert" style={{ color: "#a11", fontSize: "0.9rem" }}>
          {shorthandError}
        </p>
      )}

      {matches === null ? (
        <p>Loading…</p>
      ) : matches.length === 0 ? (
        <p>No matches yet.</p>
      ) : (
        <ul data-testid="match-list" style={{ listStyle: "none", padding: 0 }}>
          {matches.map((match) => (
            <li
              key={match.id}
              data-testid={`match-item-${match.id}`}
              style={{ marginBottom: "0.75rem", borderBottom: "1px solid #eee", paddingBottom: "0.75rem" }}
            >
              {renamingId === match.id ? (
                <form onSubmit={(submit) => void saveRename(match, submit)}>
                  <input
                    data-testid={`rename-a-${match.id}`}
                    style={inputStyle}
                    value={renameA}
                    onChange={(change) => setRenameA(change.target.value)}
                    aria-label="Your team"
                    required
                  />
                  <input
                    data-testid={`rename-b-${match.id}`}
                    style={inputStyle}
                    value={renameB}
                    onChange={(change) => setRenameB(change.target.value)}
                    aria-label="Opposition"
                    required
                  />
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                    <button type="submit" data-testid={`save-rename-${match.id}`} style={smallButton}>
                      Save
                    </button>
                    <button type="button" style={smallButton} onClick={() => setRenamingId(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <a href={`#/match/${match.id}`} style={{ fontSize: "1.1rem" }}>
                    {match.teamAName} vs {match.teamBName} — {match.date}
                  </a>
                  {notSent(match) && (
                    <span
                      data-testid={`not-sent-${match.id}`}
                      style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#a60", fontWeight: 600 }}
                    >
                      Not sent
                    </span>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.4rem" }}>
                    <button
                      data-testid={`export-${match.id}`}
                      style={smallButton}
                      onClick={() => void exportMatch(match).then(refresh)}
                    >
                      Export
                    </button>
                    <button data-testid={`rename-${match.id}`} style={smallButton} onClick={() => startRename(match)}>
                      Rename
                    </button>
                    <button
                      data-testid={`collections-${match.id}`}
                      style={smallButton}
                      onClick={() => setCollectingId(collectingId === match.id ? null : match.id)}
                    >
                      Collections
                    </button>
                    {confirmDeleteId === match.id ? (
                      <>
                        <button
                          data-testid={`confirm-delete-${match.id}`}
                          style={{ ...smallButton, borderColor: "#a11", color: "#a11" }}
                          onClick={() => void confirmDelete(match.id)}
                        >
                          Confirm delete
                        </button>
                        <button style={smallButton} onClick={() => setConfirmDeleteId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        data-testid={`delete-${match.id}`}
                        style={smallButton}
                        onClick={() => {
                          setRenamingId(null);
                          setConfirmDeleteId(match.id);
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {collectingId === match.id && (
                    <div data-testid={`collection-picker-${match.id}`} style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
                      {collections.map((collection) => (
                        <label key={collection.id} style={{ display: "block", padding: "0.2rem 0" }}>
                          <input
                            type="checkbox"
                            data-testid={`in-collection-${collection.id}-${match.id}`}
                            checked={collection.matchIds.includes(match.id)}
                            onChange={() => void toggleInCollection(collection, match.id)}
                          />{" "}
                          {collection.name}
                        </label>
                      ))}
                      <form
                        onSubmit={(submit) => void addCollectionWithMatch(submit, match.id)}
                        style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}
                      >
                        <input
                          aria-label="New collection"
                          placeholder="New collection"
                          style={{ flex: 1, padding: "0.35rem" }}
                          value={pickerCollectionName}
                          onChange={(change) => setPickerCollectionName(change.target.value)}
                          required
                        />
                        <button type="submit" style={smallButton}>
                          Add
                        </button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
