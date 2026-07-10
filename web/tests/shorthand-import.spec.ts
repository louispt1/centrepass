import { test, expect, type Page } from "@playwright/test";

async function fillMatchDetails(page: Page) {
  await page.goto("/centrepass/");
  await page.getByLabel("Your team").fill("Hornets U13");
  await page.getByLabel("Opposition").fill("Riverside");
  await page.getByLabel("Date").fill("2026-07-10");
}

test("pasting valid Shorthand imports a match that renders in the stat views", async ({ page }) => {
  await fillMatchDetails(page);

  // A converted centre pass for A, an opposition goal, a quarter break, then a
  // gain (by interception) converted to a second A goal. Score: A 2, B 1.
  await page.getByTestId("shorthand-input").fill("a2c 2f 1g\nb8g\nQT\na1pi 1g");
  await page.getByTestId("import-shorthand").click();

  // Lands on the stat views for the new match: score, quarter breakdown, and
  // both teams' conversion rates all derive from the imported log.
  await expect(page.getByTestId("final-score")).toHaveText("2–1");
  await expect(page.getByTestId("conversion-A-centrePass")).toHaveText("1/1 (100%)");
  await expect(page.getByTestId("conversion-A-gain")).toHaveText("1/1 (100%)");

  // An imported match carries no timestamps, so Playing Time is absent — there
  // is no Mins column anywhere, never guessed or zeroed.
  await expect(page.getByRole("columnheader", { name: "Mins" })).toHaveCount(0);
});

test("a Shorthand typo is rejected with a located message and imports nothing", async ({ page }) => {
  await fillMatchDetails(page);

  // `5g` is a shot by WD, which the model forbids; it sits on line 2.
  await page.getByTestId("shorthand-input").fill("1g\n5g");
  await page.getByTestId("import-shorthand").click();

  await expect(page.getByTestId("shorthand-error")).toContainText("Line 2");
  await expect(page.getByTestId("shorthand-error")).toContainText("column 1");

  // No partial match: the rejected transcription created nothing.
  await page.goto("/centrepass/");
  await expect(page.getByText("No matches yet.")).toBeVisible();
});
