import { test, expect } from "@playwright/test";

test("a stored match from before Deflection was an action migrates on open", async ({ page }) => {
  // A blank same-origin page that doesn't run the app, so the v5 database can
  // be seeded before the app opens (and upgrades) it.
  await page.route("**/seed", (route) => route.fulfill({ contentType: "text/html", body: "" }));
  await page.goto("/centrepass/seed");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("centrepass", 5);
      open.onupgradeneeded = () => {
        open.result.createObjectStore("matches", { keyPath: "id" });
        open.result.createObjectStore("collections", { keyPath: "id" });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const event = (team: string, action: object) => ({
      kind: "Event",
      team,
      action,
      flagged: false,
      timestampMs: null,
    });
    await new Promise((resolve, reject) => {
      const put = db.transaction("matches", "readwrite").objectStore("matches").put({
        id: "legacy",
        teamAName: "Hornets",
        teamBName: "Riverside",
        date: "2026-07-10",
        createdAtMs: 0,
        log: [
          event("A", { type: "CentrePassReceive", position: "WA" }),
          event("B", { type: "Gain", position: "GK", subType: "Deflection" }),
        ],
      });
      put.onsuccess = resolve;
      put.onerror = () => reject(put.error);
    });
    db.close();
  });

  await page.goto("/centrepass/#/match/legacy");
  const strip = page.getByTestId("event-strip-item");
  await expect(strip.last()).toHaveText("GK Deflect");
  // A deflection leaves the ball with A.
  await expect(page.getByTestId("possession-banner")).toHaveAttribute("data-team", "A");
});
