import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { deleteMatch, listMatches, putMatch, type StoredMatch } from "./storage";
import { exportMatch, parseMatchFile } from "./matchFile";
import { parseShorthand } from "./engine";

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

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
  cursor: "pointer",
} as const;

export default function MatchListScreen({ engineDescription }: { engineDescription: string }) {
  const [matches, setMatches] = useState<StoredMatch[] | null>(null);
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  const [date, setDate] = useState(todayIsoDate);
  const [importError, setImportError] = useState<string | null>(null);
  const [shorthand, setShorthand] = useState("");
  const [shorthandError, setShorthandError] = useState<string | null>(null);
  // Which match, if any, is mid-rename or awaiting a delete confirmation.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameA, setRenameA] = useState("");
  const [renameB, setRenameB] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refresh = () => listMatches().then(setMatches);

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
    try {
      // Validate through the core before touching storage, so a bad file
      // leaves no partial match behind.
      const parsed = parseMatchFile(await file.text());
      const match: StoredMatch = {
        id: crypto.randomUUID(),
        teamAName: parsed.teamAName,
        teamBName: parsed.teamBName,
        date: parsed.date,
        createdAtMs: Date.now(),
        log: parsed.log,
      };
      await putMatch(match);
      await refresh();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
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

  async function confirmDelete(id: string) {
    await deleteMatch(id);
    setConfirmDeleteId(null);
    await refresh();
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: "28rem", margin: "0 auto" }}>
      <h1>CentrePass</h1>

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
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
                    <button
                      data-testid={`export-${match.id}`}
                      style={smallButton}
                      onClick={() => void exportMatch(match)}
                    >
                      Export
                    </button>
                    <button data-testid={`rename-${match.id}`} style={smallButton} onClick={() => startRename(match)}>
                      Rename
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
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <footer style={{ marginTop: "3rem", color: "#666", fontSize: "0.8rem" }}>
        Engine: <span data-testid="engine-description">{engineDescription}</span>
      </footer>
    </main>
  );
}
