import { ageOn, consentStateOf } from './patient-preview';
import { latestDistinctPatients } from './recent-patients';

describe('ageOn', () => {
  const birth = new Date('1991-03-02T00:00:00Z');

  it('counts a birthday that already passed this year', () => {
    expect(ageOn(birth, new Date('2026-11-11T00:00:00Z'))).toBe(35);
  });

  it('does not count a birthday still ahead this year', () => {
    expect(ageOn(birth, new Date('2026-03-01T00:00:00Z'))).toBe(34);
  });

  it('counts the birthday itself', () => {
    expect(ageOn(birth, new Date('2026-03-02T00:00:00Z'))).toBe(35);
  });
});

describe('consentStateOf', () => {
  it('distinguishes digital, paper and missing consents', () => {
    expect(consentStateOf({ signatureMethod: 'DIGITAL' })).toBe('digital');
    expect(consentStateOf({ signatureMethod: 'PAPER' })).toBe('paper');
    expect(consentStateOf(null)).toBe('missing');
  });
});

describe('latestDistinctPatients', () => {
  it('keeps the first entry per patient up to the limit', () => {
    const entries = ['a', 'b', 'a', 'c', 'd'].map((patientId, i) => ({ patientId, i }));
    expect(latestDistinctPatients(entries, 3).map((e) => e.i)).toEqual([0, 1, 3]);
  });
});
