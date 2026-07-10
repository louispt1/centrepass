import { defineConfig, devices } from "@playwright/test";

// Smoke-tests the *built* app: run `npm run build` first (CI does).
export default defineConfig({
  testDir: "./tests",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  // Phone-sized viewport: courtside one-handed phone use is the design
  // target, so every test runs against it.
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173/centrepass/",
    reuseExistingServer: !process.env.CI,
  },
});
