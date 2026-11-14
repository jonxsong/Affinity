import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.AFFINITY_LIVE_URL;
if (!baseURL) throw new Error("AFFINITY_LIVE_URL is required");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "live-production.spec.ts",
  workers: 1,
  retries: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
