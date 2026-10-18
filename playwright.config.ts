import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3217);
// `pnpm demo` sets DEMO_CAPTURE=1: screenshots go to docs/demo/ and the run is recorded as video.
const capture = !!process.env.DEMO_CAPTURE;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    locale: "vi-VN",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    video: capture ? { mode: "on", size: { width: 1440, height: 900 } } : "off",
    launchOptions: {
      // WebGL for the Babylon 3D viewer in headless Chromium (software rendering).
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
      slowMo: capture ? 150 : 0,
    },
  },
  webServer: {
    // Production build: no dev overlay in the screenshots. ANTHROPIC_API_KEY is not needed, the AI call is mocked.
    command: `pnpm build && pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
