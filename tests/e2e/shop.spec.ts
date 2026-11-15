import { randomUUID } from 'node:crypto';
import { test, expect } from '../../src';

// Which API client the demo shop uses: fragile | naive-retry | resilient
const APP = process.env.APP ?? 'resilient';

test.describe(`shop (${APP} client)`, () => {
  let session: string;

  test.beforeEach(async ({ page }) => {
    session = randomUUID();
    await page.goto(`/?app=${APP}&session=${session}`);
  });

  test('shopper sees the catalogue', async ({ page }) => {
    await expect(page.getByTestId('product')).toHaveCount(3);
  });

  test('shopper can check out', async ({ page }) => {
    await page.getByTestId('add-kb-01').click();
    await page.getByTestId('add-ms-02').click();
    await page.getByTestId('checkout').click();

    await expect(page.getByTestId('status')).toHaveText(/Order ord_\d+ confirmed — €128/);
  });

  test('loyal customer: 10 orders, exactly 10 charges', async ({ page, request }) => {
    for (let i = 1; i <= 10; i++) {
      await page.getByTestId('add-hd-03').click();
      await page.getByTestId('checkout').click();
      await expect(page.getByTestId('orders-placed')).toHaveText(String(i));
    }

    // Ask the backend directly (not through the chaotic browser network) what really happened.
    const orders = await (await request.get('/api/orders', { headers: { 'x-session': session } })).json();
    expect(orders, 'every click must create exactly one charge').toHaveLength(10);
  });
});
