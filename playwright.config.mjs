import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  testMatch: '**/*.spec.mjs',
  // Hosted macOS runners take about four times longer than Linux on the
  // calibration specs; CI gets the headroom, local runs keep the tighter bound.
  timeout: process.env.CI ? 90000 : 30000,
  use: {
    headless: true,
    baseURL: 'http://localhost:9880',
    viewport: { width: 1024, height: 768 },
    actionTimeout: 10000,
  },
  webServer: {
    command: 'node tests/ui/test-server.mjs',
    port: 9880,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome Landscape',
      use: { ...devices['Pixel 5'], isLandscape: true },
    },
  ],
});
