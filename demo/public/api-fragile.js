// ❌ Fragile: what most apps ship. One shot, no timeout, no retry.
export async function request(path, { idempotencyKey: _ignored, ...init } = {}) {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
