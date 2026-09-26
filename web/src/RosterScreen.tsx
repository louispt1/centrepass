import { useEffect, useState, type FormEvent } from "react";
import type { CourtPosition } from "./types/CourtPosition";
import type { LogEntry } from "./types/LogEntry";
import type { Team } from "./types/Team";
import { deriveRoster } from "./engine";
import { TEAM_COLOURS } from "./events";
import { getMatch, putMatch, type StoredMatch } from "./storage";

const COURT_POSITIONS: CourtPosition[] = ["GS", "GA", "WA", "C", "WD", "GD", "GK"];
const TEAMS: Team[] = ["A", "B"];

type Names = Record<CourtPosition, string>;

/** Who each position is named for right now, "" where nobody is. */
function currentNames(log: LogEntry[], team: Team): Names {
  const roster = deriveRoster(log, team);
  return {
    GS: roster.gs ?? "",
    GA: roster.ga ?? "",
    WA: roster.wa ?? "",
    C: roster.c ?? "",
    WD: roster.wd ?? "",
    GD: roster.gd ?? "",
    GK: roster.gk ?? "",
  };
}

// The roster is the fold of the log's Substitution entries (ADR-0003), so
// this one screen is match setup, gap-filling, and the substitution flow:
// saving appends a Substitution entry for each position whose name changed,
// effective from that moment. Blank positions are simply left unassigned -
// an incomplete roster never blocks coding, and an unnamed position's stats
// report under the position itself (typical for the opposition).
export default function RosterScreen({ matchId }: { matchId: string }) {
  // undefined = still loading, null = no such match
  const [match, setMatch] = useState<StoredMatch | null | undefined>(undefined);
  const [names, setNames] = useState<Record<Team, Names> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMatch(matchId).then((loaded) => {
      if (cancelled) return;
      setMatch(loaded ?? null);
      if (loaded) {
        setNames({ A: currentNames(loaded.log, "A"), B: currentNames(loaded.log, "B") });
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
    const substitutions: LogEntry[] = TEAMS.flatMap((team) => {
      const current = currentNames(match!.log, team);
      return COURT_POSITIONS.flatMap((position): LogEntry[] => {
        const player = names![team][position].trim();
        if (player === "" || player === current[position]) return [];
        return [{ kind: "Substitution", team, position, player, timestampMs: Date.now() }];
      });
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
      <h1 style={{ fontSize: "1.3rem" }}>Rosters</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        Name the player in each position. Change a name mid-match to record a substitution from
        that moment; positions can stay blank and be filled later. Unnamed positions report stats
        by position.
      </p>
      <p data-testid="naming-notice" style={{ color: "#666", fontSize: "0.9rem" }}>
        Spell each player's name the same way every match - season stats add up matches by name.
      </p>
      <form onSubmit={save}>
        {TEAMS.map((team) => (
          <fieldset
            key={team}
            style={{ border: `2px solid ${TEAM_COLOURS[team]}`, borderRadius: "8px" }}
          >
            <legend style={{ fontWeight: 700, color: TEAM_COLOURS[team] }}>
              {team === "A" ? match.teamAName : `${match.teamBName} (optional)`}
            </legend>
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
                  data-testid={team === "A" ? `roster-${position}` : `roster-B-${position}`}
                  style={{ flex: 1, padding: "0.5rem", fontSize: "1rem", boxSizing: "border-box" }}
                  value={names![team][position]}
                  onChange={(change) =>
                    setNames({
                      ...names!,
                      [team]: { ...names![team], [position]: change.target.value },
                    })
                  }
                />
              </label>
            ))}
          </fieldset>
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
