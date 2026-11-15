/**
 * A chaos profile describes what the network does to your app.
 * All rates are probabilities per matched request (0..1) and are checked in order:
 * abort -> serverError -> ghost -> stall -> (latency + pass through).
 */
export interface ChaosProfile {
  name: string;
  description: string;
  /** Added latency range in ms for every request that gets through. */
  latencyMs?: [min: number, max: number];
  /** Connection drops before the request reaches the server. */
  abortRate?: number;
  /** Server answers 503 Service Unavailable. */
  serverErrorRate?: number;
  /**
   * "Ghost write": the server processes the request, but the response is lost on the way back.
   * This is the fault that turns a naive retry into a double charge.
   */
  ghostRate?: number;
  /** Request hangs for `stallMs` before going through (think: tunnel). */
  stallRate?: number;
  stallMs?: number;
  /** CPU slowdown multiplier (Chromium only), e.g. 6 = budget Android phone. */
  cpuSlowdown?: number;
}

export const profiles = {
  calm: {
    name: 'calm',
    description: 'Office Wi-Fi. The only network your tests have ever seen.',
  },
  'bad-wifi': {
    name: 'bad-wifi',
    description: 'Café Wi-Fi: slow, jittery, drops ~15% of requests.',
    latencyMs: [200, 1200],
    abortRate: 0.15,
  },
  subway: {
    name: 'subway',
    description: 'Between stations: frequent drops and 4s stalls.',
    latencyMs: [100, 800],
    abortRate: 0.25,
    stallRate: 0.15,
    stallMs: 4000,
  },
  'black-friday': {
    name: 'black-friday',
    description: 'Overloaded backend: 503 bursts and lost responses after the server already acted.',
    latencyMs: [300, 900],
    serverErrorRate: 0.3,
    ghostRate: 0.2,
  },
  'budget-phone': {
    name: 'budget-phone',
    description: '6x CPU slowdown plus mobile latency.',
    latencyMs: [300, 600],
    cpuSlowdown: 6,
  },
} as const satisfies Record<string, ChaosProfile>;

export type ProfileName = keyof typeof profiles;

export function getProfile(name: string): ChaosProfile {
  const p = (profiles as Record<string, ChaosProfile>)[name];
  if (!p) throw new Error(`Unknown chaos profile "${name}". Available: ${Object.keys(profiles).join(', ')}`);
  return p;
}

export type Fault = 'abort' | 'server-error' | 'ghost' | 'stall' | 'pass';

/** Pure decision function: given a random draw, which fault hits this request? */
export function pickFault(profile: ChaosProfile, roll: number): Fault {
  let edge = 0;
  const steps: Array<[Fault, number | undefined]> = [
    ['abort', profile.abortRate],
    ['server-error', profile.serverErrorRate],
    ['ghost', profile.ghostRate],
    ['stall', profile.stallRate],
  ];
  for (const [fault, rate] of steps) {
    edge += rate ?? 0;
    if (roll < edge) return fault;
  }
  return 'pass';
}
