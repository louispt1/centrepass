import { test, expect } from "@playwright/test";

async function expectScore(page: import("@playwright/test").Page, teamA: number, teamB: number) {
  await expect(page.getByTestId("score-team-a")).toHaveText(String(teamA));
  await expect(page.getByTestId("score-team-b")).toHaveText(String(teamB));
}

test("create match → record goals for both teams → undo → reload → score correct", async ({
  page,
  context,
}) => {
  await page.goto("/centrepass/");

  await page.getByLabel("Your team").fill("Hornets U13");
  await page.getByLabel("Opposition").fill("Riverside");
  await page.getByLabel("Date").fill("2026-07-10");
  await page.getByRole("button", { name: "Create match" }).click();

  await expectScore(page, 0, 0);

  await page.getByTestId("position-GS").click();
  await page.getByTestId("action-Goal").click();
  await page.getByTestId("action-Goal").click();
  await page.getByTestId("goal-opposition").click();
  await expectScore(page, 2, 1);

  // Undo removes the last event (the opposition goal).
  await page.getByTestId("undo").click();
  await expectScore(page, 2, 0);

  // The persisted log carries team attribution and wall-clock timestamps.
  const storedMatches = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("centrepass");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return new Promise<
      {
        events: {
          team: string;
          action: { type: string; position: string };
          timestampMs: number | null;
        }[];
      }[]
    >((resolve, reject) => {
      const getAll = db.transaction("matches").objectStore("matches").getAll();
      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = () => reject(getAll.error);
    });
  });
  expect(storedMatches).toHaveLength(1);
  expect(storedMatches[0].events.map((event) => event.team)).toEqual(["A", "A"]);
  for (const event of storedMatches[0].events) {
    expect(event.action).toMatchObject({ type: "Goal", position: "GS" });
    expect(typeof event.timestampMs).toBe("number");
  }

  // Match, events, and score survive a reload…
  await page.reload();
  await expectScore(page, 2, 0);

  // …including offline.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expectScore(page, 2, 0);
  await context.setOffline(false);

  // The match appears in the list and can be reopened.
  await page.getByRole("link", { name: "← Matches" }).click();
  await expect(page.getByTestId("match-list")).toContainText(
    "Hornets U13 vs Riverside — 2026-07-10",
  );
  await page.getByRole("link", { name: "Hornets U13 vs Riverside — 2026-07-10" }).click();
  await expectScore(page, 2, 0);
});
