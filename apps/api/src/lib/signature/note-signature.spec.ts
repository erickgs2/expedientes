jest.mock('../prisma/client', () => ({ prisma: {} }));

import { hashContent, SIGNING_PIN_PATTERN, stableStringify } from './note-signature';

describe('note signature content', () => {
  it('hashes the same content the same way whatever the key order', () => {
    expect(stableStringify({ b: 1, a: { d: [2, 1], c: null } })).toBe('{"a":{"c":null,"d":[2,1]},"b":1}');
    expect(hashContent({ notas: 'x', fecha: new Date('2026-11-18T10:00:00Z') })).toBe(
      hashContent({ fecha: new Date('2026-11-18T10:00:00Z'), notas: 'x' })
    );
  });

  it('changes the hash when any word of the note changes', () => {
    expect(hashContent({ notas: 'Toxina 20 U' })).not.toBe(hashContent({ notas: 'Toxina 25 U' }));
  });

  it('accepts only a 6-digit PIN', () => {
    expect(SIGNING_PIN_PATTERN.test('123456')).toBe(true);
    expect(SIGNING_PIN_PATTERN.test('12345')).toBe(false);
    expect(SIGNING_PIN_PATTERN.test('12345a')).toBe(false);
  });
});
