import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', actionTimeout: 10_000 },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:4174' } },
  ],
  webServer: [4173, 4174].map((port) => ({
    command: 'npm run start',
    env: { HOST: '127.0.0.1', PORT: String(port), ALLOWED_HOSTS: '127.0.0.1,localhost' },
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  })),
});
