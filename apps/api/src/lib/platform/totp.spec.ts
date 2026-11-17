import { base32Decode, base32Encode, otpauthUri, stepAt, totpCode, verifyTotp } from './totp';

// RFC 6238 appendix B: the SHA-1 secret is the ASCII "12345678901234567890"; the published codes are
// 8 digits, of which a 6-digit code is the last six.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const RFC_VECTORS: Array<[number, string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
];

describe('totp', () => {
  it('round-trips base32', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('matches the RFC 6238 test vectors', () => {
    for (const [seconds, expected] of RFC_VECTORS) {
      expect(totpCode(RFC_SECRET, stepAt(new Date(seconds * 1000)))).toBe(expected.slice(-6));
    }
  });

  it('accepts one step of clock drift either way, not two', () => {
    const now = new Date(1111111111 * 1000);
    const step = stepAt(now);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now, null)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now, null)).toBeNull();
  });

  it('refuses a code already used', () => {
    const now = new Date(1111111111 * 1000);
    const step = stepAt(now);
    const code = totpCode(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, now, step - 1)).toBe(step);
  });

  it('refuses malformed codes', () => {
    expect(verifyTotp(RFC_SECRET, '12345', new Date(), null)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', new Date(), null)).toBeNull();
  });

  it('builds an otpauth URI authenticator apps read', () => {
    expect(otpauthUri('erick@intech-erp.com', 'ABC')).toBe(
      'otpauth://totp/MedCloud%3Aerick%40intech-erp.com?secret=ABC&issuer=MedCloud&digits=6&period=30'
    );
  });
});
