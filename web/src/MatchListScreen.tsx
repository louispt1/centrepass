import { useEffect, useState, type FormEvent } from "react";
import { listMatches, putMatch, type StoredMatch } from "./storage";

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

export default function MatchListScreen({ engineDescription }: { engineDescription: string }) {
  const [matches, setMatches] = useState<StoredMatch[] | null>(null);
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");
  const [date, setDate] = useState(todayIsoDate);

  useEffect(() => {
    void listMatches().then(setMatches);
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
      {matches === null ? (
        <p>Loading…</p>
      ) : matches.length === 0 ? (
        <p>No matches yet.</p>
      ) : (
        <ul data-testid="match-list" style={{ listStyle: "none", padding: 0 }}>
          {matches.map((match) => (
            <li key={match.id} style={{ marginBottom: "0.5rem" }}>
              <a href={`#/match/${match.id}`} style={{ fontSize: "1.1rem" }}>
                {match.teamAName} vs {match.teamBName} — {match.date}
              </a>
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
