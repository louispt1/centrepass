import { test, expect } from "@playwright/test";

test("renders the engine description computed by netball-core through WASM", async ({
  page,
}) => {
  await page.goto("/centrepass/");
  await expect(page.getByTestId("engine-description")).toHaveText(
    /NVAC taxonomy \(Mackay et al\. 2023\) — netball-core v\d+\.\d+\.\d+/,
  );
});

test("loads fully offline after one visit", async ({ page, context }) => {
  await page.goto("/centrepass/");
  await expect(page.getByTestId("engine-description")).toContainText("NVAC");
  // The service worker precaches everything at install, before it activates,
  // so `ready` means the app shell (including the WASM) is cached.
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("engine-description")).toContainText("NVAC");
});
