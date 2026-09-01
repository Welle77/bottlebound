import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://127.0.0.1:4174",
    browserName: "chromium",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "tablet", use: { ...devices["Galaxy Tab S4"] } },
  ],
  webServer: {
    command:
      "pnpm run build && pnpm exec vite preview --host 127.0.0.1 --port 4174",
    port: 4174,
    reuseExistingServer: false,
  },
});
