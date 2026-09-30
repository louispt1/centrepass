import { useEffect, useMemo, useState, type FormEvent } from "react";
import { deriveCollectionStats, deriveStats } from "./engine";
import { METRICS, seasonValue, sparkline, type Metric, type SparkPoint } from "./season";
import type { CollectionTeam } from "./types/CollectionTeam";
import { exportCollection } from "./matchFile";
import { PlayerTable } from "./StatsScreen";
import { shareSeasonImage } from "./summaryImage";
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

/** A metric's per-match trend, with the season value as a dashed line and
 * hollow dots for matches that didn't reach Full Time. */
function Sparkline({ metric, team }: { metric: Metric; team: CollectionTeam }) {
  const [width, height] = [120, 28];
  const { points, referenceY } = sparkline(metric, team.series, seasonValue(metric, team), width, height);
  // A match without a value (zero denominator) breaks the line.
  const segments: SparkPoint[][] = [[]];
  for (const point of points) {
    if (point) segments[segments.length - 1].push(point);
    else segments.push([]);
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {referenceY !== null && (
        <line x1={0} x2={width} y1={referenceY} y2={referenceY} stroke="#bbb" strokeDasharray="3 3" />
      )}
      {segments.map((segment, i) => (
        <polyline
          key={i}
          points={segment.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#263E58"
          strokeWidth={1.5}
        />
      ))}
      {points.map(
        (p, i) =>
          p && (
            <circle
              key={i}
              data-full-time={p.fullTime}
              cx={p.x}
              cy={p.y}
              r={2.5}
              fill={p.fullTime ? "#263E58" : "#fff"}
              stroke="#263E58"
            />
          ),
      )}
    </svg>
  );
}

export default function CollectionScreen({ collectionId }: { collectionId: string }) {
  // undefined = still loading, null = no such collection
  const [collection, setCollection] = useState<StoredCollection | null | undefined>(undefined);
  const [matches, setMatches] = useState<StoredMatch[]>([]);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The player row tapped for "Merge into…", within its team bucket.
  const [merging, setMerging] = useState<{ team: string; player: string } | null>(null);

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

  // Each member's score and Full Time, fixtures (nothing coded) as null.
  const results = useMemo(
    () => members.map((match) => ({ match, report: match.log.length > 0 ? deriveStats(match.log) : null })),
    [members],
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

  // A team in fewer than half the coded matches is a one-off opponent.
  const coded = results.filter(({ report }) => report).length;
  const indexes = stats.teams.map((_, index) => index);
  const main = indexes.filter((index) => stats.teams[index].matches * 2 >= coded);
  const opposition = indexes.filter((index) => stats.teams[index].matches * 2 < coded);

  function teamBucket(index: number) {
    const team = stats!.teams[index];
    const { played, won, drawn, lost, goalsFor, goalsAgainst } = team.record;
    return (
      <details
        key={team.name}
        data-testid={`team-bucket-${index}`}
        open={index === 0}
        style={{ marginBottom: "0.75rem" }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>
          {team.name || "(unnamed)"} - {team.matches} {team.matches === 1 ? "match" : "matches"}
          {played > 0 && (
            <span data-testid={`record-${index}`} style={{ fontWeight: 400, color: "#444" }}>
              {` · P${played} W${won} D${drawn} L${lost} · GF ${goalsFor} GA ${goalsAgainst}`}
            </span>
          )}
        </summary>
        <button
          data-testid={`share-season-${index}`}
          style={{ ...smallButton, marginTop: "0.5rem" }}
          onClick={() => void shareSeasonImage(collection!.name, team)}
        >
          Share season image
        </button>
        <table data-testid={`season-${index}`} style={{ borderCollapse: "collapse", margin: "0.5rem 0", fontSize: "0.85rem" }}>
          <tbody>
            {METRICS.map((metric) => {
              const value = seasonValue(metric, team);
              return (
                <tr key={metric.key}>
                  <td style={{ paddingRight: "0.75rem" }}>{metric.label}</td>
                  <td data-testid={`season-${index}-${metric.key}`} style={{ paddingRight: "0.75rem", textAlign: "right" }}>
                    {value === null ? "–" : metric.format(value)}
                  </td>
                  <td>
                    <Sparkline metric={metric} team={team} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {team.players.length === 0 ? (
          <p style={{ color: "#666", fontSize: "0.85rem" }}>No player stats.</p>
        ) : (
          <PlayerTable
            testId={`collection-table-${index}`}
            caption={team.name}
            players={team.players.map((player) => player.stats)}
            gamesPlayed={team.players.map((player) => player.gamesPlayed)}
            onPlayerClick={(player) => setMerging({ team: team.name, player })}
            note={
              team.untimedMatches > 0 && team.untimedMatches < team.matches
                ? `Minutes cover only the ${team.matches - team.untimedMatches} matches with timestamps.`
                : undefined
            }
          />
        )}
        {merging?.team === team.name && (
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
    );
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
          onClick={() => void exportCollection(collection, members)}
        >
          Send collection file
        </button>
        {confirmDelete ? (
          <>
            <button
              data-testid="confirm-delete-collection"
              style={{ ...smallButton, borderColor: "#ED1C24", color: "#ED1C24" }}
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

      <h2 style={{ fontSize: "1.1rem" }}>Results</h2>
      {results.length === 0 ? (
        <p style={{ color: "#666", fontSize: "0.9rem" }}>No matches yet.</p>
      ) : (
        <ul data-testid="results" style={{ listStyle: "none", padding: 0, margin: "0 0 1rem" }}>
          {results.map(({ match, report }) => (
            <li
              key={match.id}
              data-testid={`result-${match.id}`}
              style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", padding: "0.3rem 0", borderBottom: "1px solid #eee" }}
            >
              <span style={{ color: "#666", fontSize: "0.85rem" }}>{match.date}</span>
              <span style={{ flex: 1 }}>
                {match.teamAName} vs {match.teamBName}
              </span>
              {report ? (
                <>
                  <a href={`#/match/${match.id}/stats`}>
                    {report.score.teamA}–{report.score.teamB}
                  </a>
                  <strong style={{ width: "1.5rem", textAlign: "center" }}>
                    {!report.fullTime
                      ? "…"
                      : report.score.teamA > report.score.teamB
                        ? "W"
                        : report.score.teamA < report.score.teamB
                          ? "L"
                          : "D"}
                  </strong>
                </>
              ) : (
                <>
                  <span style={{ color: "#666", fontSize: "0.85rem" }}>Not coded</span>
                  <a href={`#/match/${match.id}/roster`} style={{ ...smallButton, textDecoration: "none" }}>
                    Code
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {main.map((index) => teamBucket(index))}
      {opposition.length > 0 && (
        <details data-testid="opposition" style={{ marginBottom: "0.75rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>
            Opposition ({opposition.length})
          </summary>
          <div style={{ paddingLeft: "0.5rem" }}>{opposition.map((index) => teamBucket(index))}</div>
        </details>
      )}
    </main>
  );
}
