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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173/centrepass/",
    reuseExistingServer: !process.env.CI,
  },
});
