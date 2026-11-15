import type { Page, Route } from '@playwright/test';
import { createRng } from './rng';
import { pickFault, type ChaosProfile, type Fault } from './profiles';

export interface ChaosStats {
  profile: string;
  seed: number;
  requests: number;
  faults: Record<Exclude<Fault, 'pass'>, number>;
  addedLatencyMs: number;
}

export interface ChaosOptions {
  /** Which requests get chaos. Default: anything under /api/. Your HTML/JS/CSS stays untouched. */
  match?: string | RegExp;
}

export interface ChaosController {
  readonly stats: ChaosStats;
  /** Temporarily disable chaos, e.g. while seeding test data through the UI. */
  pause(): void;
  resume(): void;
  /** Run a block without chaos. */
  calm<T>(fn: () => Promise<T>): Promise<T>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The page may have given up on a request (its own timeout/abort) while we were delaying it. */
async function safely(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch {
    /* request already gone: that is the point of chaos */
  }
}

export async function installChaos(
  page: Page,
  profile: ChaosProfile,
  seed: number,
  options: ChaosOptions = {},
): Promise<ChaosController> {
  const rng = createRng(seed);
  const between = ([min, max]: [number, number]) => Math.round(min + rng() * (max - min));
  let paused = false;

  const stats: ChaosStats = {
    profile: profile.name,
    seed,
    requests: 0,
    faults: { abort: 0, 'server-error': 0, ghost: 0, stall: 0 },
    addedLatencyMs: 0,
  };

  if (profile.cpuSlowdown && page.context().browser()?.browserType().name() === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
  }

  const handler = async (route: Route) => {
    if (paused) return route.continue();
    stats.requests++;

    const fault = pickFault(profile, rng());
    const latency = profile.latencyMs ? between(profile.latencyMs) : 0;
    if (fault !== 'pass') stats.faults[fault]++;

    switch (fault) {
      case 'abort':
        await sleep(latency);
        return safely(() => route.abort('connectionreset'));

      case 'server-error':
        await sleep(latency);
        return safely(() =>
          route.fulfill({
            status: 503,
            contentType: 'application/json',
            headers: { 'x-chaos': 'server-error' },
            body: JSON.stringify({ error: 'Service Unavailable (injected by playwright-chaos)' }),
          }),
        );

      case 'ghost':
        // The server really handles the request (side effects happen!), then the response vanishes.
        await safely(async () => {
          await route.fetch();
          await sleep(latency);
          await route.abort('connectionreset');
        });
        return;

      case 'stall':
        stats.addedLatencyMs += profile.stallMs ?? 0;
        await sleep(profile.stallMs ?? 0);
        return safely(() => route.continue());

      case 'pass':
        stats.addedLatencyMs += latency;
        await sleep(latency);
        return safely(() => route.continue());
    }
  };

  await page.route(options.match ?? '**/api/**', handler);

  return {
    stats,
    pause: () => void (paused = true),
    resume: () => void (paused = false),
    async calm(fn) {
      paused = true;
      try {
        return await fn();
      } finally {
        paused = false;
      }
    },
  };
}
