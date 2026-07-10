import { useEffect, useMemo, useState } from "react";
import type { ActionKind } from "./types/ActionKind";
import type { ActionKindInfo } from "./types/ActionKindInfo";
import type { Event } from "./types/Event";
import type { GainSubType } from "./types/GainSubType";
import type { Position } from "./types/Position";
import { actionTaxonomy, deriveScore } from "./engine";
import { ACTION_LABELS, SUB_TYPE_LABELS, buildAction, formatEvent } from "./events";
import { getMatch, putMatch, type StoredMatch } from "./storage";
import { useScreenWakeLock } from "./wakeLock";

// Layout order of the position grid: attack down to defence, TEAM last.
const POSITION_GRID: Position[] = ["GS", "GA", "WA", "C", "WD", "GD", "GK", "TEAM"];

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
  const score = useMemo(() => (match ? deriveScore(match.events) : null), [match]);

  if (match === undefined) {
    return <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>Loading…</main>;
  }
  if (match === null || score === null) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>
        <p>Match not found.</p>
        <a href="#/">Back to matches</a>
      </main>
    );
  }

  async function replaceEvents(events: Event[]) {
    const updated = { ...match!, events };
    setMatch(updated);
    await putMatch(updated);
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
    void replaceEvents([
      ...match!.events,
      { team: "A", action, flagged, timestampMs: Date.now() },
    ]);
    setFailed(false);
    setFlagged(false);
  }

  function recordOppositionGoal() {
    void replaceEvents([
      ...match!.events,
      {
        team: "B",
        action: { type: "Goal", position: "TEAM", failed: false },
        flagged: false,
        timestampMs: Date.now(),
      },
    ]);
  }

  function undo() {
    void replaceEvents(match!.events.slice(0, -1));
  }

  const lastEvents = match.events.slice(-4);

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
          {match.events.length} event{match.events.length === 1 ? "" : "s"} · {match.date}
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
        <div style={{ fontSize: "1.5rem", color: "#666" }}>–</div>
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
        {lastEvents.length === 0 ? (
          <span style={{ color: "#666" }}>No events yet</span>
        ) : (
          lastEvents.map((event, index) => (
            <span
              key={match.events.length - lastEvents.length + index}
              data-testid="event-strip-item"
              style={{ fontWeight: index === lastEvents.length - 1 ? 700 : 400 }}
            >
              {formatEvent(event)}
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
          disabled={match.events.length === 0}
        >
          Undo
        </button>
      </div>
    </main>
  );
}
