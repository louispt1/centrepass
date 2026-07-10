import { test, expect, type Page } from "@playwright/test";

async function createMatch(page: Page) {
  await page.goto("/centrepass/");
  await page.getByLabel("Your team").fill("Hornets U13");
  await page.getByLabel("Opposition").fill("Riverside");
  await page.getByLabel("Date").fill("2026-07-10");
  await page.getByRole("button", { name: "Create match" }).click();
  await expect(page.getByTestId("score-team-a")).toHaveText("0");
}

test("codes a realistic multi-possession sequence with modifiers and a Gain sub-type", async ({
  page,
}) => {
  await createMatch(page);

  // Possession 1, our centre pass: GA receive → WA feed → GA goal.
  await page.getByTestId("position-GA").click();
  await page.getByTestId("action-CentrePassReceive").click();
  await page.getByTestId("position-WA").click();
  await page.getByTestId("action-Feed").click();
  await page.getByTestId("position-GA").click();
  await page.getByTestId("action-Goal").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("1");

  // Opposition score their centre pass.
  await page.getByTestId("goal-opposition").click();
  await expect(page.getByTestId("score-team-b")).toHaveText("1");

  // Possession 2: C feed goes astray (Failed), WD intercepts it straight
  // back, GS misses the shot (Failed), rebounds, and scores.
  await page.getByTestId("toggle-failed").click();
  await page.getByTestId("position-C").click();
  await page.getByTestId("action-Feed").click();
  await page.getByTestId("position-WD").click();
  await page.getByTestId("subtype-Interception").click();
  await page.getByTestId("toggle-failed").click();
  await page.getByTestId("position-GS").click();
  await page.getByTestId("action-Goal").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("1");
  await page.getByTestId("action-Rebound").click();
  await page.getByTestId("action-Goal").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("2");

  // A GK infringement the coder wants to review later (Flagged).
  await page.getByTestId("toggle-flagged").click();
  await page.getByTestId("position-GK").click();
  await page.getByTestId("action-Infringement").click();

  // The strip shows the last few events for spot-checking, newest included.
  const strip = page.getByTestId("event-strip");
  await expect(strip.getByTestId("event-strip-item")).toHaveCount(4);
  await expect(strip).toContainText("GS Goal ✕");
  await expect(strip).toContainText("GS Reb");
  await expect(strip).toContainText("GS Goal");
  await expect(strip).toContainText("GK Inf ⚑");

  // The full log crossed into IndexedDB with modifiers and sub-type intact.
  const events = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("centrepass");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return new Promise<
      {
        team: string;
        flagged: boolean;
        timestampMs: number | null;
        action: Record<string, unknown>;
      }[]
    >((resolve, reject) => {
      const getAll = db.transaction("matches").objectStore("matches").getAll();
      getAll.onsuccess = () => resolve(getAll.result[0].events);
      getAll.onerror = () => reject(getAll.error);
    });
  });
  expect(events.map((event) => event.action.type)).toEqual([
    "CentrePassReceive",
    "Feed",
    "Goal",
    "Goal",
    "Feed",
    "Gain",
    "Goal",
    "Rebound",
    "Goal",
    "Infringement",
  ]);
  expect(events[3]).toMatchObject({
    team: "B",
    action: { type: "Goal", position: "TEAM", failed: false },
  });
  expect(events[4].action).toMatchObject({ type: "Feed", position: "C", failed: true });
  expect(events[5].action).toMatchObject({
    type: "Gain",
    position: "WD",
    subType: "Interception",
  });
  expect(events[6].action).toMatchObject({ type: "Goal", position: "GS", failed: true });
  expect(events[9]).toMatchObject({ flagged: true, action: { type: "Infringement" } });
  for (const event of events) expect(typeof event.timestampMs).toBe("number");

  // Undo works across event types: removing the infringement leaves the
  // score untouched and the strip re-renders from the shortened log.
  await page.getByTestId("undo").click();
  await expect(strip).not.toContainText("GK Inf");
  await expect(page.getByTestId("score-team-a")).toHaveText("2");
  await expect(page.getByTestId("score-team-b")).toHaveText("1");
});

test("never offers a position/action combination the core would reject", async ({ page }) => {
  await createMatch(page);

  // No position selected yet: nothing recordable.
  await expect(page.getByTestId("action-Goal")).toBeDisabled();
  await expect(page.getByTestId("action-Gain")).toBeDisabled();

  // WD can receive a centre pass and gain, but never shoot, feed, or rebound.
  await page.getByTestId("position-WD").click();
  await expect(page.getByTestId("action-Goal")).toBeDisabled();
  await expect(page.getByTestId("action-Feed")).toBeDisabled();
  await expect(page.getByTestId("action-Rebound")).toBeDisabled();
  await expect(page.getByTestId("action-CentrePassReceive")).toBeEnabled();
  await expect(page.getByTestId("subtype-Deflection")).toBeEnabled();

  // TEAM events exist only where the action isn't inherently individual —
  // plus Goal, which covers un-attributed (opposition) goals.
  await page.getByTestId("position-TEAM").click();
  await expect(page.getByTestId("action-Feed")).toBeDisabled();
  await expect(page.getByTestId("action-CentrePassReceive")).toBeDisabled();
  await expect(page.getByTestId("action-Rebound")).toBeDisabled();
  await expect(page.getByTestId("action-Goal")).toBeEnabled();
  await expect(page.getByTestId("action-UnforcedTurnover")).toBeEnabled();

  // The Failed modifier only applies where failure is meaningful.
  await page.getByTestId("position-GK").click();
  await expect(page.getByTestId("action-Infringement")).toBeEnabled();
  await page.getByTestId("toggle-failed").click();
  await expect(page.getByTestId("action-Infringement")).toBeDisabled();
  await expect(page.getByTestId("action-Gain")).toBeDisabled();
  await page.getByTestId("position-GS").click();
  await expect(page.getByTestId("action-Goal")).toBeEnabled();
});

test("holds a screen wake lock during coding and releases it after", async ({ page }) => {
  // Stub the Wake Lock API so the test observes our request/release calls
  // deterministically, independent of headless-browser support.
  await page.addInitScript(() => {
    const counters = { requests: 0, releases: 0 };
    (window as unknown as { __wakeLock: typeof counters }).__wakeLock = counters;
    navigator.wakeLock.request = async () => {
      counters.requests += 1;
      return {
        released: false,
        type: "screen",
        release: async () => {
          counters.releases += 1;
        },
        onrelease: null,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      } as unknown as WakeLockSentinel;
    };
  });

  await createMatch(page);
  const counters = () =>
    page.evaluate(
      () => (window as unknown as { __wakeLock: { requests: number; releases: number } }).__wakeLock,
    );

  await expect.poll(async () => (await counters()).requests).toBeGreaterThan(0);
  expect((await counters()).releases).toBe(0);

  // Leaving the live screen releases the lock.
  await page.getByRole("link", { name: "← Matches" }).click();
  await expect(page.getByTestId("match-list")).toBeVisible();
  await expect.poll(async () => (await counters()).releases).toBe((await counters()).requests);
});

test("live screen fits a phone viewport with one-hand-sized tap targets", async ({ page }) => {
  await createMatch(page);

  // No horizontal scrolling on a phone.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);

  // Every coding control meets the ~44px minimum tap-target height.
  for (const id of [
    "position-GS",
    "position-TEAM",
    "action-Goal",
    "action-CentrePassReceive",
    "subtype-PickUp",
    "toggle-failed",
    "goal-opposition",
    "undo",
  ]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.height, id).toBeGreaterThanOrEqual(44);
    expect(box!.width, id).toBeGreaterThanOrEqual(44);
  }
});
