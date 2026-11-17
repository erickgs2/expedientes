import { createFailureLimiter } from './failure-limiter';

function setup(maxFailures = 3, windowMs = 1000, maxKeys?: number) {
  let t = 0;
  const limiter = createFailureLimiter({ maxFailures, windowMs, maxKeys, now: () => t });
  return { limiter, advance: (ms: number) => (t += ms) };
}

describe('createFailureLimiter', () => {
  it('allows attempts until the failure limit is reached', () => {
    const { limiter } = setup();
    limiter.recordFailure('a');
    limiter.recordFailure('a');
    expect(limiter.check('a').allowed).toBe(true);
    limiter.recordFailure('a');
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('keeps keys independent', () => {
    const { limiter } = setup(1);
    limiter.recordFailure('a');
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b').allowed).toBe(true);
  });

  it('reports how long until the oldest failure leaves the window', () => {
    const { limiter, advance } = setup(2, 10_000);
    limiter.recordFailure('a');
    advance(4_000);
    limiter.recordFailure('a');
    const blocked = limiter.check('a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(6);
  });

  it('allows again once failures age out of the window', () => {
    const { limiter, advance } = setup(2, 1000);
    limiter.recordFailure('a');
    limiter.recordFailure('a');
    expect(limiter.check('a').allowed).toBe(false);
    advance(1001);
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('clears a key on reset', () => {
    const { limiter } = setup(1);
    limiter.recordFailure('a');
    limiter.reset('a');
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('never tracks more than maxKeys keys', () => {
    const { limiter } = setup(1, 1000, 2);
    limiter.recordFailure('a');
    limiter.recordFailure('b');
    limiter.recordFailure('c'); // evicts the oldest, 'a'
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(false);
    expect(limiter.check('c').allowed).toBe(false);
  });
});
