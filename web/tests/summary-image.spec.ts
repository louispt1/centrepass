import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Issue 09: one tap on a finished match renders the Summary Image and shares
// it, with a plain download as the fallback. Headless Chromium cannot share
// files, so the button falls back to a download — which is exactly what this
// test captures and inspects.

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

async function code(page: Page, position: string, action: string) {
  await page.getByTestId(`position-${position}`).click();
  await page.getByTestId(`action-${action}`).click();
}

/** Width and height read from a PNG's IHDR chunk (big-endian, offsets 16/20). */
function pngDimensions(bytes: Buffer): { width: number; height: number } {
  const signature = bytes.subarray(0, 8);
  expect([...signature]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("sharing a finished match downloads a non-trivial summary image PNG", async ({ page }) => {
  await createMatchWithRoster(page);

  // A short coded match so the image has real figures: a converted centre pass
  // (Alice scores) and an opposition reply.
  await code(page, "GA", "CentrePassReceive");
  await code(page, "WA", "Feed");
  await code(page, "GS", "Goal");
  await page.getByTestId("goal-opposition").click();
  await expect(page.getByTestId("score-team-a")).toHaveText("1");

  await page.getByTestId("open-stats").click();
  await expect(page.getByTestId("final-score")).toHaveText("1–1");

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("share-summary-image").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("Hornets U13 vs Riverside 2026-07-10.png");

  const path = await download.path();
  const bytes = await readFile(path);

  // A non-trivial bitmap: correct portrait dimensions and a real payload of
  // rendered pixels, not an empty or 1×1 canvas.
  const { width, height } = pngDimensions(bytes);
  expect(width).toBe(1080);
  expect(height).toBe(1350);
  expect(bytes.byteLength).toBeGreaterThan(3000);
});
