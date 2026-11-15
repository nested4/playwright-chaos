import { test, expect } from '@playwright/test';
import { createRng, getProfile, pickFault, profiles, resolveSeed } from '../../src';

test('same seed produces the same fault sequence', () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = Array.from({ length: 20 }, () => a());
  const seqB = Array.from({ length: 20 }, () => b());
  expect(seqA).toEqual(seqB);
  expect(new Set(seqA).size).toBe(20);
  for (const n of seqA) expect(n).toBeGreaterThanOrEqual(0), expect(n).toBeLessThan(1);
});

test('seed is stable per test id, replayable, and explorable', () => {
  expect(resolveSeed('checkout @ subway', '')).toBe(resolveSeed('checkout @ subway', ''));
  expect(resolveSeed('checkout @ subway', '')).not.toBe(resolveSeed('checkout @ calm', ''));
  expect(resolveSeed('anything', '1234')).toBe(1234);
  expect(resolveSeed('anything', 'random')).toEqual(expect.any(Number));
  expect(() => resolveSeed('anything', '-1')).toThrow(/CHAOS_SEED/);
});

test('fault picking follows profile rates in order', () => {
  const p = { name: 't', description: '', abortRate: 0.1, serverErrorRate: 0.2, ghostRate: 0.1, stallRate: 0.1 };
  expect(pickFault(p, 0.05)).toBe('abort');
  expect(pickFault(p, 0.15)).toBe('server-error');
  expect(pickFault(p, 0.35)).toBe('ghost');
  expect(pickFault(p, 0.45)).toBe('stall');
  expect(pickFault(p, 0.5)).toBe('pass');
  expect(pickFault(profiles.calm, 0)).toBe('pass');
});

test('fault rates roughly match the profile over many requests', () => {
  const rng = createRng(7);
  const profile = getProfile('black-friday');
  const counts = { 'server-error': 0, ghost: 0 } as Record<string, number>;
  for (let i = 0; i < 10_000; i++) {
    const f = pickFault(profile, rng());
    if (f in counts) counts[f]!++; // key checked by `in` above
  }
  expect(counts['server-error']! / 10_000).toBeCloseTo(0.3, 1);
  expect(counts.ghost! / 10_000).toBeCloseTo(0.2, 1);
});

test('unknown profile gives a helpful error', () => {
  expect(() => getProfile('mars')).toThrow(/Available: calm, bad-wifi/);
});
