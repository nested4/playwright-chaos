// ✅ Resilient: timeout + exponential backoff with jitter + idempotency key on writes.
const TIMEOUT_MS = 2500;
const MAX_ATTEMPTS = 8;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt) => Math.min(2000, 150 * 2 ** attempt) * (0.5 + Math.random() / 2);

export async function request(path, { idempotencyKey, ...init } = {}) {
  const headers = { ...init.headers, ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) };
  let lastError;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(path, { ...init, headers, signal: controller.signal });
      if (res.ok) return await res.json();
      if (!RETRYABLE_STATUS.has(res.status)) throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (e.fatal) throw e;
      lastError = e.name === 'AbortError' ? new Error(`timed out after ${TIMEOUT_MS}ms`) : e;
    } finally {
      clearTimeout(timer);
    }
    await sleep(backoff(attempt));
  }
  throw lastError;
}
