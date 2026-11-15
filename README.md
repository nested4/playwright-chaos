<div align="center">

# 🐒 playwright-chaos

**Your E2E tests pass on perfect Wi‑Fi. Your users don't have perfect Wi‑Fi.**

Chaos engineering for the Playwright tests you already have.
Replay café Wi‑Fi, subway tunnels and Black Friday 503s, with the same faults on every run.

[![chaos](https://github.com/nested4/playwright-chaos/actions/workflows/chaos.yml/badge.svg)](https://github.com/nested4/playwright-chaos/actions/workflows/chaos.yml)
![Playwright](https://img.shields.io/badge/Playwright-1.65-2EAD33?logo=playwright&logoColor=white)
[![npm](https://img.shields.io/npm/v/playwright-chaos?color=cb3837&logo=npm)](https://www.npmjs.com/package/playwright-chaos)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

</div>

---

## The bug your test suite will never find

A user taps **Pay**. The server charges the card. The response is lost in a tunnel.
The app "helpfully" retries. **The customer is charged twice.**

Your CI is green, because your CI runs on a perfect network.

The demo shop in this repo has exactly that bug. Here is the same test, `loyal customer: 10 orders, exactly 10 charges`, run under the `black-friday` profile:

```
Error: every click must create exactly one charge

  expect(received).toHaveLength(expected)
  Expected length: 10
  Received length: 13
```

**13 charges for 10 orders.** No flaky selector, no timing issue. A real money bug, caught before it shipped.

## What you get

```
## 🐒 Chaos report — resilience score: 50% 🔴 fragile

| Profile          | Passed | Failed | Requests | Faults injected |
|------------------|-------:|-------:|---------:|----------------:|
| ✅ calm          |      3 |      0 |       14 |               0 |
| ❌ subway        |      2 |      1 |        6 |               1 |
| ❌ bad-wifi      |      1 |      2 |       12 |               2 |
| ✅ budget-phone  |      3 |      0 |       14 |               0 |
| ❌ black-friday  |      0 |      3 |        3 |               3 |
```

- **Drop-in.** Change one import. Every test now runs in "network weather".
- **Deterministic.** Each test gets a stable seed, so the same faults hit every run and CI doesn't turn flaky. A failing test prints its own replay command:
  ```
  🐒 Failed under chaos profile "black-friday". Replay this exact run with:
     CHAOS_SEED=1261421912 npx playwright test -g "loyal customer: 10 orders, exactly 10 charges" --project=black-friday
  ```
- **Exploration mode.** `CHAOS_SEED=random` runs with fresh faults every time. The CI workflow runs it weekly to hunt for new bugs.
- **Realistic faults, not just "make it slow".** Connection drops, 503s, 4‑second stalls, CPU throttling, and **ghost writes**: the server acts, the response vanishes.
- **Resilience report** in the terminal and the GitHub Actions job summary.

## Profiles

| Profile | Simulates | Faults |
|---|---|---|
| `calm` | Office Wi‑Fi (your current CI) | none |
| `bad-wifi` | Café Wi‑Fi | 200–1200 ms latency, 15% dropped requests |
| `subway` | Between stations | 25% drops, 15% chance of a 4 s stall |
| `black-friday` | Overloaded backend | 30% `503`, **20% ghost writes** |
| `budget-phone` | €100 Android | 6× CPU slowdown + mobile latency |

Each profile is a plain object, so you can write your own in a few lines ([`src/profiles.ts`](src/profiles.ts)).

## Quick start

```bash
npm i -D playwright-chaos
```

Works with `@playwright/test` 1.40+, in ESM and CommonJS projects. No other dependencies.

**1. Swap the import**

```ts
// before
import { test, expect } from '@playwright/test';
// after
import { test, expect } from 'playwright-chaos';
```

**2. Add one project per profile**

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import type { ChaosFixtureOptions } from 'playwright-chaos';

export default defineConfig<ChaosFixtureOptions>({
  reporter: [['list'], ['playwright-chaos/reporter']],
  projects: ['calm', 'bad-wifi', 'subway', 'black-friday'].map((name) => ({
    name,
    use: { ...devices['Desktop Chrome'], chaosProfile: name },
  })),
});
```

**3. Run**

```bash
npx playwright test                       # deterministic, CI-safe
CHAOS_SEED=random npx playwright test     # explore: new faults every run
```

Need a quiet moment, for example while seeding data through the UI?

```ts
test('admin flow', async ({ page, chaos }) => {
  await chaos.calm(() => createTestUser(page)); // no faults here
  // ...chaos is back on
});
```

By default only requests matching `**/api/**` get chaos, so your HTML, JS and CSS still load. Change it with `chaosOptions: { match: /graphql/ }`.

## The demo: one UI, three API clients

[`demo/`](demo) is a tiny zero-dependency shop. The UI is identical; only the network code differs:

| Client | Strategy | Result under chaos |
|---|---|---|
| [`api-fragile.js`](demo/public/api-fragile.js) | single `fetch`, no timeout | ❌ breaks on bad Wi‑Fi, subway and Black Friday |
| [`api-naive-retry.js`](demo/public/api-naive-retry.js) | "just retry it" | ⚠️ survives drops… **double-charges on Black Friday** |
| [`api-resilient.js`](demo/public/api-resilient.js) | timeout + backoff with jitter + `Idempotency-Key` | ✅ passes every profile |

Try it:

```bash
npm install && npx playwright install chromium
npx playwright test                    # resilient client: all green
APP=naive-retry npx playwright test    # watch the double charge get caught
APP=fragile npx playwright test        # watch everything burn
npm run demo                           # click around at http://localhost:4173/?app=fragile
```

## Testing the tester

A chaos tool that never fails anything is just a slow test run. CI proves the tool works in both directions:

- ✅ the **resilient** client must pass every profile
- ❌ the **fragile** and **naive-retry** clients must **fail**. If they pass, the build breaks ([`scripts/expect-failure.mjs`](scripts/expect-failure.mjs))

## How it works

```
browser ──fetch /api/*──▶ page.route() ──▶ seeded RNG picks a fault
                                            ├─ abort        → connection reset
                                            ├─ server-error → 503, never reaches server
                                            ├─ ghost        → route.fetch() (server acts!) then abort
                                            ├─ stall        → wait 4s, then continue
                                            └─ pass         → add latency, continue
```

No proxy and no extra process: it's built on Playwright's own `page.route`, so it works anywhere Playwright runs. CPU throttling uses the Chrome DevTools Protocol (Chromium only).

## Roadmap

- [x] npm package
- [ ] WebSocket / SSE chaos
- [ ] Offline flapping (`context.setOffline` bursts)
- [ ] Per-endpoint rules (`/api/payments` gets ghosts, `/api/search` gets latency)
- [ ] HTML report with a timeline of injected faults

Ideas and PRs welcome. If this caught a bug for you, a ⭐ helps others find it.

## License

[MIT](LICENSE)
