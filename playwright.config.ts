import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  projects: [
    {
      name: "chromium",
      testMatch: "**/workspace.spec.ts",
      use: { browserName: "chromium" },
    },
    {
      name: "webkit",
      testMatch: "**/webkit.spec.ts",
      use: { browserName: "webkit" },
    },
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3100",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROME
      ? { executablePath: process.env.PLAYWRIGHT_CHROME }
      : {},
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/test-server.js",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
