import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/server/**'],
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 15_000,
  expect: {
    timeout: 4_000,
  },
  reporter: [['line']],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4188',
    locale: 'en-GB',
    timezoneId: 'Europe/Amsterdam',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node scripts/serve-static.mjs',
    url: 'http://127.0.0.1:4188/index.html',
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
