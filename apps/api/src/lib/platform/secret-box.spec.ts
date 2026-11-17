import { openSecret, sealSecret } from './secret-box';

describe('secret box', () => {
  const previous = { jwt: process.env.JWT_SECRET, key: process.env.PLATFORM_SECRET_KEY };
  beforeEach(() => {
    process.env.JWT_SECRET = 'jwt-secret';
    delete process.env.PLATFORM_SECRET_KEY;
  });
  afterEach(() => {
    process.env.JWT_SECRET = previous.jwt;
    if (previous.key === undefined) delete process.env.PLATFORM_SECRET_KEY;
    else process.env.PLATFORM_SECRET_KEY = previous.key;
  });

  it('round-trips and never stores the plain text', () => {
    const sealed = sealSecret('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(openSecret(sealed)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a fresh nonce each time', () => {
    expect(sealSecret('x')).not.toBe(sealSecret('x'));
  });

  it('cannot be opened with another key, or after tampering', () => {
    const sealed = sealSecret('secret');
    process.env.PLATFORM_SECRET_KEY = 'other';
    expect(() => openSecret(sealed)).toThrow();
    delete process.env.PLATFORM_SECRET_KEY;
    const parts = sealed.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => openSecret(parts.join(':'))).toThrow();
  });
});
