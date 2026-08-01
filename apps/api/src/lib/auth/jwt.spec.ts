import { issueToken, verifyToken } from './jwt';

describe('jwt', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('round-trips a payload through issueToken/verifyToken', () => {
    const token = issueToken({ sub: 'user-1', email: 'a@b.com' });
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe('user-1');
    expect(decoded.email).toBe('a@b.com');
  });

  it('throws when verifying a token signed with a different secret', () => {
    const token = issueToken({ sub: 'user-1', email: 'a@b.com' });
    process.env.JWT_SECRET = 'different-secret';
    expect(() => verifyToken(token)).toThrow();
  });

  it('throws if JWT_SECRET is not configured', () => {
    delete process.env.JWT_SECRET;
    expect(() => issueToken({ sub: 'user-1', email: 'a@b.com' })).toThrow(
      'JWT_SECRET is not configured'
    );
  });
});
