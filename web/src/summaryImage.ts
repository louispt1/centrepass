// The Summary Image: the project's public face in club chats (issue 09). One
// tap renders a match's headline statistics to a canvas and hands the PNG to
// the phone's share sheet, with a plain download as the fallback.
//
// Every figure comes from the netball-core stats report (the same derivation
// the stat views read) — nothing is recomputed here. This module only draws and
// shares; it holds no domain logic.
import type { StatsReport } from "./types/StatsReport";
import type { TeamStats } from "./types/TeamStats";
import type { StoredMatch } from "./storage";

// A portrait canvas that reads well as a chat image: large enough that the text
// stays legible when a messenger shrinks it to message width.
const WIDTH = 1080;
const HEIGHT = 1350;

const BG = "#0f4c5c"; // CentrePass teal
const INK = "#ffffff";
const MUTED = "#9fc3cc";
const ACCENT = "#ffd23f";

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** "made/att (pct%)", or "–" when nothing was attempted. */
function ratio(made: number, total: number): string {
  if (total === 0) return "–";
  return `${made}/${total} (${Math.round((made / total) * 100)}%)`;
}

/** A team's shooters (anyone who took a shot), best first, capped at three. */
function topShooters(team: TeamStats) {
  return team.players
    .filter((player) => player.shots > 0)
    .sort((a, b) => b.goals - a.goals || b.shots - a.shots)
    .slice(0, 3);
}

/**
 * Draw the Summary Image for a match onto a fresh canvas and return it. The
 * caller turns it into a blob or shares it; keeping the draw separate makes it
 * straightforward to test that a non-trivial bitmap was produced.
 */
export function renderSummaryImageCanvas(
  match: StoredMatch,
  report: StatsReport,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context for the summary image.");

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = "alphabetic";

  const centre = WIDTH / 2;

  // Wordmark — the image must carry the CentrePass name.
  ctx.textAlign = "left";
  ctx.fillStyle = ACCENT;
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText("CentrePass", 64, 90);
  ctx.fillStyle = MUTED;
  ctx.font = `400 30px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(match.date, WIDTH - 64, 88);

  // Team names and the final score.
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `600 52px ${FONT}`;
  ctx.fillText(`${match.teamAName}  v  ${match.teamBName}`, centre, 200);

  ctx.font = `800 200px ${FONT}`;
  ctx.fillText(`${report.score.teamA}–${report.score.teamB}`, centre, 400);

  // Per-quarter scores.
  ctx.fillStyle = MUTED;
  ctx.font = `500 34px ${FONT}`;
  const quarters = report.quarterScores
    .map((q, i) => `Q${i + 1} ${q.teamA}–${q.teamB}`)
    .join("     ");
  ctx.fillText(quarters, centre, 470);

  // A team column: name, top shooters with success %, and conversion rates.
  const drawTeam = (team: TeamStats, teamName: string, x: number) => {
    let y = 590;
    ctx.textAlign = "left";
    ctx.fillStyle = ACCENT;
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(teamName, x, y);
    y += 58;

    ctx.fillStyle = INK;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText("Top shooters", x, y);
    y += 44;
    ctx.font = `400 30px ${FONT}`;
    const shooters = topShooters(team);
    if (shooters.length === 0) {
      ctx.fillStyle = MUTED;
      ctx.fillText("—", x, y);
      y += 42;
    } else {
      for (const player of shooters) {
        ctx.fillStyle = INK;
        ctx.fillText(`${player.player}`, x, y);
        ctx.fillStyle = MUTED;
        ctx.textAlign = "right";
        ctx.fillText(ratio(player.goals, player.shots), x + 400, y);
        ctx.textAlign = "left";
        y += 42;
      }
    }

    y += 30;
    ctx.fillStyle = INK;
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText("Conversions", x, y);
    y += 44;
    ctx.font = `400 30px ${FONT}`;
    const rows: [string, number, number][] = [
      ["Centre pass → goal", team.conversions.centrePassGoals, team.conversions.centrePassTotal],
      ["Gain → goal", team.conversions.gainGoals, team.conversions.gainTotal],
    ];
    for (const [label, made, total] of rows) {
      ctx.fillStyle = INK;
      ctx.fillText(label, x, y);
      ctx.fillStyle = MUTED;
      ctx.textAlign = "right";
      ctx.fillText(ratio(made, total), x + 400, y);
      ctx.textAlign = "left";
      y += 42;
    }
  };

  const teamA = report.teams.find((t) => t.team === "A");
  const teamB = report.teams.find((t) => t.team === "B");
  if (teamA) drawTeam(teamA, match.teamAName, 64);
  if (teamB) drawTeam(teamB, match.teamBName, centre + 40);

  // Footer.
  ctx.textAlign = "center";
  ctx.fillStyle = MUTED;
  ctx.font = `400 26px ${FONT}`;
  ctx.fillText("Coded with CentrePass — open-source netball match stats", centre, HEIGHT - 48);

  return canvas;
}

/** The Summary Image as a PNG blob. */
export function summaryImageBlob(match: StoredMatch, report: StatsReport): Promise<Blob> {
  const canvas = renderSummaryImageCanvas(match, report);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The summary image could not be encoded."));
    }, "image/png");
  });
}

/** A filesystem-safe name for the shared image. */
export function summaryImageName(match: StoredMatch): string {
  const base = `${match.teamAName} vs ${match.teamBName} ${match.date}`
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${base}.png`;
}

/**
 * Render and share the Summary Image: hand it to the native share sheet when
 * the platform can share files (a phone courtside), otherwise download it.
 * Rendering is entirely client-side, so this works offline.
 */
export async function shareSummaryImage(match: StoredMatch, report: StatsReport): Promise<void> {
  const blob = await summaryImageBlob(match, report);
  const fileName = summaryImageName(match);
  const file = new File([blob], fileName, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${match.teamAName} v ${match.teamBName}` });
      return;
    } catch (error) {
      // A cancelled share is not a failure; anything else falls through to a
      // download so the image is never simply lost.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
