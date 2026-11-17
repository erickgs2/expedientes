import type { ConsentBlock } from '@expedientes/shared-types';
import { prepareBlankConsentBlocks, withBlankWitness } from './blank-consent-blocks';
import { consentFooterText } from './consent-footer-text';

const blocks: ConsentBlock[] = [
  { kind: 'title', text: 'CONSENTIMIENTO INFORMADO' },
  { kind: 'signatureBlock', role: 'patient', caption: 'PACIENTE' },
  { kind: 'signatureBlock', role: 'doctor', caption: 'MEDICO', subCaption: 'DRA. X CED 1' },
];

describe('withBlankWitness', () => {
  it('inserts a witness line between patient and doctor when none exists', () => {
    const roles = withBlankWitness(blocks)
      .filter((b) => b.kind === 'signatureBlock')
      .map((b) => (b as { role: string }).role);
    expect(roles).toEqual(['patient', 'witness', 'doctor']);
  });

  it('does not duplicate an existing witness line', () => {
    const once = withBlankWitness(blocks);
    expect(withBlankWitness(once)).toEqual(once);
  });
});

describe('consentFooterText', () => {
  const pageLabel = (n: number, t: number) => `P ${n}/${t}`;

  it('omits the date segment when the letter is unsigned', () => {
    expect(consentFooterText({ patientName: 'ANA', signedOn: '', pageLabel }, 1, 2)).toBe(
      'ANA — P 1/2'
    );
  });

  it('keeps the date segment for a signed letter', () => {
    expect(
      consentFooterText({ patientName: 'ANA', signedOn: '2026-11-11', pageLabel }, 1, 2)
    ).toBe('ANA — 2026-11-11 — P 1/2');
  });
});

describe('prepareBlankConsentBlocks', () => {
  const withDate: ConsentBlock[] = [
    { kind: 'fieldLine', label: 'LUGAR', value: 'Culiacan' },
    { kind: 'fieldLine', label: 'FECHA', value: '2026-11-11' },
    ...blocks,
  ];

  it('blanks the date, which is written by hand on the paper copy', () => {
    const date = prepareBlankConsentBlocks(withDate).find(
      (b) => b.kind === 'fieldLine' && b.label === 'FECHA'
    );
    expect(date).toEqual({ kind: 'fieldLine', label: 'FECHA', value: '' });
  });

  it('keeps every other field and adds the witness line', () => {
    const result = prepareBlankConsentBlocks(withDate);
    expect(result).toContainEqual({ kind: 'fieldLine', label: 'LUGAR', value: 'Culiacan' });
    expect(result.filter((b) => b.kind === 'signatureBlock')).toHaveLength(3);
  });
});
