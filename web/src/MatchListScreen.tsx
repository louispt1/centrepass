import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  createCollection,
  deleteMatch,
  listCollections,
  listMatches,
  notSent,
  putCollection,
  putMatch,
  type StoredCollection,
  type StoredMatch,
} from "./storage";
import {
  exportMatch,
  importMatch,
  isCollectionFile,
  mergeCollection,
  parseCollectionFile,
  parseMatchFile,
  replaceWithImport,
  type ImportOutcome,
} from "./matchFile";
import type { MatchFile } from "./types/MatchFile";
import { deriveStats, parseFixturesCsv, parseShorthand } from "./engine";

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

/** "42 events, 12–9, full time": enough to tell two coded copies apart. */
function codedSummary(log: StoredMatch["log"]): string {
  const events = log.filter((entry) => entry.kind === "Event").length;
  const { score, fullTime } = deriveStats(log);
  return `${events} events, ${score.teamA}–${score.teamB}, ${fullTime ? "full time" : "not finished"}`;
}

export default function MatchListScreen() {
  const [matches, setMatches] = useState<StoredMatch[] | null>(null);
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  const [date, setDate] = useState(todayIsoDate);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  // Imported files whose match is coded both here and in the file, each
  // awaiting the coder's choice (ADR-0007), first shown first.
  const [pendingReplaces, setPendingReplaces] = useState<{ local: StoredMatch; file: MatchFile }[]>([]);
  const pendingReplace = pendingReplaces[0];
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
  // A parsed fixture CSV awaiting the coder's choice of Collection: an
  // existing one's id, or "" for a new one named `newName`.
  const [fixtures, setFixtures] = useState<{ list: MatchFile[]; target: string; newName: string } | null>(null);
  const [fixturesMessage, setFixturesMessage] = useState<{ text: string; error: boolean } | null>(null);

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

  async function importFiles(change: ChangeEvent<HTMLInputElement>) {
    const files = [...(change.target.files ?? [])];
    // Let the same file be picked again after an error (input keeps its value).
    change.target.value = "";
    if (files.length === 0) return;
    setImportError(null);
    setImportSummary(null);
    const counts: Record<ImportOutcome, number> = { added: 0, filled: 0, updated: 0, kept: 0, ask: 0 };
    const errors: string[] = [];
    const asks: { local: StoredMatch; file: MatchFile }[] = [];
    const collectionNames: string[] = [];
    async function tally(parsed: MatchFile): Promise<string> {
      const { id, outcome, local } = await importMatch(parsed);
      counts[outcome] += 1;
      if (outcome === "ask") asks.push({ local: local!, file: parsed });
      return id;
    }
    for (const file of files) {
      try {
        // Validated through the core before touching storage, so a bad file
        // leaves no partial match behind.
        const text = await file.text();
        if (isCollectionFile(text)) {
          const collection = parseCollectionFile(text);
          const ids: string[] = [];
          for (const match of collection.matches) ids.push(await tally(match));
          await mergeCollection(collection, ids);
          collectionNames.push(collection.name);
        } else {
          await tally(parseMatchFile(text));
        }
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (errors.length > 0) setImportError(errors.join("\n"));
    const summary = [
      counts.added && `Added ${counts.added}`,
      counts.filled && `Filled ${counts.filled}`,
      counts.updated && `Updated ${counts.updated}`,
      counts.kept && `Kept your coded copy of ${counts.kept}`,
      ...collectionNames.map((name) => `Collection ${name}`),
    ].filter(Boolean);
    if (summary.length > 0) setImportSummary(summary.join(" · "));
    setPendingReplaces(asks);
    await refresh();
  }

  async function resolveReplace(replace: boolean) {
    if (!pendingReplace) return;
    if (replace) await replaceWithImport(pendingReplace.local, pendingReplace.file);
    setPendingReplaces(pendingReplaces.slice(1));
    await refresh();
  }

  async function readFixtures(change: ChangeEvent<HTMLInputElement>) {
    const file = change.target.files?.[0];
    change.target.value = "";
    if (!file) return;
    setFixturesMessage(null);
    try {
      const list = parseFixturesCsv(await file.text());
      setFixtures({ list, target: collections[0]?.id ?? "", newName: file.name.replace(/\.[^.]*$/, "") });
    } catch (error) {
      setFixtures(null);
      setFixturesMessage({ text: error instanceof Error ? error.message : String(error), error: true });
    }
  }

  async function importFixtures(submit: FormEvent) {
    submit.preventDefault();
    if (!fixtures) return;
    const target =
      collections.find((collection) => collection.id === fixtures.target) ??
      (await createCollection(fixtures.newName));
    // A fixture already in the Collection (same date and teams) is skipped,
    // so an updated schedule re-imports safely.
    const keyOf = (date: string, a: string, b: string) =>
      [date, a.trim().toLowerCase(), b.trim().toLowerCase()].join("|");
    const seen = new Set(
      (matches ?? [])
        .filter((match) => target.matchIds.includes(match.id))
        .map((match) => keyOf(match.date, match.teamAName, match.teamBName)),
    );
    const added: string[] = [];
    for (const fixture of fixtures.list) {
      const key = keyOf(fixture.date, fixture.teamAName, fixture.teamBName);
      if (seen.has(key)) continue;
      seen.add(key);
      const { teamAName, teamBName, date } = fixture;
      const id = crypto.randomUUID();
      await putMatch({ id, teamAName, teamBName, date, log: [], createdAtMs: Date.now() });
      added.push(id);
    }
    await putCollection({ ...target, matchIds: [...target.matchIds, ...added] });
    const skipped = fixtures.list.length - added.length;
    const noun = added.length === 1 ? "fixture" : "fixtures";
    setFixturesMessage({
      text: `Added ${added.length} ${noun} to ${target.name}${skipped ? ` · Skipped ${skipped} already there` : ""}`,
      error: false,
    });
    setFixtures(null);
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

  // Fixtures (nothing coded yet) soonest first; everything else newest first.
  const upcoming = (matches ?? [])
    .filter((match) => match.log.length === 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAtMs - b.createdAtMs);
  const played = (matches ?? [])
    .filter((match) => match.log.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAtMs - a.createdAtMs);

  const matchItem = (match: StoredMatch) => (
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
            {match.teamAName} vs {match.teamBName} - {match.date}
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
            {match.log.length === 0 && (
              <a
                data-testid={`code-${match.id}`}
                href={`#/match/${match.id}/roster`}
                style={{ ...smallButton, textDecoration: "none", fontWeight: 600 }}
              >
                Code
              </a>
            )}
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
                  style={{ ...smallButton, borderColor: "#ED1C24", color: "#ED1C24" }}
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
  );

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: "28rem", margin: "0 auto" }}>
      <h1>CentrePass</h1>

      <details data-testid="how-to" style={{ marginBottom: "1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>How to use this app</summary>
        <ol style={{ paddingLeft: "1.25rem", lineHeight: 1.5 }}>
          <li>Create a match below, then enter your roster (a name against each position).</li>
          <li>
            To record something, tap the <strong>position</strong> (or TEAM), then the{" "}
            <strong>action</strong>. That's it - the event is saved.
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
          Your matches are stored in this browser on this device only - Chrome, Firefox, and the
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
        Group matches for per-player totals across them.
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
        style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}
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
      <label style={{ ...fieldStyle, fontSize: "0.9rem", marginBottom: "0.25rem" }}>
        Import season fixtures (CSV)
        <input
          data-testid="import-fixtures"
          style={inputStyle}
          type="file"
          accept=".csv,text/csv"
          onChange={(change) => void readFixtures(change)}
        />
      </label>
      <p style={{ margin: "0 0 0.75rem", color: "#666", fontSize: "0.8rem" }}>
        Columns: date (DD/MM/YYYY), team, opposition. Other columns are ignored.
      </p>
      {fixtures && (
        <form
          data-testid="fixtures-target"
          onSubmit={(submit) => void importFixtures(submit)}
          style={{ marginBottom: "0.75rem", fontSize: "0.9rem" }}
        >
          <label style={fieldStyle}>
            Add {fixtures.list.length} fixtures to
            <select
              data-testid="fixtures-collection"
              style={inputStyle}
              value={fixtures.target}
              onChange={(change) => setFixtures({ ...fixtures, target: change.target.value })}
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
              <option value="">New collection…</option>
            </select>
          </label>
          {fixtures.target === "" && (
            <input
              data-testid="fixtures-new-name"
              aria-label="New collection name"
              style={{ ...inputStyle, marginBottom: "0.5rem" }}
              value={fixtures.newName}
              onChange={(change) => setFixtures({ ...fixtures, newName: change.target.value })}
              required
            />
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button data-testid="confirm-fixtures" type="submit" style={smallButton}>
              Import fixtures
            </button>
            <button type="button" style={smallButton} onClick={() => setFixtures(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {fixturesMessage && (
        <p
          data-testid="fixtures-message"
          role={fixturesMessage.error ? "alert" : "status"}
          style={{ fontSize: "0.9rem", color: fixturesMessage.error ? "#ED1C24" : undefined }}
        >
          {fixturesMessage.text}
        </p>
      )}

      <h2>Matches</h2>
      <label style={{ ...fieldStyle, fontSize: "0.9rem" }}>
        Import match or collection files
        <input
          data-testid="import-match"
          style={inputStyle}
          type="file"
          accept="application/json,.json"
          multiple
          onChange={(change) => void importFiles(change)}
        />
      </label>
      {importError && (
        <p data-testid="import-error" role="alert" style={{ color: "#ED1C24", fontSize: "0.9rem", whiteSpace: "pre-line" }}>
          {importError}
        </p>
      )}
      {importSummary && (
        <p data-testid="import-summary" role="status" style={{ fontSize: "0.9rem" }}>
          {importSummary}
        </p>
      )}
      {pendingReplace && (
        <div data-testid="confirm-replace" role="alert" style={{ marginBottom: "0.75rem", fontSize: "0.9rem" }}>
          <p style={{ margin: "0 0 0.5rem" }}>
            You already have {pendingReplace.local.teamAName} vs {pendingReplace.local.teamBName} -{" "}
            {pendingReplace.local.date}, coded both here and in the file:
          </p>
          <ul data-testid="replace-sides" style={{ margin: "0 0 0.5rem", paddingLeft: "1.25rem" }}>
            <li>Yours: {codedSummary(pendingReplace.local.log)}</li>
            <li>File: {codedSummary(pendingReplace.file.log)}</li>
          </ul>
          <p style={{ margin: "0 0 0.5rem" }}>Replace your copy with the one in the file?</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              style={{ ...smallButton, borderColor: "#ED1C24", color: "#ED1C24" }}
              onClick={() => void resolveReplace(true)}
            >
              Replace my copy
            </button>
            <button style={smallButton} onClick={() => void resolveReplace(false)}>
              Keep mine
            </button>
          </div>
        </div>
      )}

      <details style={{ marginBottom: "1rem" }}>
        <summary style={{ cursor: "pointer", fontSize: "0.9rem" }}>Import from Shorthand</summary>
        <form onSubmit={(submit) => void importShorthand(submit)}>
          <label style={{ ...fieldStyle, fontSize: "0.9rem" }}>
            Shorthand
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
          <p data-testid="shorthand-error" role="alert" style={{ color: "#ED1C24", fontSize: "0.9rem" }}>
            {shorthandError}
          </p>
        )}
      </details>

      {matches === null ? (
        <p>Loading…</p>
      ) : matches.length === 0 ? (
        <p>No matches yet.</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <h3>Upcoming</h3>
              <ul data-testid="upcoming-list" style={{ listStyle: "none", padding: 0 }}>
                {upcoming.map(matchItem)}
              </ul>
            </>
          )}
          {played.length > 0 && (
            <>
              <h3>Played</h3>
              <ul data-testid="match-list" style={{ listStyle: "none", padding: 0 }}>
                {played.map(matchItem)}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}
