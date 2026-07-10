import { test, expect, type Page } from "@playwright/test";

// A full roster so every attributed event lands on a named player and so
// Playing Time (derived from live timestamps) has someone to credit.
const ROSTER: Record<string, string> = {
  GS: "Alice",
  GA: "Beth",
  WA: "Wanda",
  C: "Cara",
  WD: "Winnie",
  GD: "Gina",
  GK: "Kira",
};

async function createMatchWithRoster(page: Page) {
  await page.goto("/centrepass/");
  await page.getByLabel("Your team").fill("Hornets U13");
  await page.getByLabel("Opposition").fill("Riverside");
  await page.getByLabel("Date").fill("2026-07-10");
  await page.getByRole("button", { name: "Create match" }).click();
  for (const [position, name] of Object.entries(ROSTER)) {
    await page.getByTestId(`roster-${position}`).fill(name);
  }
  await page.getByTestId("save-roster").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("0");
}

/** Select a position, then record an action by its taxonomy id. */
async function code(page: Page, position: string, action: string) {
  await page.getByTestId(`position-${position}`).click();
  await page.getByTestId(`action-${action}`).click();
}

test("a coded match shows correct numbers in every stat view", async ({ page }) => {
  await createMatchWithRoster(page);

  // Possession 1 — our centre pass converts: Beth (GA) receives, Wanda (WA)
  // feeds, Alice (GS) scores. That feed is a feed-with-shot and an assist.
  await code(page, "GA", "CentrePassReceive");
  await code(page, "WA", "Feed");
  await code(page, "GS", "Goal");
  await expect(page.getByTestId("score-team-a")).toHaveText("1");

  // The opposition answer from their own centre pass.
  await page.getByTestId("goal-opposition").click();
  await expect(page.getByTestId("score-team-b")).toHaveText("1");

  // Possession 2 — our centre pass is turned over by Cara (C): no goal.
  await code(page, "WA", "CentrePassReceive");
  await code(page, "C", "UnforcedTurnover");

  // Possession 3 — Gina (GD) intercepts, Beth (GA) feeds, Alice misses,
  // rebounds her own miss, and scores. The gain converts; the feed produced a
  // shot but the rebound breaks the assist link.
  await page.getByTestId("position-GD").click();
  await page.getByTestId("subtype-Interception").click();
  await code(page, "GA", "Feed");
  await page.getByTestId("toggle-failed").click();
  await code(page, "GS", "Goal");
  await expect(page.getByTestId("score-team-a")).toHaveText("1"); // the miss
  await code(page, "GS", "Rebound");
  await code(page, "GS", "Goal");
  await expect(page.getByTestId("score-team-a")).toHaveText("2");

  // End of the first quarter.
  await page.getByTestId("quarter-break").click();
  await expect(page.getByTestId("current-quarter")).toHaveText("Q2");

  // Possession 4 — Kira (GK) deflects a gain but then infringes: no goal.
  await page.getByTestId("position-GK").click();
  await page.getByTestId("subtype-Deflection").click();
  await code(page, "GK", "Infringement");

  // Possession 5 — Kira takes a defensive rebound under her own post.
  await code(page, "GK", "Rebound");

  // --- The stat views ----------------------------------------------------
  await page.getByTestId("open-stats").click();

  // Final score and quarter-by-quarter breakdown.
  await expect(page.getByTestId("final-score")).toHaveText("2–1");
  await expect(page.getByTestId("quarter-score-1")).toContainText("2–1");
  await expect(page.getByTestId("quarter-score-2")).toContainText("0–0");

  // Team conversion rates: two centre passes, one converted; two gains, one
  // converted.
  await expect(page.getByTestId("conversion-A-centrePass")).toHaveText("1/2 (50%)");
  await expect(page.getByTestId("conversion-A-gain")).toHaveText("1/2 (50%)");

  // Alice: three shots, two goals, one attacking rebound.
  await expect(page.getByTestId("stat-Alice-goals")).toHaveText("2/3 (67%)");
  await expect(page.getByTestId("stat-Alice-reboundsAttacking")).toHaveText("1");

  // Wanda's feed led directly to a goal (assist); Beth's led to a shot that
  // scored only off a rebound (feed-with-shot, but no assist).
  await expect(page.getByTestId("stat-Wanda-feeds")).toHaveText("1/1 (100%)");
  await expect(page.getByTestId("stat-Wanda-feedsWithShot")).toHaveText("1");
  await expect(page.getByTestId("stat-Wanda-assists")).toHaveText("1");
  await expect(page.getByTestId("stat-Beth-feedsWithShot")).toHaveText("1");
  await expect(page.getByTestId("stat-Beth-assists")).toHaveText("0");

  // Discipline and defensive work.
  await expect(page.getByTestId("stat-Cara-turnovers")).toHaveText("1");
  await expect(page.getByTestId("stat-Gina-gains")).toHaveText("1 (1i)");
  await expect(page.getByTestId("stat-Kira-gains")).toHaveText("1 (1d)");
  await expect(page.getByTestId("stat-Kira-infringements")).toHaveText("1");
  await expect(page.getByTestId("stat-Kira-reboundsDefensive")).toHaveText("1");

  // A rostered player who touched nothing still appears, in context of minutes.
  await expect(page.getByTestId("player-row-Winnie")).toBeVisible();

  // Playing Time is available (live entries carry timestamps): the column
  // shows m:ss for everyone on court.
  for (const name of Object.values(ROSTER)) {
    await expect(page.getByTestId(`stat-${name}-mins`)).toHaveText(/\d+:\d\d/);
  }

  // Everything is derived from the persisted log, so it survives a reload.
  await page.reload();
  await expect(page.getByTestId("final-score")).toHaveText("2–1");
  await expect(page.getByTestId("stat-Alice-goals")).toHaveText("2/3 (67%)");
  await expect(page.getByTestId("conversion-A-gain")).toHaveText("1/2 (50%)");
});
