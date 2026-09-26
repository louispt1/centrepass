import { useEffect, useMemo, useState, type FormEvent } from "react";
import { deriveCollectionStats } from "./engine";
import { exportCollection } from "./matchFile";
import { PlayerTable } from "./StatsScreen";
import {
  deleteCollection,
  getCollection,
  listMatches,
  putCollection,
  type StoredCollection,
  type StoredMatch,
} from "./storage";

// A Collection's cross-match stats: every member match replayed and summed in
// netball-core, bucketed by team name. Also where its name, member matches,
// and Player Aliases are edited.

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

export default function CollectionScreen({ collectionId }: { collectionId: string }) {
  // undefined = still loading, null = no such collection
  const [collection, setCollection] = useState<StoredCollection | null | undefined>(undefined);
  const [matches, setMatches] = useState<StoredMatch[]>([]);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The player row tapped for "Merge into…", within its team bucket.
  const [merging, setMerging] = useState<{ team: number; player: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getCollection(collectionId), listMatches()]).then(([loaded, all]) => {
      if (cancelled) return;
      setCollection(loaded ?? null);
      setName(loaded?.name ?? "");
      setMatches(all);
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  // Ids of matches deleted since are simply skipped. Oldest first, so players
  // list in order of first appearance across the season.
  const members = useMemo(
    () =>
      collection
        ? matches
            .filter((match) => collection.matchIds.includes(match.id))
            .sort((a, b) => a.date.localeCompare(b.date) || a.createdAtMs - b.createdAtMs)
        : [],
    [collection, matches],
  );
  const stats = useMemo(
    () => (collection ? deriveCollectionStats(members, collection.playerAliases) : null),
    [collection, members],
  );

  if (collection === undefined) {
    return <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>Loading…</main>;
  }
  if (collection === null || stats === null) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>
        <p>Collection not found.</p>
        <a href="#/">Back to matches</a>
      </main>
    );
  }

  async function save(changed: StoredCollection) {
    await putCollection(changed);
    setCollection(changed);
  }

  function toggleMatch(id: string) {
    const matchIds = collection!.matchIds.includes(id)
      ? collection!.matchIds.filter((member) => member !== id)
      : [...collection!.matchIds, id];
    void save({ ...collection!, matchIds });
  }

  function rename(submit: FormEvent) {
    submit.preventDefault();
    void save({ ...collection!, name: name.trim() });
  }

  function merge(from: string, into: string) {
    setMerging(null);
    void save({ ...collection!, playerAliases: { ...collection!.playerAliases, [from]: into } });
  }

  return (
    <main
      style={{ fontFamily: "system-ui, sans-serif", padding: "0.75rem", maxWidth: "40rem", margin: "0 auto" }}
    >
      <a href="#/">← Matches</a>
      <h1 style={{ fontSize: "1.3rem", marginBottom: "0.25rem" }}>{collection.name}</h1>
      <div style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1rem" }}>
        {members.length} {members.length === 1 ? "match" : "matches"}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          data-testid="export-collection"
          style={smallButton}
          disabled={members.length === 0}
          onClick={() => void exportCollection(collection.name, members)}
        >
          Send match files
        </button>
        {confirmDelete ? (
          <>
            <button
              data-testid="confirm-delete-collection"
              style={{ ...smallButton, borderColor: "#a11", color: "#a11" }}
              onClick={() =>
                void deleteCollection(collection.id).then(() => (window.location.hash = "#/"))
              }
            >
              Confirm delete
            </button>
            <button style={smallButton} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button data-testid="delete-collection" style={smallButton} onClick={() => setConfirmDelete(true)}>
            Delete collection
          </button>
        )}
      </div>

      <details style={{ marginBottom: "1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Name and matches</summary>
        <form onSubmit={rename} style={{ display: "flex", gap: "0.5rem", margin: "0.5rem 0" }}>
          <input
            data-testid="collection-name"
            aria-label="Collection name"
            style={{ flex: 1, padding: "0.4rem", fontSize: "1rem" }}
            value={name}
            onChange={(change) => setName(change.target.value)}
            required
          />
          <button type="submit" data-testid="rename-collection" style={smallButton}>
            Rename
          </button>
        </form>
        {matches.length === 0 && <p>No matches yet.</p>}
        {matches.map((match) => (
          <label key={match.id} style={{ display: "block", padding: "0.3rem 0" }}>
            <input
              type="checkbox"
              data-testid={`pick-match-${match.id}`}
              checked={collection.matchIds.includes(match.id)}
              onChange={() => toggleMatch(match.id)}
            />{" "}
            {match.teamAName} vs {match.teamBName} - {match.date}
          </label>
        ))}
      </details>

      {stats.teams.map((team, index) => (
        <details
          key={team.name}
          data-testid={`team-bucket-${index}`}
          open={index === 0}
          style={{ marginBottom: "0.75rem" }}
        >
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>
            {team.name || "(unnamed)"} - {team.matches} {team.matches === 1 ? "match" : "matches"}
          </summary>
          {team.players.length === 0 ? (
            <p style={{ color: "#666", fontSize: "0.85rem" }}>No player stats.</p>
          ) : (
            <PlayerTable
              testId={`collection-table-${index}`}
              caption={team.name}
              players={team.players.map((player) => player.stats)}
              gamesPlayed={team.players.map((player) => player.gamesPlayed)}
              onPlayerClick={(player) => setMerging({ team: index, player })}
              note={
                team.untimedMatches > 0 && team.untimedMatches < team.matches
                  ? `Minutes cover only the ${team.matches - team.untimedMatches} matches with timestamps.`
                  : undefined
              }
            />
          )}
          {merging?.team === index && (
            <div data-testid="merge-panel" style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
              <p style={{ margin: "0 0 0.5rem" }}>
                Merge <strong>{merging.player}</strong> into…
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {team.players
                  .filter((player) => player.stats.player !== merging.player)
                  .map(({ stats: { player } }) => (
                    <button
                      key={player}
                      data-testid={`merge-into-${player}`}
                      style={smallButton}
                      onClick={() => merge(merging.player, player)}
                    >
                      {player}
                    </button>
                  ))}
                <button style={smallButton} onClick={() => setMerging(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </details>
      ))}
    </main>
  );
}
