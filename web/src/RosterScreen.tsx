import { useEffect, useState, type FormEvent } from "react";
import type { CourtPosition } from "./types/CourtPosition";
import type { LogEntry } from "./types/LogEntry";
import { deriveRoster } from "./engine";
import { getMatch, putMatch, type StoredMatch } from "./storage";

const COURT_POSITIONS: CourtPosition[] = ["GS", "GA", "WA", "C", "WD", "GD", "GK"];

// The roster is the fold of the log's Substitution entries (ADR-0003), so
// this one screen is match setup, gap-filling, and the substitution flow:
// saving appends a Substitution entry for each position whose name changed,
// effective from that moment. Blank positions are simply left unassigned —
// an incomplete roster never blocks coding.
export default function RosterScreen({ matchId }: { matchId: string }) {
  // undefined = still loading, null = no such match
  const [match, setMatch] = useState<StoredMatch | null | undefined>(undefined);
  const [names, setNames] = useState<Record<CourtPosition, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMatch(matchId).then((loaded) => {
      if (cancelled) return;
      setMatch(loaded ?? null);
      if (loaded) {
        const roster = deriveRoster(loaded.log, "A");
        setNames({
          GS: roster.gs ?? "",
          GA: roster.ga ?? "",
          WA: roster.wa ?? "",
          C: roster.c ?? "",
          WD: roster.wd ?? "",
          GD: roster.gd ?? "",
          GK: roster.gk ?? "",
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (match === undefined || (match !== null && names === null)) {
    return <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>Loading…</main>;
  }
  if (match === null) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>
        <p>Match not found.</p>
        <a href="#/">Back to matches</a>
      </main>
    );
  }

  async function save(submit: FormEvent) {
    submit.preventDefault();
    const roster = deriveRoster(match!.log, "A");
    const current: Record<CourtPosition, string | null> = {
      GS: roster.gs,
      GA: roster.ga,
      WA: roster.wa,
      C: roster.c,
      WD: roster.wd,
      GD: roster.gd,
      GK: roster.gk,
    };
    const substitutions: LogEntry[] = COURT_POSITIONS.flatMap((position) => {
      const player = names![position].trim();
      if (player === "" || player === current[position]) return [];
      return [{ kind: "Substitution", team: "A", position, player, timestampMs: Date.now() }];
    });
    if (substitutions.length > 0) {
      await putMatch({ ...match!, log: [...match!.log, ...substitutions] });
    }
    window.location.hash = `#/match/${matchId}`;
  }

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "0.75rem",
        maxWidth: "28rem",
        margin: "0 auto",
      }}
    >
      <a href={`#/match/${matchId}`}>← Live coding</a>
      <h1 style={{ fontSize: "1.3rem" }}>
        Roster — {match.teamAName}
      </h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Name the player in each position. Change a name mid-match to record a substitution from
        that moment; positions can stay blank and be filled later.
      </p>
      <form onSubmit={save}>
        {COURT_POSITIONS.map((position) => (
          <label
            key={position}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "0.5rem",
            }}
          >
            <span style={{ width: "2.5rem", fontWeight: 600 }}>{position}</span>
            <input
              data-testid={`roster-${position}`}
              style={{ flex: 1, padding: "0.5rem", fontSize: "1rem", boxSizing: "border-box" }}
              value={names![position]}
              onChange={(change) => setNames({ ...names!, [position]: change.target.value })}
            />
          </label>
        ))}
        <button
          type="submit"
          data-testid="save-roster"
          style={{ padding: "0.75rem 1.5rem", fontSize: "1rem", marginTop: "0.5rem" }}
        >
          Save roster
        </button>
      </form>
    </main>
  );
}
