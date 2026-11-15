/**
 * Seeded randomness so every chaos run is reproducible.
 * Same seed -> same faults -> same failure. No more "works on my machine".
 */

/** mulberry32: tiny, fast, good-enough PRNG for test fault injection. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash, used to derive a stable seed from a test's identity. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Resolve the seed for a test.
 * - CHAOS_SEED unset    -> stable seed derived from the test id (deterministic CI)
 * - CHAOS_SEED=random   -> fresh seed every run (exploration mode)
 * - CHAOS_SEED=<number> -> replay an exact run
 */
export function resolveSeed(testId: string, env: string | undefined = process.env.CHAOS_SEED): number {
  if (env === undefined || env === '') return hashString(testId);
  if (env === 'random') return Math.floor(Math.random() * 2 ** 32);
  const n = Number(env);
  if (!Number.isInteger(n) || n < 0) throw new Error(`CHAOS_SEED must be a non-negative integer or "random", got "${env}"`);
  return n >>> 0;
}
