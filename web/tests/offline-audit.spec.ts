import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Issue 10, closing audit: the complete v1 flow — create, roster, code, stats,
// export, import, Summary Image — executed with the network disabled. After one
// online visit the service worker has precached the shell and the WASM, so
// everything below runs offline against IndexedDB and netball-core alone.

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

test("the full v1 flow works with the network disabled", async ({ page, context }) => {
  // One online visit to prime the service-worker cache (shell + WASM).
  await page.goto("/centrepass/");
  await expect(page.getByTestId("engine-description")).toContainText("NVAC");
  await page.evaluate(() => navigator.serviceWorker.ready);

  // Cut the network for the remainder of the audit.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("engine-description")).toContainText("NVAC");
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  // Create a match.
  await page.getByLabel("Your team").fill("Hornets U13");
  await page.getByLabel("Opposition").fill("Riverside");
  await page.getByLabel("Date").fill("2026-07-10");
  await page.getByRole("button", { name: "Create match" }).click();

  // Enter the roster.
  for (const [position, name] of Object.entries(ROSTER)) {
    await page.getByTestId(`roster-${position}`).fill(name);
  }
  await page.getByTestId("save-roster").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("0");

  // The quick reference works offline too.
  await page.getByTestId("open-reference").click();
  await expect(page.getByTestId("reference-panel")).toBeVisible();
  await page.getByTestId("reference-close").click();

  // Code a converted centre pass and an opposition reply.
  await code(page, "GA", "CentrePassReceive");
  await code(page, "WA", "Feed");
  await code(page, "GS", "Goal");
  await page.getByTestId("goal-opposition").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("1");
  await expect(page.getByTestId("score-team-b")).toHaveText("1");

  // Stats.
  await page.getByTestId("open-stats").click();
  await expect(page.getByTestId("final-score")).toHaveText("1–1");
  await expect(page.getByTestId("stat-Alice-goals")).toHaveText("1/1 (100%)");

  // Summary Image — rendered and shared (downloaded) fully client-side.
  const imagePromise = page.waitForEvent("download");
  await page.getByTestId("share-summary-image").click();
  const image = await imagePromise;
  expect(image.suggestedFilename()).toBe("Hornets U13 vs Riverside 2026-07-10.png");
  expect((await readFile(await image.path())).byteLength).toBeGreaterThan(3000);

  // Back to the match list via in-app links (no reload needed), then export.
  await page.getByRole("link", { name: "← Live coding" }).click();
  await page.getByRole("link", { name: "← Matches" }).click();
  const exportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const exported = await exportPromise;
  const exportedPath = await exported.path();

  // Delete it, then re-import the exported file — the match returns.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("No matches yet.")).toBeVisible();

  await page.getByTestId("import-match").setInputFiles(exportedPath);
  const link = page.getByRole("link", { name: /Hornets U13 vs Riverside/ });
  await expect(link).toBeVisible();
  await link.click();
  await page.getByTestId("open-stats").click();
  await expect(page.getByTestId("final-score")).toHaveText("1–1");
});
