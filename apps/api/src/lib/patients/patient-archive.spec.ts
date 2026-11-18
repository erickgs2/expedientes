jest.mock('../prisma/client', () => ({ prisma: {} }));

import { normalizeArchiveReason, purgeAllowedFrom, RETENTION_YEARS } from './patient-archive';

describe('patient archive rules', () => {
  it('keeps a record five years from the last care before it can be purged', () => {
    expect(RETENTION_YEARS).toBe(5);
    expect(purgeAllowedFrom(new Date('2026-11-18T10:00:00Z')).toISOString()).toBe('2031-11-18T10:00:00.000Z');
  });

  it('requires a reason, trimmed and of a sane length', () => {
    expect(normalizeArchiveReason('  Paciente se mudó de ciudad  ')).toBe('Paciente se mudó de ciudad');
    expect(normalizeArchiveReason('   ')).toBeNull();
    expect(normalizeArchiveReason(undefined)).toBeNull();
    expect(normalizeArchiveReason('x'.repeat(501))).toBeNull();
  });
});
