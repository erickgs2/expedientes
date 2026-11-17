import {
  MAX_SENDS_PER_HOUR,
  codeMatches,
  decideResend,
  generateCode,
  hashCode,
  isAcceptablePassword,
  looksLikeEmail,
  normalizeEmail,
} from './email-code';

describe('email codes', () => {
  const previous = process.env.JWT_SECRET;
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });
  afterEach(() => {
    process.env.JWT_SECRET = previous;
  });

  it('generates six digits, keeping leading zeros', () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it('matches only the same code for the same scope', () => {
    const stored = hashCode('012345', 'signup:ana@clinica.mx');
    expect(codeMatches('012345', 'signup:ana@clinica.mx', stored)).toBe(true);
    expect(codeMatches('012346', 'signup:ana@clinica.mx', stored)).toBe(false);
    expect(codeMatches('012345', 'signup:otra@clinica.mx', stored)).toBe(false);
    expect(codeMatches('12345', 'signup:ana@clinica.mx', stored)).toBe(false);
    expect(codeMatches('abcdef', 'signup:ana@clinica.mx', stored)).toBe(false);
  });

  it('never stores the code itself', () => {
    expect(hashCode('123456', 'x')).not.toContain('123456');
  });
});

describe('decideResend', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('allows the first send', () => {
    expect(decideResend(null, now)).toEqual({ allowed: true, sendCount: 1, sendWindowStart: now });
  });

  it('waits a minute between sends', () => {
    const decision = decideResend({ lastSentAt: ago(20_000), sendCount: 1, sendWindowStart: ago(20_000) }, now);
    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });

  it('caps sends per hour, then opens a new window', () => {
    const capped = decideResend(
      { lastSentAt: ago(120_000), sendCount: MAX_SENDS_PER_HOUR, sendWindowStart: ago(30 * 60_000) },
      now
    );
    expect(capped).toEqual({ allowed: false, retryAfterSeconds: 30 * 60 });
    const reopened = decideResend(
      { lastSentAt: ago(120_000), sendCount: MAX_SENDS_PER_HOUR, sendWindowStart: ago(61 * 60_000) },
      now
    );
    expect(reopened).toEqual({ allowed: true, sendCount: 1, sendWindowStart: now });
  });

  it('counts sends inside the window', () => {
    const start = ago(10 * 60_000);
    expect(decideResend({ lastSentAt: ago(90_000), sendCount: 2, sendWindowStart: start }, now)).toEqual({
      allowed: true,
      sendCount: 3,
      sendWindowStart: start,
    });
  });
});

describe('input checks', () => {
  it('normalizes and loosely validates emails', () => {
    expect(normalizeEmail('  Ana@Clinica.MX ')).toBe('ana@clinica.mx');
    expect(looksLikeEmail('ana@clinica.mx')).toBe(true);
    expect(looksLikeEmail('ana@clinica')).toBe(false);
    expect(looksLikeEmail('ana clinica@x.mx')).toBe(false);
  });

  it('requires passwords of at least 10 characters', () => {
    expect(isAcceptablePassword('123456789')).toBe(false);
    expect(isAcceptablePassword('1234567890')).toBe(true);
    expect(isAcceptablePassword(undefined)).toBe(false);
  });
});
