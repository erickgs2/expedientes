import { normalizeExpiryToMonthEnd } from './product-expiry';

describe('normalizeExpiryToMonthEnd', () => {
  it('returns null for an empty value', () => {
    expect(normalizeExpiryToMonthEnd('')).toBeNull();
  });

  it('moves a mid-month date to the last day of that month', () => {
    expect(normalizeExpiryToMonthEnd('2027-05-14')?.toISOString()).toBe(
      '2027-05-31T23:59:59.999Z'
    );
  });

  it('leaves an already month-end date on the same day', () => {
    expect(normalizeExpiryToMonthEnd('2027-05-31')?.toISOString()).toBe(
      '2027-05-31T23:59:59.999Z'
    );
  });

  it('handles February in a leap year', () => {
    expect(normalizeExpiryToMonthEnd('2028-02-03')?.toISOString()).toBe(
      '2028-02-29T23:59:59.999Z'
    );
  });

  it('handles February in a common year', () => {
    expect(normalizeExpiryToMonthEnd('2027-02-03')?.toISOString()).toBe(
      '2027-02-28T23:59:59.999Z'
    );
  });

  it('handles December without rolling into the next year', () => {
    expect(normalizeExpiryToMonthEnd('2027-12-01')?.toISOString()).toBe(
      '2027-12-31T23:59:59.999Z'
    );
  });

  it('accepts a full ISO timestamp', () => {
    expect(normalizeExpiryToMonthEnd('2027-05-14T09:30:00.000Z')?.toISOString()).toBe(
      '2027-05-31T23:59:59.999Z'
    );
  });

  it('throws on an unparseable value', () => {
    expect(() => normalizeExpiryToMonthEnd('not-a-date')).toThrow();
  });
});
