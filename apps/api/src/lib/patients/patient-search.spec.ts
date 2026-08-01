import { buildPatientSearchWhere } from './patient-search';

describe('buildPatientSearchWhere', () => {
  it('returns an empty filter for a blank query', () => {
    expect(buildPatientSearchWhere('   ')).toEqual({});
  });

  it('matches on fullName, phone, and documentId with the trimmed query', () => {
    const where = buildPatientSearchWhere('  Maria  ');
    expect(where).toEqual({
      OR: [
        { fullName: { contains: 'Maria', mode: 'insensitive' } },
        { phone: { contains: 'Maria' } },
        { documentId: { contains: 'Maria' } },
      ],
    });
  });
});
