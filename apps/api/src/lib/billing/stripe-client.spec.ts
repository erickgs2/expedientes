import { encodeStripeParams } from './stripe-client';

describe('encodeStripeParams', () => {
  it('encodes nested objects and arrays the way Stripe expects', () => {
    const parts = encodeStripeParams({
      mode: 'subscription',
      line_items: [{ price: 'price_1', quantity: 1 }],
      metadata: { clinicId: 'c 1' },
      payment_method_types: ['card'],
      skip: undefined,
      none: null,
      flag: false,
    });
    expect(parts.map(decodeURIComponent)).toEqual([
      'mode=subscription',
      'line_items[0][price]=price_1',
      'line_items[0][quantity]=1',
      'metadata[clinicId]=c 1',
      'payment_method_types[0]=card',
      'flag=false',
    ]);
  });
});
