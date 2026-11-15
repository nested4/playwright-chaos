// UI is identical for every variant. Only the API client differs, which is the whole point:
// the bugs chaos finds live in how you talk to the network, not in your buttons.
const params = new URLSearchParams(location.search);
const appName = params.get('app') ?? 'resilient';
const session = params.get('session') ?? crypto.randomUUID();

const { request } = await import(`/api-${appName}.js`);
const api = (path, init = {}) =>
  request(path, { ...init, headers: { 'content-type': 'application/json', 'x-session': session, ...init.headers } });

const $ = (id) => document.querySelector(`[data-testid="${id}"]`);
$('app-name').textContent = appName;

const cart = [];
const status = (text, kind) => {
  const el = $('status');
  el.hidden = false;
  el.className = kind;
  el.textContent = text;
};

try {
  const products = await api('/api/products');
  for (const p of products) {
    const li = document.createElement('li');
    li.dataset.testid = 'product';
    li.innerHTML = `<span>${p.name} — €${p.price}</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'Add to cart';
    btn.dataset.testid = `add-${p.id}`;
    btn.onclick = () => {
      cart.push(p.id);
      $('cart-count').textContent = String(cart.length);
      $('checkout').disabled = false;
    };
    li.append(btn);
    $('product-list').append(li);
  }
  $('loading').remove();
} catch (e) {
  $('loading').remove();
  status(`Could not load products: ${e.message}`, 'error');
}

$('checkout').onclick = async () => {
  $('checkout').disabled = true;
  status('Placing order…', 'loading');
  try {
    // One idempotency key per *user intent*: retries of this click reuse it.
    const order = await api('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ items: cart }),
      idempotencyKey: crypto.randomUUID(),
    });
    status(`Order ${order.id} confirmed — €${order.total}`, 'ok');
    $('orders-placed').textContent = String(Number($('orders-placed').textContent) + 1);
    cart.length = 0;
    $('cart-count').textContent = '0';
  } catch (e) {
    status(`Checkout failed: ${e.message}`, 'error');
    $('checkout').disabled = false;
  }
};
