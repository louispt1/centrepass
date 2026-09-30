import { test, expect, type Page } from "@playwright/test";

async function createMatch(page: Page) {
  await page.goto("/centrepass/");
  await page.getByLabel("Your team").fill("Hornets U13");
  await page.getByLabel("Opposition").fill("Riverside");
  await page.getByLabel("Date").fill("2026-07-10");
  await page.getByRole("button", { name: "Create match" }).click();
  // Match setup continues with the roster; leaving it blank doesn't block.
  await page.getByTestId("save-roster").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("0");
}

test("codes both teams, with possession deciding each tap's team", async ({ page }) => {
  await createMatch(page);
  const banner = page.getByTestId("possession-banner");

  // Nobody has the ball until the toss is coded: the first centre pass is A's.
  await expect(banner).toContainText("Who has the centre pass?");
  await page.getByTestId("choose-team-A").click();
  await expect(banner).toHaveAttribute("data-team", "A");

  // A's centre pass: GA receive → WA feed → GA goal.
  await page.getByTestId("position-GA").click();
  await page.getByTestId("action-CentrePassReceive").click();
  await page.getByTestId("position-WA").click();
  await page.getByTestId("action-Feed").click();
  await page.getByTestId("position-GA").click();
  await page.getByTestId("action-Goal").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("1");

  // Centre passes alternate: B's turn, and B score it.
  await expect(banner).toHaveAttribute("data-team", "B");
  await page.getByTestId("action-CentrePassReceive").click();
  await page.getByTestId("action-Goal").click();
  await expect(page.getByTestId("score-team-b")).toHaveText("1");
  await expect(banner).toHaveAttribute("data-team", "A");

  // A's C feed goes astray (Failed, tapped after the action). A Gain is
  // always by the team out of possession, so B's WD intercepts with no flip.
  await page.getByTestId("position-C").click();
  await page.getByTestId("action-Feed").click();
  await page.getByTestId("toggle-failed").click();
  await expect(page.getByTestId("toggle-failed")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("position-WD").click();
  await expect(page.getByTestId("subtype-Interception")).toHaveAttribute("data-team", "B");
  await page.getByTestId("subtype-Interception").click();
  await expect(page.getByTestId("toggle-failed")).toBeDisabled();
  await expect(banner).toHaveAttribute("data-team", "B");

  // B's C turns it over; A's GS misses, rebounds, and scores.
  await page.getByTestId("position-C").click();
  await page.getByTestId("action-UnforcedTurnover").click();
  await expect(banner).toHaveAttribute("data-team", "A");
  await page.getByTestId("position-GS").click();
  await page.getByTestId("action-Goal").click();
  await page.getByTestId("toggle-failed").click();
  await expect(page.getByTestId("action-Rebound")).toHaveAttribute("data-team", "A");
  await page.getByTestId("action-Rebound").click();
  await page.getByTestId("action-Goal").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("2");

  // B's centre pass is next; a GK infringement is by the team out of
  // possession (A) and does not move the ball. Flagged for review.
  await expect(banner).toHaveAttribute("data-team", "B");
  await page.getByTestId("position-GK").click();
  await page.getByTestId("action-Infringement").click();
  await page.getByTestId("toggle-flagged").click();
  await expect(banner).toHaveAttribute("data-team", "B");

  // The strip shows the last few events, each in its team's colour.
  const strip = page.getByTestId("event-strip");
  const items = strip.getByTestId("event-strip-item");
  await expect(items).toHaveCount(4);
  await expect(strip).toContainText("GS Goal ✕");
  await expect(strip).toContainText("GS Reb");
  await expect(strip).toContainText("GK Inf ⚑");
  await expect(items.last()).toHaveAttribute("data-team", "A");

  // The full log crossed into IndexedDB with teams, modifiers and sub-type.
  const events = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("centrepass");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return new Promise<
      {
        kind: string;
        team: string;
        flagged: boolean;
        timestampMs: number | null;
        action: Record<string, unknown>;
      }[]
    >((resolve, reject) => {
      const getAll = db.transaction("matches").objectStore("matches").getAll();
      getAll.onsuccess = () => resolve(getAll.result[0].log);
      getAll.onerror = () => reject(getAll.error);
    });
  });
  expect(events.every((event) => event.kind === "Event")).toBe(true);
  expect(events.map((event) => `${event.team} ${event.action.type}`)).toEqual([
    "A CentrePassReceive",
    "A Feed",
    "A Goal",
    "B CentrePassReceive",
    "B Goal",
    "A Feed",
    "B Gain",
    "B UnforcedTurnover",
    "A Goal",
    "A Rebound",
    "A Goal",
    "A Infringement",
  ]);
  expect(events[3].action).toEqual({ type: "CentrePassReceive", position: "GA" });
  expect(events[5].action).toMatchObject({ type: "Feed", position: "C", failed: true });
  expect(events[6].action).toMatchObject({ position: "WD", subType: "Interception" });
  expect(events[8].action).toMatchObject({ type: "Goal", position: "GS", failed: true });
  expect(events[11]).toMatchObject({ flagged: true, action: { type: "Infringement" } });
  for (const event of events) expect(typeof event.timestampMs).toBe("number");

  // Undo removes the infringement and leaves the score untouched.
  await page.getByTestId("undo").click();
  await expect(strip).not.toContainText("GK Inf");
  await expect(page.getByTestId("score-team-a")).toHaveText("2");
  await expect(page.getByTestId("score-team-b")).toHaveText("1");
});

test("the possession flip overrides one tap only", async ({ page }) => {
  await createMatch(page);
  const banner = page.getByTestId("possession-banner");
  await page.getByTestId("choose-team-A").click();
  await page.getByTestId("position-WA").click();
  await page.getByTestId("action-CentrePassReceive").click();

  // A has the ball; flip so a WD infringement is coded for A's own WD.
  await page.getByTestId("flip-possession").click();
  await expect(banner).toHaveAttribute("data-team", "B");
  await page.getByTestId("position-WD").click();
  await expect(page.getByTestId("action-Infringement")).toHaveAttribute("data-team", "A");
  await page.getByTestId("action-Infringement").click();

  // The flip is spent: the derivation is back in charge.
  await expect(banner).toHaveAttribute("data-team", "A");
  await expect(page.getByTestId("flip-possession")).toHaveAttribute("aria-pressed", "false");
});

test("never offers a position/action combination the core would reject", async ({ page }) => {
  await createMatch(page);

  // No position selected yet: nothing recordable.
  await expect(page.getByTestId("action-Goal")).toBeDisabled();
  await expect(page.getByTestId("subtype-Interception")).toBeDisabled();

  // Nor before anyone has the ball.
  await page.getByTestId("position-WD").click();
  await expect(page.getByTestId("action-Feed")).toBeDisabled();
  await page.getByTestId("choose-team-A").click();

  // WD can receive a centre pass, feed, and gain, but never shoot or rebound.
  await expect(page.getByTestId("action-Goal")).toBeDisabled();
  await expect(page.getByTestId("action-Feed")).toBeEnabled();
  await expect(page.getByTestId("action-Rebound")).toBeDisabled();
  await expect(page.getByTestId("action-CentrePassReceive")).toBeEnabled();
  await expect(page.getByTestId("action-Deflection")).toBeEnabled();

  // TEAM events exist only where the action isn't inherently individual -
  // plus Goal, which covers a goal whose shooter isn't coded.
  await page.getByTestId("position-TEAM").click();
  await expect(page.getByTestId("action-Feed")).toBeDisabled();
  await expect(page.getByTestId("action-CentrePassReceive")).toBeDisabled();
  await expect(page.getByTestId("action-Rebound")).toBeDisabled();
  await expect(page.getByTestId("action-Goal")).toBeEnabled();
  await expect(page.getByTestId("action-UnforcedTurnover")).toBeEnabled();

  // GK is the one position that cannot feed.
  await page.getByTestId("position-GK").click();
  await expect(page.getByTestId("action-Feed")).toBeDisabled();

  // Failed and Flag act on the last event, so they are off with no events;
  // Failed stays off for a Gain, Flag does not.
  await expect(page.getByTestId("toggle-failed")).toBeDisabled();
  await expect(page.getByTestId("toggle-flagged")).toBeDisabled();
  await page.getByTestId("subtype-PickUp").click();
  await expect(page.getByTestId("toggle-failed")).toBeDisabled();
  await expect(page.getByTestId("toggle-flagged")).toBeEnabled();
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
  await expect(page.getByRole("heading", { name: "Matches" })).toBeVisible();
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
    "choose-team-A",
    "undo",
    "quarter-break",
    "open-roster",
  ]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.height, id).toBeGreaterThanOrEqual(44);
    expect(box!.width, id).toBeGreaterThanOrEqual(44);
  }
});
