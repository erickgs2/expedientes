import { grantEndDate, isValidGrantMonths, zonedTime } from './grant-dates';

const MX = 'America/Mexico_City';

describe('grantEndDate', () => {
  it('ends the same day N months later at 23:59:59 local time', () => {
    // 17 Nov 2026, 10:00 in Mexico City (UTC-6).
    const start = new Date('2026-11-17T16:00:00Z');
    expect(grantEndDate(start, 12, MX).toISOString()).toBe('2027-11-18T05:59:59.000Z');
    expect(grantEndDate(start, 1, MX).toISOString()).toBe('2026-12-18T05:59:59.000Z');
  });

  it('uses the local date, not the UTC date', () => {
    // 31 Jan 2027 at 21:00 local is already 1 Feb in UTC.
    const start = new Date('2027-02-01T03:00:00Z');
    // Local start is 31 Jan, so one month later is the last day of February.
    expect(grantEndDate(start, 1, MX).toISOString()).toBe('2027-03-01T05:59:59.000Z');
  });

  it('clamps to the last day of a shorter month', () => {
    const jan31 = zonedTime({ year: 2027, month: 1, day: 31, hour: 9, minute: 0, second: 0 }, MX);
    expect(grantEndDate(jan31, 1, MX).toISOString()).toBe('2027-03-01T05:59:59.000Z'); // 28 Feb local
    const jan31leap = zonedTime({ year: 2028, month: 1, day: 31, hour: 9, minute: 0, second: 0 }, MX);
    expect(grantEndDate(jan31leap, 1, MX).toISOString()).toBe('2028-03-01T05:59:59.000Z'); // 29 Feb
    const aug31 = zonedTime({ year: 2027, month: 8, day: 31, hour: 9, minute: 0, second: 0 }, MX);
    expect(grantEndDate(aug31, 1, MX).toISOString()).toBe('2027-10-01T05:59:59.000Z'); // 30 Sep
  });

  it('crosses year boundaries', () => {
    const start = zonedTime({ year: 2026, month: 12, day: 15, hour: 9, minute: 0, second: 0 }, MX);
    expect(grantEndDate(start, 24, MX).toISOString()).toBe('2028-12-16T05:59:59.000Z');
  });

  it('follows the clinic time zone', () => {
    const start = new Date('2026-11-17T16:00:00Z');
    // Tijuana is UTC-8 in November.
    expect(grantEndDate(start, 1, 'America/Tijuana').toISOString()).toBe('2026-12-18T07:59:59.000Z');
  });
});

describe('isValidGrantMonths', () => {
  it('accepts whole months from 1 to 24', () => {
    expect([1, 3, 6, 12, 24].every(isValidGrantMonths)).toBe(true);
    expect([0, 25, 1.5, -1, '3', null].some(isValidGrantMonths)).toBe(false);
  });
});
