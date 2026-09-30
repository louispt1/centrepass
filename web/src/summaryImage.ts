// The Summary Image: the project's public face in club chats (issue 09). One
// tap renders a match's headline statistics to a canvas and hands the PNG to
// the phone's share sheet, with a plain download as the fallback.
//
// Every figure comes from the netball-core stats report (the same derivation
// the stat views read) - nothing is recomputed here. This module only draws and
// shares; it holds no domain logic.
import type { StatsReport } from "./types/StatsReport";
import type { TeamStats } from "./types/TeamStats";
import type { StoredMatch } from "./storage";
import type { CollectionTeam } from "./types/CollectionTeam";
import { matchBaseName, safeName, shareOrDownload } from "./matchFile";
import { METRICS, seasonValue, sparkline } from "./season";

// A portrait canvas that reads well as a chat image: large enough that the text
// stays legible when a messenger shrinks it to message width.
const WIDTH = 1080;
const HEIGHT = 1350;

const BG = "#263E58"; // CentrePass blue
const INK = "#ffffff";
const MUTED = "#a9b8c9";
const ACCENT = "#ED1C24";

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** "made/total (pct%)", or "–" when nothing was attempted. */
export function ratio(made: number, total: number): string {
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

  // Wordmark - the image must carry the CentrePass name.
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
      ctx.fillText("-", x, y);
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
  ctx.fillText("Coded with CentrePass - open-source netball match stats", centre, HEIGHT - 48);

  return canvas;
}

/** The Summary Image as a PNG blob. */
export function summaryImageBlob(match: StoredMatch, report: StatsReport): Promise<Blob> {
  return pngBlob(renderSummaryImageCanvas(match, report));
}

function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The summary image could not be encoded."));
    }, "image/png");
  });
}

/**
 * Render and share the Summary Image: hand it to the native share sheet when
 * the platform can share files (a phone courtside), otherwise download it.
 * Rendering is entirely client-side, so this works offline.
 */
export async function shareSummaryImage(match: StoredMatch, report: StatsReport): Promise<void> {
  const blob = await summaryImageBlob(match, report);
  const file = new File([blob], `${matchBaseName(match)}.png`, { type: "image/png" });
  await shareOrDownload([file], `${match.teamAName} v ${match.teamBName}`);
}

/**
 * Draw the Season Summary Image for one team bucket of a Collection: its
 * Season Record, form, goal-difference trend, key rates, and top players.
 * Every figure comes from the core's collection stats via `season.ts`.
 */
export function renderSeasonImageCanvas(collectionName: string, team: CollectionTeam): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get a 2D canvas context for the season image.");
  const [left, right, centre] = [64, WIDTH - 64, WIDTH / 2];
  const text = (value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign) => {
    ctx.font = `${font} ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  text("CentrePass", left, 90, "700 44px", ACCENT, "left");
  text(collectionName, right, 88, "400 30px", MUTED, "right");
  text(team.name, centre, 190, "700 60px", INK, "center");

  // Season Record: Full Time matches only.
  const { won, drawn, lost, goalsFor, goalsAgainst } = team.record;
  const diff = goalsFor - goalsAgainst;
  text(`${won} W · ${drawn} D · ${lost} L`, centre, 320, "800 100px", INK, "center");
  text(`GF ${goalsFor}   GA ${goalsAgainst}   (${diff > 0 ? "+" : ""}${diff})`, centre, 385, "500 36px", MUTED, "center");

  // Form strip: one chip per Full Time match, wrapping onto a second row.
  const form = team.series.filter((point) => point.fullTime);
  const cols = Math.min(form.length, 16);
  const gap = 10;
  const size = cols === 0 ? 0 : Math.min(56, (right - left - (cols - 1) * gap) / cols);
  let y = 425;
  form.forEach((point, i) => {
    const [row, col] = [Math.floor(i / cols), i % cols];
    const x = centre - (cols * size + (cols - 1) * gap) / 2 + col * (size + gap);
    const top = y + row * (size + gap);
    const result = point.goalsFor > point.goalsAgainst ? "W" : point.goalsFor < point.goalsAgainst ? "L" : "D";
    ctx.fillStyle = result === "W" ? INK : result === "L" ? ACCENT : MUTED;
    ctx.fillRect(x, top, size, size);
    ctx.textBaseline = "middle";
    text(result, x + size / 2, top + size / 2 + 2, `700 ${Math.round(size * 0.55)}px`, BG, "center");
    ctx.textBaseline = "alphabetic";
  });
  y += form.length === 0 ? 0 : Math.ceil(form.length / cols) * (size + gap);

  // Goal-difference trend, the season average dashed.
  const goalDifference = METRICS[0];
  y += 60;
  text("Goal difference by match", left, y, "600 30px", INK, "left");
  const box = { x: left, y: y + 20, width: right - left, height: 110 };
  const { points, referenceY } = sparkline(
    goalDifference,
    team.series,
    seasonValue(goalDifference, team),
    box.width,
    box.height,
  );
  ctx.strokeStyle = MUTED;
  ctx.lineWidth = 2;
  if (referenceY !== null) {
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + referenceY);
    ctx.lineTo(box.x + box.width, box.y + referenceY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.beginPath();
  points.forEach((p, i) => {
    if (!p) return;
    // A gap (no value) starts a new stroke.
    if (i === 0 || !points[i - 1]) ctx.moveTo(box.x + p.x, box.y + p.y);
    else ctx.lineTo(box.x + p.x, box.y + p.y);
  });
  ctx.stroke();
  for (const p of points) {
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(box.x + p.x, box.y + p.y, 9, 0, 2 * Math.PI);
    ctx.fillStyle = p.fullTime ? INK : BG;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  y = box.y + box.height + 70;

  // Key rates, from summed counts.
  for (const key of ["shooting", "centre-pass", "gain", "opponent-centre-pass"]) {
    const metric = METRICS.find((m) => m.key === key)!;
    const value = seasonValue(metric, team);
    text(metric.label, left, y, "400 34px", INK, "left");
    text(value === null ? "–" : metric.format(value), right, y, "700 34px", INK, "right");
    y += 50;
  }

  // Top three scorers and gainers, side by side.
  y += 30;
  const top = (count: (player: CollectionTeam["players"][number]) => number) =>
    team.players
      .filter((player) => count(player) > 0)
      .sort((a, b) => count(b) - count(a))
      .slice(0, 3);
  const column = (title: string, x: number, count: (player: CollectionTeam["players"][number]) => number) => {
    text(title, x, y, "600 30px", ACCENT, "left");
    const leaders = top(count);
    if (leaders.length === 0) text("-", x, y + 46, "400 30px", MUTED, "left");
    leaders.forEach((player, i) => {
      text(player.stats.player, x, y + 46 * (i + 1), "400 30px", INK, "left");
      text(String(count(player)), x + 380, y + 46 * (i + 1), "600 30px", INK, "right");
    });
  };
  column("Top scorers", left, (player) => player.stats.goals);
  column("Top gains", centre + 40, (player) => player.stats.gains);

  text("Coded with CentrePass - open-source netball match stats", centre, HEIGHT - 48, "400 26px", MUTED, "center");
  return canvas;
}

/** Render and share (or download) a team's Season Summary Image. */
export async function shareSeasonImage(collectionName: string, team: CollectionTeam): Promise<void> {
  const blob = await pngBlob(renderSeasonImageCanvas(collectionName, team));
  const file = new File([blob], `${safeName(`${collectionName} ${team.name}`)}.png`, { type: "image/png" });
  await shareOrDownload([file], `${team.name} - ${collectionName}`);
}
