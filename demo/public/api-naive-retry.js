// ⚠️ Naive retry: "just retry it" — the classic fix after the first flaky-network bug report.
// Survives drops and 503s… and silently double-charges when a response is lost after the server acted.
export async function request(path, { idempotencyKey: _ignored, ...init } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(path, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw lastError;
}
