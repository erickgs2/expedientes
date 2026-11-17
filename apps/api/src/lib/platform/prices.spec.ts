import { annualCentsFor, validateNewPrice } from './prices';
import { ApiProblem } from '../http/api-problem';

describe('prices', () => {
  it('computes the annual price rounded to whole pesos', () => {
    expect(annualCentsFor(15000, 15)).toBe(153000);
    expect(annualCentsFor(19900, 15)).toBe(203000); // 2,029.80 → 2,030
    expect(annualCentsFor(15000, 0)).toBe(180000);
  });

  it('accepts a valid price', () => {
    expect(validateNewPrice({ monthlyCents: 17900, annualDiscountPercent: 20 })).toEqual({
      monthlyCents: 17900,
      annualDiscountPercent: 20,
      annualCents: 171800,
    });
  });

  it('keeps prices payable with OXXO and discounts sane', () => {
    const bad = [
      { monthlyCents: 999, annualDiscountPercent: 10 },
      { monthlyCents: 15000, annualDiscountPercent: 51 },
      { monthlyCents: 15000, annualDiscountPercent: -1 },
      { monthlyCents: 15000.5, annualDiscountPercent: 10 },
      { monthlyCents: 100000, annualDiscountPercent: 0 }, // 12,000 MXN a year
    ];
    for (const input of bad) expect(() => validateNewPrice(input)).toThrow(ApiProblem);
  });
});
