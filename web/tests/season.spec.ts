import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

/** A Match File whose goals are scored in `goals` order ("AAB"), each after a
 * centre pass alternating from A, optionally ending at Full Time. */
function played(id: string, date: string, a: string, b: string, goals: string, fullTime: boolean) {
  const event = (team: string, action: object) => ({ kind: "Event", team, action, flagged: false, timestampMs: null });
  const log: object[] = [...goals].flatMap((team, i) => [
    event(i % 2 ? "B" : "A", { type: "CentrePassReceive", position: "GA" }),
    event(team, { type: "Goal", position: "GS", failed: false }),
  ]);
  if (fullTime) log.push(...Array.from({ length: 4 }, () => ({ kind: "QuarterBreak", timestampMs: null })));
  return { version: 4, id, teamAName: a, teamBName: b, date, log };
}

const SEASON = {
  version: 1,
  id: "autumn",
  name: "Autumn 2026",
  playerAliases: {},
  matches: [
    played("m1", "2026-09-01", "Hornets", "Riverside", "AAB", true), // W 2-1
    played("m2", "2026-09-08", "Lakeside", "Hornets", "AB", true), // D 1-1
    played("m3", "2026-09-15", "Hornets", "Oakfield", "A", false), // in progress
    played("f1", "2026-09-22", "Hornets", "Parkside", "", false), // fixture
  ],
};

test("a Collection shows results, the Season Record and trends", async ({ page }) => {
  await page.goto("/centrepass/");
  await page.getByTestId("import-match").setInputFiles({
    name: "autumn.centrepass-collection.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(SEASON)),
  });
  await page.getByRole("link", { name: "Autumn 2026" }).click();

  await expect(page.getByTestId("result-m1")).toContainText("2–1W");
  await expect(page.getByTestId("result-m2")).toContainText("1–1D");
  await expect(page.getByTestId("result-m3")).toContainText("1–0…");
  await expect(page.getByTestId("result-f1")).toContainText("Not coded");

  // Only Full Time matches count toward the record; the fixture counts for nothing.
  await expect(page.getByTestId("team-bucket-0").locator("summary")).toHaveText(
    "Hornets - 3 matches · P2 W1 D1 L0 · GF 3 GA 2",
  );
  // One-off opponents fold away.
  await expect(page.getByTestId("opposition")).not.toHaveAttribute("open");
  await expect(page.getByTestId("opposition").locator("> summary")).toHaveText("Opposition (3)");

  // Rates from summed counts; goal difference as a per-match average.
  const season = page.getByTestId("season-0");
  await expect(page.getByTestId("season-0-goal-difference")).toHaveText("+0.7");
  await expect(page.getByTestId("season-0-shooting")).toHaveText("100%");
  // Hornets' centre passes: m1 two (one scored), m2 and m3 one each (both scored).
  await expect(page.getByTestId("season-0-centre-pass")).toHaveText("75%");
  // The unfinished match is a hollow dot on every trend.
  const trend = season.locator("tr").first().locator("circle");
  await expect(trend).toHaveCount(3);
  await expect(trend.and(page.locator('[data-full-time="false"]'))).toHaveCount(1);
});

test("a team's Season Summary Image downloads as a full-size PNG", async ({ page }) => {
  await page.goto("/centrepass/");
  await page.getByTestId("import-match").setInputFiles({
    name: "autumn.centrepass-collection.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(SEASON)),
  });
  await page.getByRole("link", { name: "Autumn 2026" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("share-season-0").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Autumn 2026 Hornets.png");
  const bytes = await readFile(await download.path());
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1080, 1350]);
  expect(bytes.byteLength).toBeGreaterThan(3000);
});
