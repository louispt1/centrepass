import { test, expect, type Page } from "@playwright/test";

// Screenshot generator for the volunteer quickstart (docs/img/). This is not
// part of the CI suite — it only runs when SCREENSHOTS=1 (via `npm run
// screenshots`) and writes PNGs into ../docs/img. Regenerate the quickstart
// images after a UI change; otherwise it is skipped.
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate quickstart images");

const IMG = "../docs/img";

const ROSTER: Record<string, string> = {
  GS: "Alice",
  GA: "Beth",
  WA: "Wanda",
  C: "Cara",
  WD: "Winnie",
  GD: "Gina",
  GK: "Kira",
};

async function code(page: Page, position: string, action: string) {
  await page.getByTestId(`position-${position}`).click();
  await page.getByTestId(`action-${action}`).click();
}

test("capture the quickstart screens", async ({ page }) => {
  await page.goto("/centrepass/");
  await page.getByLabel("Your team").fill("Hornets U13");
  await page.getByLabel("Opposition").fill("Riverside");
  await page.getByLabel("Date").fill("2026-07-10");
  await page.screenshot({ path: `${IMG}/01-create-match.png` });

  await page.getByRole("button", { name: "Create match" }).click();
  for (const [position, name] of Object.entries(ROSTER)) {
    await page.getByTestId(`roster-${position}`).fill(name);
  }
  await page.screenshot({ path: `${IMG}/02-roster.png` });
  await page.getByTestId("save-roster").click();

  // Code a lively opening so the live screen has something to show.
  await code(page, "GA", "CentrePassReceive");
  await code(page, "WA", "Feed");
  await code(page, "GS", "Goal");
  await page.getByTestId("goal-opposition").click();
  await page.getByTestId("position-GD").click();
  await page.getByTestId("subtype-Interception").click();
  await code(page, "GA", "Feed");
  await code(page, "GS", "Goal");
  await expect(page.getByTestId("score-team-a")).toHaveText("2");
  await page.screenshot({ path: `${IMG}/03-live-coding.png` });

  await page.getByTestId("open-reference").click();
  await expect(page.getByTestId("reference-panel")).toBeVisible();
  await page.screenshot({ path: `${IMG}/04-reference.png` });
  await page.getByTestId("reference-close").click();

  await page.getByTestId("open-stats").click();
  await expect(page.getByTestId("final-score")).toHaveText("2–1");
  await page.screenshot({ path: `${IMG}/05-stats.png`, fullPage: true });
});
