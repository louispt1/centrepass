import { useEffect, useMemo, useState } from "react";
import type { ActionKind } from "./types/ActionKind";
import type { ActionKindInfo } from "./types/ActionKindInfo";
import type { GainSubType } from "./types/GainSubType";
import type { LogEntry } from "./types/LogEntry";
import type { Position } from "./types/Position";
import {
  actionTaxonomy,
  deriveAttributions,
  derivePlayingTime,
  deriveQuarterScores,
  deriveScore,
} from "./engine";
import { ACTION_LABELS, SUB_TYPE_LABELS, buildAction, formatEntry } from "./events";
import { getMatch, putMatch, type StoredMatch } from "./storage";
import { useScreenWakeLock } from "./wakeLock";

// Layout order of the position grid: attack down to defence, TEAM last.
const POSITION_GRID: Position[] = ["GS", "GA", "WA", "C", "WD", "GD", "GK", "TEAM"];

// A netball match has four quarters, so the fourth break is full time.
const QUARTERS = 4;

const tapButton = {
  minHeight: "48px",
  padding: "0.5rem",
  fontSize: "1rem",
  fontWeight: 600,
  border: "1px solid #999",
  borderRadius: "8px",
  background: "#fff",
} as const;

const selectedButton = {
  background: "#0f4c5c",
  color: "#fff",
  borderColor: "#0f4c5c",
} as const;

const gridStyle = (columns: number) =>
  ({
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: "0.5rem",
    marginBottom: "0.5rem",
  }) as const;

function formatMinutes(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = totalSeconds % 60;
  return `${Math.floor(totalSeconds / 60)}:${String(seconds).padStart(2, "0")}`;
}

export default function LiveScreen({ matchId }: { matchId: string }) {
  // undefined = still loading, null = no such match
  const [match, setMatch] = useState<StoredMatch | null | undefined>(undefined);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [failed, setFailed] = useState(false);
  const [flagged, setFlagged] = useState(false);

  // Keep the phone awake while a match is open for coding.
  useScreenWakeLock(match != null);

  useEffect(() => {
    let cancelled = false;
    void getMatch(matchId).then((loaded) => {
      if (!cancelled) setMatch(loaded ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const taxonomy = useMemo(() => actionTaxonomy(), []);
  const gainInfo = taxonomy.find((info) => info.kind === "Gain")!;
  const derived = useMemo(
    () =>
      match
        ? {
            score: deriveScore(match.log),
            quarterScores: deriveQuarterScores(match.log),
            attributions: deriveAttributions(match.log),
            playingTime: derivePlayingTime(match.log, "A"),
          }
        : null,
    [match],
  );

  if (match === undefined) {
    return <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>Loading…</main>;
  }
  if (match === null || derived === null) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>
        <p>Match not found.</p>
        <a href="#/">Back to matches</a>
      </main>
    );
  }
  const { score, quarterScores, attributions, playingTime } = derived;
  // Quarter breaks recorded so far = quarter segments − 1.
  const quarterBreaks = quarterScores.length - 1;
  const fullTime = quarterBreaks >= QUARTERS;

  async function replaceLog(log: LogEntry[]) {
    const updated = { ...match!, log };
    setMatch(updated);
    await putMatch(updated);
  }

  function append(entry: LogEntry) {
    void replaceLog([...match!.log, entry]);
  }

  /** Whether the given action is currently offerable — legal for the
   * selected position and compatible with the Failed toggle. Mirrors what
   * the core would accept, straight from its taxonomy data. */
  function canRecord(info: ActionKindInfo): boolean {
    return (
      selectedPosition !== null &&
      info.legalPositions.includes(selectedPosition) &&
      (!failed || info.canFail)
    );
  }

  function record(kind: ActionKind, subType: GainSubType | null = null) {
    if (selectedPosition === null) return;
    const action = buildAction(kind, selectedPosition, failed, subType);
    append({ kind: "Event", team: "A", action, flagged, timestampMs: Date.now() });
    setFailed(false);
    setFlagged(false);
  }

  function recordOppositionGoal() {
    append({
      kind: "Event",
      team: "B",
      action: { type: "Goal", position: "TEAM", failed: false },
      flagged: false,
      timestampMs: Date.now(),
    });
  }

  function recordQuarterBreak() {
    append({ kind: "QuarterBreak", timestampMs: Date.now() });
  }

  function undo() {
    void replaceLog(match!.log.slice(0, -1));
  }

  const lastEntries = match.log.slice(-4);
  const lastAttributions = attributions.slice(-4);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "0.75rem",
        maxWidth: "28rem",
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <a href="#/">← Matches</a>
        <span style={{ color: "#666", fontSize: "0.8rem" }}>
          {match.log.length} event{match.log.length === 1 ? "" : "s"} · {match.date}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "0.75rem",
          margin: "0.5rem 0",
        }}
      >
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: "0.9rem" }}>{match.teamAName}</div>
          <div data-testid="score-team-a" style={{ fontSize: "2.25rem", fontWeight: 700 }}>
            {score.teamA}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div data-testid="current-quarter" style={{ fontSize: "1rem", fontWeight: 700 }}>
            {fullTime ? "FT" : `Q${quarterBreaks + 1}`}
          </div>
          <div style={{ fontSize: "1.5rem", color: "#666" }}>–</div>
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: "0.9rem" }}>{match.teamBName}</div>
          <div data-testid="score-team-b" style={{ fontSize: "2.25rem", fontWeight: 700 }}>
            {score.teamB}
          </div>
        </div>
      </div>

      <div
        data-testid="event-strip"
        style={{
          display: "flex",
          gap: "0.75rem",
          overflowX: "auto",
          whiteSpace: "nowrap",
          padding: "0.4rem 0.2rem",
          borderTop: "1px solid #ddd",
          borderBottom: "1px solid #ddd",
          marginBottom: "0.75rem",
          fontSize: "0.85rem",
          minHeight: "1.2rem",
        }}
      >
        {lastEntries.length === 0 ? (
          <span style={{ color: "#666" }}>No events yet</span>
        ) : (
          lastEntries.map((entry, index) => (
            <span
              key={match.log.length - lastEntries.length + index}
              data-testid="event-strip-item"
              style={{ fontWeight: index === lastEntries.length - 1 ? 700 : 400 }}
            >
              {formatEntry(entry, lastAttributions[index])}
            </span>
          ))
        )}
      </div>

      <div style={gridStyle(2)}>
        <button
          data-testid="toggle-failed"
          aria-pressed={failed}
          style={{ ...tapButton, ...(failed ? selectedButton : {}) }}
          onClick={() => setFailed(!failed)}
        >
          Failed ✕
        </button>
        <button
          data-testid="toggle-flagged"
          aria-pressed={flagged}
          style={{ ...tapButton, ...(flagged ? selectedButton : {}) }}
          onClick={() => setFlagged(!flagged)}
        >
          Flag ⚑
        </button>
      </div>

      <div style={gridStyle(4)}>
        {POSITION_GRID.map((position) => (
          <button
            key={position}
            data-testid={`position-${position}`}
            aria-pressed={selectedPosition === position}
            style={{ ...tapButton, ...(selectedPosition === position ? selectedButton : {}) }}
            onClick={() => setSelectedPosition(position)}
          >
            {position}
          </button>
        ))}
      </div>

      <div style={gridStyle(3)}>
        {taxonomy.map((info) => (
          <button
            key={info.kind}
            data-testid={`action-${info.kind}`}
            style={tapButton}
            disabled={!canRecord(info)}
            onClick={() => record(info.kind)}
          >
            {ACTION_LABELS[info.kind]}
          </button>
        ))}
      </div>

      <div style={gridStyle(3)}>
        {gainInfo.subTypes.map((subType) => (
          <button
            key={subType}
            data-testid={`subtype-${subType}`}
            style={tapButton}
            disabled={!canRecord(gainInfo)}
            onClick={() => record("Gain", subType)}
          >
            {SUB_TYPE_LABELS[subType]}
          </button>
        ))}
      </div>

      <div style={{ ...gridStyle(2), marginTop: "0.75rem" }}>
        <button data-testid="goal-opposition" style={tapButton} onClick={recordOppositionGoal}>
          Opposition goal
        </button>
        <button
          data-testid="undo"
          style={tapButton}
          onClick={undo}
          disabled={match.log.length === 0}
        >
          Undo
        </button>
        <button
          data-testid="quarter-break"
          style={tapButton}
          onClick={recordQuarterBreak}
          disabled={fullTime}
        >
          {quarterBreaks >= QUARTERS - 1 ? "Full time" : `End Q${quarterBreaks + 1}`}
        </button>
        <a
          href={`#/match/${matchId}/roster`}
          data-testid="open-roster"
          style={{
            ...tapButton,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            color: "inherit",
            boxSizing: "border-box",
          }}
        >
          Roster / Sub
        </a>
        <a
          href={`#/match/${matchId}/stats`}
          data-testid="open-stats"
          style={{
            ...tapButton,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            color: "inherit",
            boxSizing: "border-box",
          }}
        >
          Stats
        </a>
      </div>

      <details data-testid="match-stats" style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
        <summary style={{ cursor: "pointer" }}>Match stats</summary>
        <table style={{ marginTop: "0.5rem", borderSpacing: "0.75rem 0.15rem" }}>
          <tbody>
            {quarterScores.map((quarter, index) => (
              <tr key={index} data-testid={`quarter-score-${index + 1}`}>
                <td style={{ fontWeight: 600 }}>Q{index + 1}</td>
                <td>
                  {quarter.teamA}–{quarter.teamB}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {playingTime !== null && playingTime.length > 0 && (
          <table style={{ marginTop: "0.5rem", borderSpacing: "0.75rem 0.15rem" }}>
            <tbody>
              {playingTime.map((time) => (
                <tr key={time.player} data-testid={`playing-time-${time.player}`}>
                  <td style={{ fontWeight: 600 }}>{time.player}</td>
                  <td>{formatMinutes(time.milliseconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </main>
  );
}
