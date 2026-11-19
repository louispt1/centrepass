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
  // Courtside one-handed phone use is the design target; the iPad projects
  // run on WebKit (Safari's engine), and landscape catches rotation.
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "ipad-webkit", use: { ...devices["iPad (gen 7)"] } },
    { name: "ipad-webkit-landscape", use: { ...devices["iPad (gen 7) landscape"] } },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173/centrepass/",
    reuseExistingServer: !process.env.CI,
  },
});
