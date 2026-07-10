import { test, expect, type Page } from "@playwright/test";

async function createMatch(page: Page) {
  await page.goto("/centrepass/");
  await page.getByLabel("Your team").fill("Hornets U13");
  await page.getByLabel("Opposition").fill("Riverside");
  await page.getByLabel("Date").fill("2026-07-10");
  await page.getByRole("button", { name: "Create match" }).click();
  // Creating a match lands on the roster screen: setup continues with names.
  await expect(page.getByTestId("roster-GS")).toBeVisible();
}

async function expectQuarterScores(page: Page, scores: string[]) {
  for (const [index, score] of scores.entries()) {
    await expect(page.getByTestId(`quarter-score-${index + 1}`)).toContainText(score);
  }
}

test("roster → code → substitute → quarter break → per-quarter score and playing time survive reload", async ({
  page,
}) => {
  await createMatch(page);

  // An incomplete roster doesn't block: name only the shooters and save.
  await page.getByTestId("roster-GS").fill("Alice");
  await page.getByTestId("roster-GA").fill("Beth");
  await page.getByTestId("save-roster").click();
  await expect(page.getByTestId("current-quarter")).toHaveText("Q1");

  // Q1: Beth (GA) scores; a gain by the unrostered WD attributes to no one.
  await page.getByTestId("position-GA").click();
  await page.getByTestId("action-Goal").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("1");
  const strip = page.getByTestId("event-strip");
  await expect(strip).toContainText("Beth GA Goal");
  await page.getByTestId("position-WD").click();
  await page.getByTestId("action-Gain").click();
  await expect(strip.getByTestId("event-strip-item").last()).toHaveText("WD Gain");

  // Substitution: Dana takes over GA mid-quarter (completing/amending the
  // roster mid-match is the same flow). Subsequent GA events are hers.
  await page.getByTestId("open-roster").click();
  await expect(page.getByTestId("roster-GA")).toHaveValue("Beth");
  await page.getByTestId("roster-GA").fill("Dana");
  await page.getByTestId("save-roster").click();
  await expect(strip).toContainText("Dana → GA");
  await page.getByTestId("position-GA").click();
  await page.getByTestId("action-Goal").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("2");
  await expect(strip).toContainText("Dana GA Goal");

  // One tap ends the quarter; the live screen tracks the current quarter.
  await page.getByTestId("quarter-break").click();
  await expect(page.getByTestId("current-quarter")).toHaveText("Q2");

  // Q2: Alice (GS) scores, then the opposition answer.
  await page.getByTestId("position-GS").click();
  await page.getByTestId("action-Goal").click();
  await page.getByTestId("goal-opposition").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("3");
  await expect(page.getByTestId("score-team-b")).toHaveText("1");

  // The core derives the score per quarter and per-player playing time
  // (available because live entries carry timestamps).
  await page.getByTestId("match-stats").locator("summary").click();
  await expectQuarterScores(page, ["2–0", "1–1"]);
  for (const player of ["Alice", "Beth", "Dana"]) {
    await expect(page.getByTestId(`playing-time-${player}`)).toContainText(/\d+:\d\d/);
  }

  // The markers persisted as ordinary log entries…
  const kinds = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("centrepass");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return new Promise<string[]>((resolve, reject) => {
      const getAll = db.transaction("matches").objectStore("matches").getAll();
      getAll.onsuccess = () =>
        resolve(getAll.result[0].log.map((entry: { kind: string }) => entry.kind));
      getAll.onerror = () => reject(getAll.error);
    });
  });
  expect(kinds).toEqual([
    "Substitution", // Alice GS
    "Substitution", // Beth GA
    "Event",
    "Event",
    "Substitution", // Dana GA
    "Event",
    "QuarterBreak",
    "Event",
    "Event",
  ]);

  // …so everything re-derives identically after a reload.
  await page.reload();
  await expect(page.getByTestId("current-quarter")).toHaveText("Q2");
  await expect(page.getByTestId("score-team-a")).toHaveText("3");
  await expect(page.getByTestId("score-team-b")).toHaveText("1");
  await page.getByTestId("match-stats").locator("summary").click();
  await expectQuarterScores(page, ["2–0", "1–1"]);
  for (const player of ["Alice", "Beth", "Dana"]) {
    await expect(page.getByTestId(`playing-time-${player}`)).toContainText(/\d+:\d\d/);
  }

  // Undo works on markers like any entry: removing the opposition goal and
  // Alice's goal, then the break, returns the match to Q1.
  await page.getByTestId("undo").click();
  await page.getByTestId("undo").click();
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("current-quarter")).toHaveText("Q1");
  await expect(page.getByTestId("score-team-a")).toHaveText("2");
});

test("the fourth quarter break is full time and stops the quarter clock", async ({ page }) => {
  await createMatch(page);
  await page.getByTestId("save-roster").click();

  await expect(page.getByTestId("quarter-break")).toHaveText("End Q1");
  for (const next of ["Q2", "Q3", "Q4"]) {
    await page.getByTestId("quarter-break").click();
    await expect(page.getByTestId("current-quarter")).toHaveText(next);
  }
  await expect(page.getByTestId("quarter-break")).toHaveText("Full time");
  await page.getByTestId("quarter-break").click();
  await expect(page.getByTestId("current-quarter")).toHaveText("FT");
  await expect(page.getByTestId("quarter-break")).toBeDisabled();

  // Coding is still possible after full time (e.g. correcting the record),
  // and undoing the final break reopens Q4.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("current-quarter")).toHaveText("Q4");
  await expect(page.getByTestId("quarter-break")).toBeEnabled();
});
