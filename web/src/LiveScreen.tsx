import { useEffect, useMemo, useState } from "react";
import type { ActionKind } from "./types/ActionKind";
import type { ActionKindInfo } from "./types/ActionKindInfo";
import type { GainSubType } from "./types/GainSubType";
import type { LogEntry } from "./types/LogEntry";
import type { Position } from "./types/Position";
import type { Team } from "./types/Team";
import type { TurnoverSubType } from "./types/TurnoverSubType";
import {
  actionTaxonomy,
  deriveAttributions,
  derivePlayingTime,
  deriveQuarterScores,
  deriveQuarterSpans,
  deriveTeamInPossession,
  resolveTeam,
} from "./engine";
import {
  ACTION_LABELS,
  SUB_TYPE_LABELS,
  TEAM_COLOURS,
  buildAction,
  formatEntry,
  otherTeam,
} from "./events";
import ReferencePanel from "./ReferencePanel";
import { getMatch, putMatch, type StoredMatch } from "./storage";
import { useScreenWakeLock } from "./wakeLock";

// Layout order of the position grid: attack down to defence, TEAM last.
const POSITION_GRID: Position[] = ["GS", "GA", "WA", "C", "WD", "GD", "GK", "TEAM"];

// A netball match has four quarters, so the fourth break is full time.
const QUARTERS = 4;

// Past this, the Quarter Clock turns amber - a nudge to tap End Qn. The clock
// is wall-clock time, so stoppages push a real quarter past it (ADR-0006).
const QUARTER_MS = 15 * 60_000;

// The action grid, two to a row in the flow of play: the team in possession
// loses the ball on row 3, the team out of possession wins it on row 4 and
// touches it without winning it on row 5. Gain is deliberately absent:
// courtside, the coder always taps a sub-type instead (Pick-up when unsure),
// so no bare Gain button is offered - the core still accepts one bare, e.g.
// from Shorthand (see GainSubType's doc comment).
type ActionTap = {
  kind: ActionKind;
  subType?: GainSubType | TurnoverSubType;
  testId: string;
  label: string;
};
const tap = (kind: ActionKind): ActionTap => ({
  kind,
  testId: `action-${kind}`,
  label: ACTION_LABELS[kind],
});
const gainTap = (subType: GainSubType): ActionTap => ({
  kind: "Gain",
  subType,
  testId: `subtype-${subType}`,
  label: SUB_TYPE_LABELS[subType],
});
const ACTION_GRID: ActionTap[] = [
  tap("CentrePassReceive"),
  tap("Feed"),
  tap("Goal"),
  tap("Rebound"),
  tap("UnforcedTurnover"),
  {
    kind: "UnforcedTurnover",
    subType: "Infringement",
    testId: "action-AttackingInfringement",
    label: "Att. infringe",
  },
  gainTap("Interception"),
  gainTap("PickUp"),
  tap("Deflection"),
  tap("Infringement"),
];

// How long a shot's goal-or-miss question stays open before it stands as a goal.
const SHOT_CONFIRM_MS = 5000;

const tapButton = {
  minHeight: "48px",
  padding: "0.5rem",
  fontSize: "1rem",
  fontWeight: 600,
  border: "1px solid #999",
  borderRadius: "8px",
  background: "#fff",
} as const;

// Neutral grey, so a selected position never reads as a team colour.
const selectedButton = {
  background: "#5A5A5A",
  color: "#fff",
  border: "3px solid #333",
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
  // The quick reference is an overlay, so opening it leaves this screen - and
  // the selected position - mounted and untouched.
  const [showReference, setShowReference] = useState(false);
  // One-shot override of the Team in Possession: applies to the next tap
  // only, then the derivation takes over again (ADR-0004).
  const [overrideTeam, setOverrideTeam] = useState<Team | null>(null);
  // A shot just coded, awaiting goal or miss: it is already in the log as a
  // goal, but the score and possession hold until the question closes.
  const [shotOpen, setShotOpen] = useState(false);
  useEffect(() => {
    if (!shotOpen) return;
    const id = setTimeout(() => setShotOpen(false), SHOT_CONFIRM_MS);
    return () => clearTimeout(id);
  }, [shotOpen]);

  // Keep the phone awake while a match is open for coding.
  useScreenWakeLock(match != null);

  // Re-render every second so the Quarter Clock ticks; it reads Date.now().
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(id);
  }, []);

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
  const actionByKind = (kind: ActionKind) => taxonomy.find((info) => info.kind === kind)!;
  const derived = useMemo(() => {
    if (!match) return null;
    const shownLog = shotOpen ? match.log.slice(0, -1) : match.log;
    return {
            quarterScores: deriveQuarterScores(shownLog),
            quarterSpans: deriveQuarterSpans(match.log),
            attributions: deriveAttributions(match.log),
            playingTime: (["A", "B"] as const).map((team) => ({
              team,
              times: derivePlayingTime(match.log, team),
            })),
            teamInPossession: deriveTeamInPossession(shownLog),
    };
  }, [match, shotOpen]);

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
  const { quarterScores, quarterSpans, attributions, playingTime } = derived;
  const score = quarterScores.reduce((sum, q) => ({
    teamA: sum.teamA + q.teamA,
    teamB: sum.teamB + q.teamB,
  }));
  const inPossession = overrideTeam ?? derived.teamInPossession;
  const teamName = (team: Team) => (team === "A" ? match.teamAName : match.teamBName);
  const teamFor = (kind: ActionKind) =>
    selectedPosition === null || !started
      ? null
      : resolveTeam(inPossession, kind, selectedPosition);
  // Quarter breaks recorded so far = quarter segments − 1.
  const quarterBreaks = quarterScores.length - 1;
  const fullTime = quarterBreaks >= QUARTERS;
  // Coding is locked until the quarter's whistle: its Quarter Start, or any
  // event (a log from before Quarter Start, or a Shorthand import).
  const quarterEntries = match.log.slice(
    match.log.findLastIndex((entry) => entry.kind === "QuarterBreak") + 1,
  );
  const started =
    fullTime || quarterEntries.some((entry) => entry.kind !== "Substitution");

  // Quarter Clock: closed quarters run start to break; the current one to now.
  const now = Date.now();
  const quarterMs = (index: number): number | null => {
    const { startMs, endMs } = quarterSpans[index];
    if (startMs == null) return null;
    if (endMs != null) return Math.max(0, endMs - startMs);
    return index === quarterBreaks && !fullTime ? Math.max(0, now - startMs) : null;
  };
  const quarterLabel = (index: number) => {
    const ms = quarterMs(index);
    return ms == null ? "–" : formatMinutes(ms);
  };
  const currentMs = fullTime ? null : quarterMs(quarterBreaks);
  const lastBreakMs = quarterBreaks > 0 ? quarterSpans[quarterBreaks - 1].endMs : null;
  // A log with entries but no timestamps (a Shorthand import) has no clock.
  const timed = match.log.length === 0 || match.log.some((entry) => entry.timestampMs != null);
  const clock = !timed
    ? `${match.log.length} event${match.log.length === 1 ? "" : "s"} · ${match.date}`
    : fullTime
      ? formatMinutes(quarterSpans.reduce((sum, _, index) => sum + (quarterMs(index) ?? 0), 0))
      : currentMs == null && lastBreakMs != null
        ? `Break ${formatMinutes(Math.max(0, now - lastBreakMs))}`
        : formatMinutes(currentMs ?? 0);
  const overtime = currentMs != null && currentMs > QUARTER_MS;

  async function replaceLog(log: LogEntry[]) {
    const updated = { ...match!, log };
    setMatch(updated);
    await putMatch(updated);
  }

  function append(entry: LogEntry) {
    void replaceLog([...match!.log, entry]);
  }

  /** Whether the given action is legal for the selected position. Mirrors
   * what the core would accept, straight from its taxonomy data. */
  function canRecord(info: ActionKindInfo): boolean {
    return (
      selectedPosition !== null &&
      info.legalPositions.includes(selectedPosition) &&
      teamFor(info.kind) !== null
    );
  }

  function record({ kind, subType }: ActionTap) {
    const team = teamFor(kind);
    if (selectedPosition === null || team === null) return;
    const action = buildAction(kind, selectedPosition, false, subType ?? null);
    append({ kind: "Event", team, action, flagged: false, timestampMs: Date.now() });
    setOverrideTeam(null);
    if (kind === "Goal") setShotOpen(true);
  }

  // Flag and a missed shot modify the last entry, after it is recorded.
  const last = match.log.at(-1);
  const lastEvent = last?.kind === "Event" ? last : null;

  function replaceLast(entry: LogEntry) {
    void replaceLog([...match!.log.slice(0, -1), entry]);
  }

  function missShot() {
    if (lastEvent?.action.type === "Goal") {
      replaceLast({ ...lastEvent, action: { ...lastEvent.action, failed: true } });
    }
    setShotOpen(false);
  }

  function toggleFlagged() {
    if (lastEvent) replaceLast({ ...lastEvent, flagged: !lastEvent.flagged });
  }

  function startQuarter(team: Team) {
    append({ kind: "QuarterStart", team, timestampMs: Date.now() });
    setOverrideTeam(null);
  }

  async function recordQuarterBreak() {
    setOverrideTeam(null);
    await replaceLog([...match!.log, { kind: "QuarterBreak", timestampMs: Date.now() }]);
    // Full time: on to the stats, where the Match File is sent to the club.
    if (quarterBreaks + 1 >= QUARTERS) window.location.hash = `#/match/${matchId}/stats`;
  }

  function undo() {
    void replaceLog(match!.log.slice(0, -1));
    setOverrideTeam(null);
  }

  const lastEntries = match.log.slice(-4);
  const quarterOf = (logIndex: number) =>
    match.log.slice(0, logIndex).filter((entry) => entry.kind === "QuarterBreak").length + 1;
  const lastAttributions = attributions.slice(-4);

  // While a shot's question is open, everything but it is blurred, and a tap
  // anywhere else answers "goal" without acting on what was under it.
  const blurred = shotOpen ? { filter: "blur(3px)" } : {};
  const linkButton = {
    ...tapButton,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    color: "inherit",
    boxSizing: "border-box",
  } as const;

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "0.75rem",
        maxWidth: "28rem",
        margin: "0 auto",
      }}
    >
      <style>{"@keyframes shot-countdown { from { width: 100%; } to { width: 0; } }"}</style>
      <div style={blurred}>
        {/* Equal outer columns keep the clock centred over the scoreboard. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
          <a href="#/">← Matches</a>
          <span
            data-testid="quarter-clock"
            style={{
              color: overtime ? "#B45309" : "#444",
              fontSize: "1.1rem",
              fontWeight: overtime ? 700 : 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {clock}
          </span>
          <a
            href={`#/match/${matchId}/stats`}
            data-testid="open-stats"
            style={{
              ...linkButton,
              justifySelf: "end",
              minHeight: "36px",
              padding: "0 0.6rem",
              fontSize: "0.85rem",
            }}
          >
            Stats
          </a>
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
          data-testid="possession-banner"
          data-team={inPossession ?? ""}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            padding: "0.4rem 0.6rem",
            marginBottom: "0.5rem",
            borderRadius: "8px",
            color: "#fff",
            background: inPossession ? TEAM_COLOURS[inPossession] : "#555",
          }}
        >
          {!started || inPossession === null ? (
            <>
              <span style={{ fontWeight: 600 }}>
                {quarterBreaks === 0 ? "Start match" : `Start Q${quarterBreaks + 1}`}
              </span>
              <span style={{ display: "flex", gap: "0.4rem" }}>
                {(["A", "B"] as const).map((team) => {
                  // The team due the centre pass is filled; tapping either starts it.
                  const predicted = derived.teamInPossession === team;
                  return (
                    <button
                      key={team}
                      data-testid={`choose-team-${team}`}
                      data-predicted={predicted}
                      style={{
                        ...tapButton,
                        border: `2px solid ${predicted ? "#fff" : TEAM_COLOURS[team]}`,
                        background: predicted ? TEAM_COLOURS[team] : "#fff",
                        color: predicted ? "#fff" : TEAM_COLOURS[team],
                      }}
                      onClick={() => startQuarter(team)}
                    >
                      {teamName(team)}
                    </button>
                  );
                })}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 600 }}>▶ {teamName(inPossession)} in possession</span>
              <button
                data-testid="flip-possession"
                aria-pressed={overrideTeam !== null}
                style={tapButton}
                onClick={() =>
                  setOverrideTeam(overrideTeam === null ? otherTeam(inPossession) : null)
                }
              >
                Flip ⇄
              </button>
            </>
          )}
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
            lastEntries.map((entry, index) => {
              const player = lastAttributions[index];
              const isLast = index === lastEntries.length - 1;
              return (
                <span
                  key={match.log.length - lastEntries.length + index}
                  data-testid="event-strip-item"
                  data-team={"team" in entry ? entry.team : ""}
                  style={{
                    fontWeight: isLast ? 700 : 400,
                    color: "team" in entry ? TEAM_COLOURS[entry.team] : "inherit",
                  }}
                >
                  {entry.kind === "QuarterStart"
                    ? `▶ Q${quarterOf(match.log.length - lastEntries.length + index)} · ${teamName(entry.team)} CP`
                    : isLast && shotOpen && entry.kind === "Event"
                      ? `${player ? `${player} ` : ""}${entry.action.position} Shot …`
                      : formatEntry(entry, player)}
                </span>
              );
            })
          )}
        </div>

        <div style={gridStyle(4)}>
          {POSITION_GRID.map((position) => (
            <button
              key={position}
              data-testid={`position-${position}`}
              aria-pressed={selectedPosition === position}
              disabled={!started}
              style={{ ...tapButton, ...(selectedPosition === position ? selectedButton : {}) }}
              onClick={() => setSelectedPosition(position)}
            >
              {position}
            </button>
          ))}
        </div>
      </div>

      {shotOpen && (
        <div
          data-testid="shot-backdrop"
          onClick={() => setShotOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1 }}
        />
      )}

      <div style={{ position: "relative", zIndex: shotOpen ? 2 : "auto" }}>
        <div style={gridStyle(2)}>
          {ACTION_GRID.map((action) => {
            const info = actionByKind(action.kind);
            return (
              <ActionButton
                key={action.testId}
                testId={action.testId}
                label={action.label}
                team={canRecord(info) ? teamFor(action.kind) : null}
                onClick={() => record(action)}
              />
            );
          })}
        </div>
        {shotOpen && (
          <div
            data-testid="shot-popup"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              padding: "0.75rem",
              borderRadius: "12px",
              background: "#fff",
              boxShadow: "0 4px 24px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", flex: 1 }}>
              <button
                data-testid="shot-goal"
                style={{ ...tapButton, fontSize: "1.5rem", background: "#15803D", color: "#fff", border: "none" }}
                onClick={() => setShotOpen(false)}
              >
                ✓ Goal
              </button>
              <button
                data-testid="shot-miss"
                style={{ ...tapButton, fontSize: "1.5rem", background: "#B91C1C", color: "#fff", border: "none" }}
                onClick={missShot}
              >
                ✕ Miss
              </button>
            </div>
            {/* Drains over SHOT_CONFIRM_MS: when it empties, the goal stands. */}
            <div style={{ height: "6px", borderRadius: "3px", background: "#eee" }}>
              <div
                style={{
                  height: "100%",
                  borderRadius: "3px",
                  background: "#444",
                  animation: `shot-countdown ${SHOT_CONFIRM_MS}ms linear forwards`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div style={blurred}>
        <div style={{ ...gridStyle(3), marginTop: "0.75rem" }}>
          <button
            data-testid="undo"
            style={tapButton}
            onClick={undo}
            disabled={match.log.length === 0}
          >
            Undo
          </button>
          <button
            data-testid="toggle-flagged"
            aria-pressed={lastEvent?.flagged ?? false}
            style={{ ...tapButton, ...(lastEvent?.flagged ? selectedButton : {}) }}
            disabled={lastEvent === null}
            onClick={toggleFlagged}
          >
            Flag ⚑
          </button>
          <button
            data-testid="quarter-break"
            style={tapButton}
            onClick={() => void recordQuarterBreak()}
            disabled={fullTime}
          >
            {quarterBreaks >= QUARTERS - 1 ? "Full time" : `End Q${quarterBreaks + 1}`}
          </button>
        </div>
        <div style={gridStyle(2)}>
          <a href={`#/match/${matchId}/roster`} data-testid="open-roster" style={linkButton}>
            Roster / Sub
          </a>
          <button
            data-testid="open-reference"
            style={tapButton}
            onClick={() => setShowReference(true)}
          >
            Reference
          </button>
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
                  <td style={{ color: "#666", fontVariantNumeric: "tabular-nums" }}>
                    {quarterLabel(index)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {playingTime.map(
            ({ team, times }) =>
              times !== null &&
              times.length > 0 && (
                <table
                  key={team}
                  style={{ marginTop: "0.5rem", borderSpacing: "0.75rem 0.15rem" }}
                >
                  <caption style={{ textAlign: "left", color: TEAM_COLOURS[team] }}>
                    {teamName(team)}
                  </caption>
                  <tbody>
                    {times.map((time) => (
                      <tr key={time.player} data-testid={`playing-time-${time.player}`}>
                        <td style={{ fontWeight: 600 }}>{time.player}</td>
                        <td>{formatMinutes(time.milliseconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ),
          )}
        </details>
      </div>

      {showReference && <ReferencePanel onClose={() => setShowReference(false)} />}
    </main>
  );
}

/**
 * An action tap, filled with the colour of the team it will be coded for.
 * Colour is the only team cue on the button itself: navy and red differ in
 * hue under every common colour-vision deficiency (weakest for protanopia,
 * where both read dark), and the possession banner names the team in words.
 * Disabled (team null) when no legal team or position is selected.
 */
function ActionButton({
  testId,
  label,
  team,
  onClick,
}: {
  testId: string;
  label: string;
  team: Team | null;
  onClick: () => void;
}) {
  return (
    <button
      data-testid={testId}
      data-team={team ?? ""}
      style={
        team
          ? { ...tapButton, background: TEAM_COLOURS[team], color: "#fff", borderColor: TEAM_COLOURS[team] }
          : { ...tapButton, color: "#999", borderColor: "#ccc" }
      }
      disabled={team === null}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
