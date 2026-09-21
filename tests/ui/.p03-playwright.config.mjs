// P03-only Playwright config: reuse the test-server already running on :9880.
// This avoids the webServer auto-start hang under PowerShell 5.1 pipes.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  testMatch: '**/fader-tracking.spec.mjs',
  timeout: 30000,
  use: {
    headless: true,
    baseURL: 'http://localhost:9880',
    viewport: { width: 1024, height: 768 },
    actionTimeout: 10000,
  },
  projects: [
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome Landscape', use: { ...devices['Pixel 5'], isLandscape: true } },
  ],
});
