import { test, expect, type Page } from "@playwright/test";

// A full roster so coded events land on named players and playing time (from
// live timestamps) survives the export → import round-trip.
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

/** The stat values this match should show, on both the original and the
 * re-imported copy. Keyed by test id so the assertion is identical each time. */
const EXPECTED: Record<string, string> = {
  "final-score": "2–1",
  "stat-Alice-goals": "2/2 (100%)",
  "stat-Wanda-assists": "1",
  "conversion-A-gain": "1/1 (100%)",
};

async function expectStats(page: Page) {
  await page.getByTestId("open-stats").click();
  for (const [testId, value] of Object.entries(EXPECTED)) {
    await expect(page.getByTestId(testId)).toHaveText(value);
  }
}

test("export a coded match → delete it → re-import → stats are identical", async ({ page }) => {
  await createMatchWithRoster(page);

  // A short but distinctive match: a converted centre pass, a gain off their
  // centre pass converted to a second goal, then their reply.
  await page.getByTestId("choose-team-A").click();
  await code(page, "GA", "CentrePassReceive");
  await code(page, "WA", "Feed");
  await code(page, "GS", "Goal");
  await code(page, "GA", "CentrePassReceive"); // theirs
  await page.getByTestId("position-GD").click();
  await page.getByTestId("subtype-Interception").click();
  await code(page, "GS", "Goal");
  await expect(page.getByTestId("score-team-a")).toHaveText("2");
  // Our centre pass is turned over and they score.
  await code(page, "WA", "CentrePassReceive");
  await code(page, "C", "UnforcedTurnover");
  await code(page, "GS", "Goal");
  await expect(page.getByTestId("score-team-b")).toHaveText("1");

  // Baseline: the exporting device's stats.
  await expectStats(page);

  // Export from the match list; the download is the Match File.
  await page.goto("/centrepass/");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Hornets U13 vs Riverside 2026-07-10.centrepass.json");
  const filePath = await download.path();

  // Delete the match — deletion asks for confirmation.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("No matches yet.")).toBeVisible();

  // Re-import the exported file: the match reappears.
  await page.getByTestId("import-match").setInputFiles(filePath);
  const link = page.getByRole("link", { name: /Hornets U13 vs Riverside/ });
  await expect(link).toBeVisible();

  // Every stat view shows values identical to the exporting device.
  await link.click();
  await expect(page.getByTestId("score-team-a")).toHaveText("2");
  await expectStats(page);
});

test("re-importing a match already on the device replaces it, after confirming", async ({ page }) => {
  await createMatchWithRoster(page);
  await page.getByTestId("choose-team-A").click();
  await code(page, "GA", "CentrePassReceive");
  await code(page, "GS", "Goal");
  await expect(page.getByTestId("score-team-a")).toHaveText("1");

  // Send it at 1–0, then keep coding locally: their centre pass, their goal.
  await page.getByRole("link", { name: "← Matches" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const filePath = await (await downloadPromise).path();
  await page.getByRole("link", { name: /Hornets U13 vs Riverside/ }).click();
  await expect(page.getByTestId("score-team-a")).toHaveText("1");
  await code(page, "GA", "CentrePassReceive");
  await code(page, "GS", "Goal");
  await expect(page.getByTestId("score-team-b")).toHaveText("1");

  // Importing the sent file asks first; keeping mine changes nothing.
  await page.getByRole("link", { name: "← Matches" }).click();
  await page.getByTestId("import-match").setInputFiles(filePath);
  await expect(page.getByTestId("confirm-replace")).toBeVisible();
  await page.getByRole("button", { name: "Keep mine" }).click();
  await expect(page.getByTestId("confirm-replace")).toBeHidden();

  // Replacing swaps in the file's log, with still just one match in the list.
  await page.getByTestId("import-match").setInputFiles(filePath);
  await page.getByRole("button", { name: "Replace my copy" }).click();
  await expect(page.getByRole("link", { name: /Hornets U13 vs Riverside/ })).toHaveCount(1);
  await page.getByRole("link", { name: /Hornets U13 vs Riverside/ }).click();
  await expect(page.getByTestId("score-team-a")).toHaveText("1");
  await expect(page.getByTestId("score-team-b")).toHaveText("0");
});

test("the match list marks matches changed since they were last sent", async ({ page }) => {
  await createMatchWithRoster(page);
  await page.getByTestId("choose-team-A").click();
  await code(page, "GA", "CentrePassReceive");
  await code(page, "GS", "Goal");
  await expect(page.getByTestId("score-team-a")).toHaveText("1");

  const notSent = page.getByTestId(/^not-sent-/);
  await page.getByRole("link", { name: "← Matches" }).click();
  await expect(notSent).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await downloadPromise;
  await expect(notSent).toBeHidden();

  // Any later change to the log brings the marker back.
  await page.getByRole("link", { name: /Hornets U13 vs Riverside/ }).click();
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("0");
  await page.getByRole("link", { name: "← Matches" }).click();
  await expect(notSent).toBeVisible();
});

test("a match can be renamed and deleted from the match list", async ({ page }) => {
  await createMatchWithRoster(page);

  // Rename it from the match list.
  await page.goto("/centrepass/");
  await expect(page.getByRole("link", { name: /Hornets U13 vs Riverside/ })).toBeVisible();
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByTestId(/^rename-a-/).fill("Hornets U14");
  await page.getByTestId(/^rename-b-/).fill("Lakeside");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: /Hornets U14 vs Lakeside/ })).toBeVisible();

  // Delete asks for confirmation before it removes anything.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("link", { name: /Hornets U14 vs Lakeside/ })).toBeVisible();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("No matches yet.")).toBeVisible();
});

test("importing a file with an unrecognised version is rejected with a clear message", async ({
  page,
}) => {
  await page.goto("/centrepass/");
  const future = JSON.stringify({
    version: 999,
    teamAName: "A",
    teamBName: "B",
    date: "2026-07-10",
    log: [],
  });
  await page.getByTestId("import-match").setInputFiles({
    name: "future.centrepass.json",
    mimeType: "application/json",
    buffer: Buffer.from(future),
  });
  await expect(page.getByTestId("import-error")).toContainText("version 999");
  // No partial state: the rejected file created no match.
  await expect(page.getByText("No matches yet.")).toBeVisible();
});
