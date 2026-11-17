import type { NextRequest } from 'next/server';
import { getClientIp } from './login-throttle';

// A minimal stand-in: the api suite runs under jsdom, which has no Fetch `Headers` class.
function requestWith(headers: Record<string, string>): NextRequest {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (name: string) => lower[name.toLowerCase()] ?? null } } as unknown as NextRequest;
}

describe('getClientIp', () => {
  const original = process.env.TRUSTED_CLIENT_IP_HEADER;

  afterEach(() => {
    if (original === undefined) delete process.env.TRUSTED_CLIENT_IP_HEADER;
    else process.env.TRUSTED_CLIENT_IP_HEADER = original;
  });

  it('uses the first X-Forwarded-For entry when no trusted header is configured', () => {
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    const ip = getClientIp(
      requestWith({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'cf-connecting-ip': '198.51.100.9' })
    );
    expect(ip).toBe('203.0.113.7');
  });

  it('ignores a client-sent CF-Connecting-IP unless the deployment trusts it', () => {
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    expect(getClientIp(requestWith({ 'cf-connecting-ip': '198.51.100.9' }))).toBe('unknown');
  });

  it('prefers the configured trusted header over X-Forwarded-For', () => {
    process.env.TRUSTED_CLIENT_IP_HEADER = 'CF-Connecting-IP';
    const ip = getClientIp(
      requestWith({ 'x-forwarded-for': '1.2.3.4', 'cf-connecting-ip': '198.51.100.9' })
    );
    expect(ip).toBe('198.51.100.9');
  });

  it('falls back to X-Forwarded-For when the trusted header is missing', () => {
    process.env.TRUSTED_CLIENT_IP_HEADER = 'cf-connecting-ip';
    expect(getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
  });
});
