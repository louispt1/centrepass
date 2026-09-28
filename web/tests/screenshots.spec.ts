import { test, expect, type Page } from "@playwright/test";

// Screenshot generator for the volunteer quickstart (docs/img/). This is not
// part of the CI suite - it only runs when SCREENSHOTS=1 (via `npm run
// screenshots`) and writes PNGs into ../docs/img. Regenerate the quickstart
// images after a UI change; otherwise it is skipped.
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate quickstart images");

const IMG = "../docs/img";

const ROSTER: Record<string, string> = {
  GS: "Alice",
  GA: "Bob",
  WA: "Cara",
  C: "Dani",
  WD: "Elisa",
  GD: "Fred",
  GK: "Georgia",
};

async function code(page: Page, position: string, action: string) {
  await page.getByTestId(`position-${position}`).click();
  await page.getByTestId(`action-${action}`).click();
}

test("capture the quickstart screens", async ({ page }) => {
  await page.goto("/centrepass/");
  await page.getByLabel("Your team").fill("ANC1");
  await page.getByLabel("Opposition").fill("UNC");
  await page.getByLabel("Date").fill("2026-07-10");
  await page.screenshot({ path: `${IMG}/01-create-match.png` });

  await page.getByRole("button", { name: "Create match" }).click();
  for (const [position, name] of Object.entries(ROSTER)) {
    await page.getByTestId(`roster-${position}`).fill(name);
  }
  await page.screenshot({ path: `${IMG}/02-roster.png` });
  await page.getByTestId("save-roster").click();

  // Code a lively opening so the live screen has something to show.
  await page.getByTestId("choose-team-A").click();
  await code(page, "GA", "CentrePassReceive");
  await code(page, "WA", "Feed");
  await code(page, "GS", "Goal");
  await code(page, "GA", "CentrePassReceive"); // theirs
  await page.getByTestId("position-GD").click();
  await page.getByTestId("subtype-Interception").click();
  await code(page, "GA", "Feed");
  await code(page, "GS", "Goal");
  await expect(page.getByTestId("score-team-a")).toHaveText("2");
  await code(page, "WA", "CentrePassReceive");
  await code(page, "C", "UnforcedTurnover");
  await code(page, "GS", "Goal"); // their reply
  await page.screenshot({ path: `${IMG}/03-live-coding.png` });

  await page.getByTestId("open-reference").click();
  await expect(page.getByTestId("reference-panel")).toBeVisible();
  await page.screenshot({ path: `${IMG}/04-reference.png` });
  await page.getByTestId("reference-close").click();

  await page.getByTestId("open-stats").click();
  await expect(page.getByTestId("final-score")).toHaveText("2–1");
  await page.screenshot({ path: `${IMG}/05-stats.png`, fullPage: true });

  await page.goto("/centrepass/#/");
  await page.getByTestId("new-collection-name").fill("Autumn 2026");
  await page.getByTestId("create-collection").click();
  await page.getByRole("link", { name: "Autumn 2026" }).click();
  await page.getByText("Name and matches").click();
  await page.locator('[data-testid^="pick-match-"]').first().click();
  await expect(page.getByTestId("collection-table-0")).toBeVisible();
  await page.screenshot({ path: `${IMG}/06-collection.png`, fullPage: true });
});
