import { addDays, clinicDateOf, clinicDayRange, isIsoDate } from './clinic-day';

describe('clinic-day', () => {
  it('reads the clinic-local date, not the UTC one', () => {
    // 23:30 on Nov 11 in Mexico City is already Nov 12 in UTC.
    expect(clinicDateOf(new Date('2026-11-12T05:30:00Z'))).toBe('2026-11-11');
  });

  it('spans local midnight to local midnight', () => {
    const { start, end } = clinicDayRange('2026-11-11');
    expect(start.toISOString()).toBe('2026-11-11T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-12T06:00:00.000Z');
  });

  it('puts a late-evening appointment in its local day', () => {
    const { start, end } = clinicDayRange('2026-11-11');
    const lateEvening = new Date('2026-11-12T05:30:00Z');
    expect(lateEvening >= start && lateEvening < end).toBe(true);
  });

  it('adds days across a month end', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });

  it('validates real calendar dates only', () => {
    expect(isIsoDate('2026-11-11')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('11/11/2026')).toBe(false);
  });
});
