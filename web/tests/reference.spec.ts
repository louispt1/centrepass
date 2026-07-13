import { test, expect, type Page } from "@playwright/test";

// Issue 10: the quick reference opens from the live coding screen and returns
// without losing coding state. It is an overlay, so the live screen stays
// mounted and the selected position, toggles, and in-progress log survive.

async function createMatch(page: Page) {
  await page.goto("/centrepass/");
  await page.getByLabel("Your team").fill("Hornets U13");
  await page.getByLabel("Opposition").fill("Riverside");
  await page.getByLabel("Date").fill("2026-07-10");
  await page.getByRole("button", { name: "Create match" }).click();
  await page.getByTestId("save-roster").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("0");
}

test("the reference opens from live coding and shows core-derived definitions", async ({ page }) => {
  await createMatch(page);

  await page.getByTestId("open-reference").click();
  const panel = page.getByTestId("reference-panel");
  await expect(panel).toBeVisible();

  // Positions, actions, and modifiers are all present.
  await expect(page.getByTestId("reference-position-GS")).toContainText("Goal Shooter");
  // Action rows come from the same netball-core definitions that generate
  // DEFINITIONS.md — e.g. the Centre Pass Receive and its NVAC-derived text.
  await expect(page.getByTestId("reference-row-Centre Pass Receive")).toContainText("centre pass");
  await expect(page.getByTestId("reference-row-Goal Assist")).toContainText("derived");
  // Modifiers.
  await expect(page.getByTestId("reference-row-Failed")).toContainText("unsuccessful");
  await expect(page.getByTestId("reference-row-Flagged")).toBeVisible();
});

test("opening and closing the reference does not lose coding state", async ({ page }) => {
  await createMatch(page);

  // Establish coding state: a selected position, the Failed toggle on, and one
  // event already in the log.
  await page.getByTestId("position-GA").click();
  await page.getByTestId("action-CentrePassReceive").click();
  await page.getByTestId("position-GS").click();
  await page.getByTestId("toggle-failed").click();
  await expect(page.getByTestId("position-GS")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("toggle-failed")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("event-strip")).toContainText("CPR");

  // Open the reference and return.
  await page.getByTestId("open-reference").click();
  await expect(page.getByTestId("reference-panel")).toBeVisible();
  await page.getByTestId("reference-close").click();
  await expect(page.getByTestId("reference-panel")).toHaveCount(0);

  // Every piece of coding state survived.
  await expect(page.getByTestId("position-GS")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("toggle-failed")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("event-strip")).toContainText("CPR");

  // And the still-armed Failed shot records as a miss, proving the toggle was
  // truly live, not merely re-rendered.
  await page.getByTestId("action-Goal").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("0");
});
