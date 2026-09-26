import { test, expect } from "@playwright/test";

// The app renders only once the WASM engine has loaded (main.tsx), so the
// heading showing proves netball-core is running.

test("loads fully offline after one visit", async ({ page, context }) => {
  await page.goto("/centrepass/");
  await expect(page.getByRole("heading", { name: "CentrePass" })).toBeVisible();
  // The service worker precaches everything at install, before it activates,
  // so `ready` means the app shell (including the WASM) is cached.
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "CentrePass" })).toBeVisible();
});

test("the how-to starts collapsed and explains per-browser storage", async ({ page }) => {
  await page.goto("/centrepass/");
  const howTo = page.getByTestId("how-to");
  await expect(howTo).not.toHaveAttribute("open");
  await howTo.getByText("How to use this app").click();
  await expect(howTo).toHaveAttribute("open", "");
  await expect(howTo).toContainText("Failed ✕");
  await expect(howTo).toContainText("this browser on this device only");
});
