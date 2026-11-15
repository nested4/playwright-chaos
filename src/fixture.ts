import { test as base } from '@playwright/test';
import { installChaos, type ChaosController, type ChaosOptions } from './chaos';
import { getProfile } from './profiles';
import { resolveSeed } from './rng';

export interface ChaosFixtureOptions {
  /** Profile name, usually set per Playwright project. */
  chaosProfile: string;
  chaosOptions: ChaosOptions;
}

/**
 * Drop-in replacement for Playwright's `test`.
 * Every test gets chaos automatically; use the `chaos` fixture only if you need to pause it or read stats.
 */
export const test = base.extend<{ chaos: ChaosController } & ChaosFixtureOptions>({
  chaosProfile: ['calm', { option: true }],
  chaosOptions: [{}, { option: true }],

  chaos: [
    async ({ page, chaosProfile, chaosOptions }, use, testInfo) => {
      const profile = getProfile(chaosProfile);
      const seed = resolveSeed(`${testInfo.titlePath.join(' > ')} @ ${profile.name}`);
      const controller = await installChaos(page, profile, seed, chaosOptions);

      testInfo.annotations.push({ type: 'chaos', description: `${profile.name} (seed ${seed})` });

      await use(controller);

      await testInfo.attach('chaos-stats', {
        body: JSON.stringify(controller.stats),
        contentType: 'application/json',
      });

      if (testInfo.status !== testInfo.expectedStatus) {
        console.log(
          `\n🐒 Failed under chaos profile "${profile.name}". Replay this exact run with:\n` +
            `   CHAOS_SEED=${seed} npx playwright test -g "${testInfo.title}" --project=${testInfo.project.name}\n`,
        );
      }
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
