// Tiny zero-dependency demo shop API + static files.
// State is kept per `x-session` header so parallel tests never see each other's orders.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 4173);
const PUBLIC = fileURLToPath(new URL('./public/', import.meta.url));

const PRODUCTS = [
  { id: 'kb-01', name: 'Mechanical Keyboard', price: 89 },
  { id: 'ms-02', name: 'Wireless Mouse', price: 39 },
  { id: 'hd-03', name: 'Noise-cancelling Headphones', price: 149 },
];

/** session -> { orders: [], idempotency: Map<key, order> } */
const sessions = new Map();
const sessionOf = (req) => {
  const id = req.headers['x-session'] ?? 'anonymous';
  if (!sessions.has(id)) sessions.set(id, { orders: [], idempotency: new Map() });
  return sessions.get(id);
};

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/products' && req.method === 'GET') return json(res, 200, PRODUCTS);

  if (url.pathname === '/api/orders' && req.method === 'GET') return json(res, 200, sessionOf(req).orders);

  if (url.pathname === '/api/checkout' && req.method === 'POST') {
    const s = sessionOf(req);
    const key = req.headers['idempotency-key'];
    if (key && s.idempotency.has(key)) return json(res, 200, s.idempotency.get(key)); // replay, no new charge

    const { items = [] } = await readBody(req);
    const total = items.reduce((sum, id) => sum + (PRODUCTS.find((p) => p.id === id)?.price ?? 0), 0);
    const order = { id: `ord_${s.orders.length + 1}`, items, total, chargedAt: Date.now() };
    s.orders.push(order);
    if (key) s.idempotency.set(key, order);
    return json(res, 201, order);
  }

  // static files
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  try {
    const file = await readFile(join(PUBLIC, path));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`demo shop on http://localhost:${PORT}  (?app=fragile|naive-retry|resilient)`));
