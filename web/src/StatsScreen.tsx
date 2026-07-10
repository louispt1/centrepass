import { useEffect, useMemo, useState } from "react";
import type { Conversions } from "./types/Conversions";
import type { PlayerStats } from "./types/PlayerStats";
import type { TeamStats } from "./types/TeamStats";
import { deriveStats } from "./engine";
import { getMatch, type StoredMatch } from "./storage";

// The payoff screen: after (or during) a match the coach reads per-player and
// team statistics, all from a single netball-core derivation over the log
// (issue 05). The screen only formats what the core returns — it holds no
// domain logic of its own.

function formatMinutes(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = totalSeconds % 60;
  return `${Math.floor(totalSeconds / 60)}:${String(seconds).padStart(2, "0")}`;
}

/** "made/total (pct%)", or "–" when there is nothing attempted. */
function ratio(made: number, total: number): string {
  if (total === 0) return "–";
  return `${made}/${total} (${Math.round((made / total) * 100)}%)`;
}

const cell = { padding: "0.35rem 0.5rem", textAlign: "right", whiteSpace: "nowrap" } as const;
const headCell = { ...cell, fontWeight: 600, borderBottom: "2px solid #ccc" } as const;
const nameCell = { ...cell, textAlign: "left", fontWeight: 600 } as const;
const rowCell = { ...cell, borderBottom: "1px solid #eee" } as const;

/** The gains cell: total, with the coded sub-type breakdown when any. */
function gainsLabel(player: PlayerStats): string {
  const parts = [];
  if (player.gainInterceptions > 0) parts.push(`${player.gainInterceptions}i`);
  if (player.gainDeflections > 0) parts.push(`${player.gainDeflections}d`);
  if (player.gainPickUps > 0) parts.push(`${player.gainPickUps}p`);
  return parts.length > 0 ? `${player.gains} (${parts.join(" ")})` : `${player.gains}`;
}

function PlayerTable({ team, teamName }: { team: TeamStats; teamName: string }) {
  const showTime = team.playingTimeAvailable;
  return (
    <div style={{ overflowX: "auto", marginBottom: "1.5rem" }}>
      <table
        data-testid={`player-table-${team.team}`}
        style={{ borderCollapse: "collapse", fontSize: "0.85rem", minWidth: "100%" }}
      >
        <caption style={{ textAlign: "left", fontWeight: 700, marginBottom: "0.4rem" }}>
          {teamName}
        </caption>
        <thead>
          <tr>
            <th style={{ ...headCell, textAlign: "left" }}>Player</th>
            <th style={headCell}>Goals</th>
            <th style={headCell}>Feeds</th>
            <th style={headCell} title="Feeds that led to a shot">
              F/shot
            </th>
            <th style={headCell} title="Goal assists">
              Assist
            </th>
            <th style={headCell} title="Attacking rebounds">
              Reb↑
            </th>
            <th style={headCell} title="Defensive rebounds">
              Reb↓
            </th>
            <th style={headCell} title="Unforced turnovers">
              TO
            </th>
            <th style={headCell} title="Infringements">
              Inf
            </th>
            <th style={headCell}>Gains</th>
            {showTime && <th style={headCell}>Mins</th>}
          </tr>
        </thead>
        <tbody>
          {team.players.map((player) => (
            <tr key={player.player} data-testid={`player-row-${player.player}`}>
              <td style={nameCell}>{player.player}</td>
              <td style={rowCell} data-testid={`stat-${player.player}-goals`}>
                {ratio(player.goals, player.shots)}
              </td>
              <td style={rowCell} data-testid={`stat-${player.player}-feeds`}>
                {ratio(player.completedFeeds, player.feeds)}
              </td>
              <td style={rowCell} data-testid={`stat-${player.player}-feedsWithShot`}>
                {player.feedsWithShot}
              </td>
              <td style={rowCell} data-testid={`stat-${player.player}-assists`}>
                {player.goalAssists}
              </td>
              <td style={rowCell} data-testid={`stat-${player.player}-reboundsAttacking`}>
                {player.attackingRebounds}
              </td>
              <td style={rowCell} data-testid={`stat-${player.player}-reboundsDefensive`}>
                {player.defensiveRebounds}
              </td>
              <td style={rowCell} data-testid={`stat-${player.player}-turnovers`}>
                {player.unforcedTurnovers}
              </td>
              <td style={rowCell} data-testid={`stat-${player.player}-infringements`}>
                {player.infringements}
              </td>
              <td style={rowCell} data-testid={`stat-${player.player}-gains`}>
                {gainsLabel(player)}
              </td>
              {showTime && (
                <td style={rowCell} data-testid={`stat-${player.player}-mins`}>
                  {player.playingTimeMs === null ? "–" : formatMinutes(player.playingTimeMs)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!showTime && (
        <p style={{ color: "#666", fontSize: "0.8rem", margin: "0.25rem 0" }}>
          Playing time unavailable — this match has no timestamps.
        </p>
      )}
    </div>
  );
}

function ConversionRow({
  label,
  testId,
  goals,
  total,
}: {
  label: string;
  testId: string;
  goals: number;
  total: number;
}) {
  return (
    <tr>
      <td style={{ ...rowCell, textAlign: "left", fontWeight: 600 }}>{label}</td>
      <td style={rowCell} data-testid={testId}>
        {ratio(goals, total)}
      </td>
    </tr>
  );
}

function ConversionTable({ team, conversions }: { team: string; conversions: Conversions }) {
  return (
    <table
      data-testid={`conversions-${team}`}
      style={{ borderCollapse: "collapse", fontSize: "0.9rem", marginBottom: "1.5rem" }}
    >
      <tbody>
        <ConversionRow
          label="Centre pass → goal"
          testId={`conversion-${team}-centrePass`}
          goals={conversions.centrePassGoals}
          total={conversions.centrePassTotal}
        />
        <ConversionRow
          label="Gain → goal"
          testId={`conversion-${team}-gain`}
          goals={conversions.gainGoals}
          total={conversions.gainTotal}
        />
      </tbody>
    </table>
  );
}

export default function StatsScreen({ matchId }: { matchId: string }) {
  // undefined = still loading, null = no such match
  const [match, setMatch] = useState<StoredMatch | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getMatch(matchId).then((loaded) => {
      if (!cancelled) setMatch(loaded ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const report = useMemo(() => (match ? deriveStats(match.log) : null), [match]);

  if (match === undefined) {
    return <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>Loading…</main>;
  }
  if (match === null || report === null) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>
        <p>Match not found.</p>
        <a href="#/">Back to matches</a>
      </main>
    );
  }

  const teamName = (team: string) => (team === "A" ? match.teamAName : match.teamBName);

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "0.75rem",
        maxWidth: "40rem",
        margin: "0 auto",
      }}
    >
      <a href={`#/match/${matchId}`}>← Live coding</a>
      <h1 style={{ fontSize: "1.3rem", marginBottom: "0.25rem" }}>
        {match.teamAName} vs {match.teamBName}
      </h1>
      <div style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1rem" }}>{match.date}</div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "1rem" }}>
        <span data-testid="final-score" style={{ fontSize: "2rem", fontWeight: 700 }}>
          {report.score.teamA}–{report.score.teamB}
        </span>
      </div>

      <h2 style={{ fontSize: "1.05rem" }}>Score by quarter</h2>
      <table style={{ borderCollapse: "collapse", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
        <tbody>
          {report.quarterScores.map((quarter, index) => (
            <tr key={index} data-testid={`quarter-score-${index + 1}`}>
              <td style={{ ...rowCell, textAlign: "left", fontWeight: 600 }}>Q{index + 1}</td>
              <td style={rowCell}>
                {quarter.teamA}–{quarter.teamB}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {report.teams.map((team) => {
        const hasContent =
          team.players.length > 0 ||
          team.conversions.centrePassTotal > 0 ||
          team.conversions.gainTotal > 0;
        if (!hasContent) return null;
        return (
          <section key={team.team} data-testid={`team-section-${team.team}`}>
            <h2 style={{ fontSize: "1.05rem" }}>Conversion rates — {teamName(team.team)}</h2>
            <ConversionTable team={team.team} conversions={team.conversions} />
            {team.players.length > 0 && (
              <>
                <h2 style={{ fontSize: "1.05rem" }}>Players</h2>
                <PlayerTable team={team} teamName={teamName(team.team)} />
              </>
            )}
          </section>
        );
      })}
    </main>
  );
}
