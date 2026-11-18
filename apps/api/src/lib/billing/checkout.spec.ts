jest.mock('../prisma/client', () => ({ prismaUnscoped: {} }));

import { OXXO_CONFIGURATION_NAME, ensureOxxoConfiguration } from './checkout';

describe('ensureOxxoConfiguration', () => {
  const calls: { method: string; url: string; body?: string }[] = [];

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    calls.length = 0;
  });

  it('creates an OXXO-only configuration once, then reuses it', async () => {
    global.fetch = jest.fn(async (url: string, init: { method: string; body?: string }) => {
      calls.push({ method: init.method, url, body: init.body });
      const json = init.method === 'GET' ? { data: [] } : { id: 'pmc_1', name: OXXO_CONFIGURATION_NAME, active: true };
      return { ok: true, json: async () => json } as Response;
    }) as unknown as typeof fetch;

    expect(await ensureOxxoConfiguration()).toBe('pmc_1');
    expect(await ensureOxxoConfiguration()).toBe('pmc_1');
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST']);
    const body = decodeURIComponent(calls[1].body ?? '');
    expect(body).toContain('oxxo[display_preference][preference]=on');
    expect(body).toContain('card[display_preference][preference]=off');
  });
});
