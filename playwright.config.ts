import { defineConfig, devices } from '@playwright/test';
import type { ChaosFixtureOptions } from './src';
import { profiles } from './src/profiles';

const PORT = 4173;

export default defineConfig<ChaosFixtureOptions>({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['./src/reporter.ts']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  webServer: {
    command: `node demo/server.mjs`,
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'unit', testMatch: /unit\/.*\.spec\.ts/ },
    // One project per chaos profile: same tests, different network weather.
    ...Object.keys(profiles).map((name) => ({
      name,
      testMatch: /e2e\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], chaosProfile: name },
    })),
  ],
});
