import { buildConsentDocument, interpolate, type ConsentDocumentInput } from './build-consent-document';

const LABELS = {
  title: 'CONSENTIMIENTO INFORMADO',
  place: 'LUGAR',
  date: 'FECHA',
  patient: 'PACIENTE',
  identifiesWith: 'SE IDENTIFICA CON',
  sections: {
    description: 'PROCEDIMIENTO',
    risks: 'RIESGOS Y COMPLICACIONES',
    alternatives: 'ALTERNATIVAS DE TRATAMIENTO',
    aftercare: 'CUIDADOS POSTERIORES',
    contraindications: 'CONTRAINDICACIONES',
  },
  signatures: { patient: 'PACIENTE', witness: 'TESTIGO', doctor: 'MEDICO' },
};

function input(overrides: Partial<ConsentDocumentInput> = {}): ConsentDocumentInput {
  return {
    clinicName: 'Clinica Demo',
    doctorTitle: 'DRA.',
    doctorName: 'MIROSLAVA GARCIA',
    doctorLicense: '11372415',
    patientName: 'JUAN PEREZ',
    patientIdentification: 'INE 1234',
    place: 'Culiacan',
    signedAt: '2026-08-10T15:04:05.000Z',
    declarationBefore: 'YO {{patientName}} AUTORIZO A {{doctorTitle}} {{doctorName}}.',
    declarationAfter: 'DECLARO HABER SIDO INFORMADO.',
    sections: [{ key: 'description', body: 'Aplicacion de toxina botulinica.' }],
    witnessName: null,
    labels: LABELS,
    ...overrides,
  };
}

describe('interpolate', () => {
  it('replaces known placeholders', () => {
    expect(interpolate('Hola {{patientName}}', { patientName: 'ANA' })).toBe('Hola ANA');
  });

  it('leaves an unknown placeholder intact so a typo is visible', () => {
    expect(interpolate('Hola {{nombre}}', { patientName: 'ANA' })).toBe('Hola {{nombre}}');
  });

  it('replaces every occurrence of the same placeholder', () => {
    expect(interpolate('{{a}} y {{a}}', { a: 'X' })).toBe('X y X');
  });
});

describe('buildConsentDocument', () => {
  it('emits the header block order', () => {
    const blocks = buildConsentDocument(input());
    expect(blocks[0]).toEqual({ kind: 'title', text: 'CONSENTIMIENTO INFORMADO' });
    expect(blocks[1]).toEqual({ kind: 'fieldLine', label: 'LUGAR', value: 'Culiacan' });
    expect(blocks[2]).toEqual({ kind: 'fieldLine', label: 'FECHA', value: '2026-08-10' });
    expect(blocks[3]).toEqual({ kind: 'fieldLine', label: 'PACIENTE', value: 'JUAN PEREZ' });
    expect(blocks[4]).toEqual({
      kind: 'fieldLine',
      label: 'SE IDENTIFICA CON',
      value: 'INE 1234',
    });
  });

  it('interpolates the declarations', () => {
    const blocks = buildConsentDocument(input());
    expect(blocks[5]).toEqual({
      kind: 'paragraph',
      text: 'YO JUAN PEREZ AUTORIZO A DRA. MIROSLAVA GARCIA.',
    });
  });

  it('renders each present section as a heading followed by its body', () => {
    const blocks = buildConsentDocument(
      input({
        sections: [
          { key: 'description', body: 'Descripcion.' },
          { key: 'risks', body: 'Riesgos.' },
        ],
      })
    );
    expect(blocks[6]).toEqual({ kind: 'sectionHeading', text: 'PROCEDIMIENTO' });
    expect(blocks[7]).toEqual({ kind: 'paragraph', text: 'Descripcion.' });
    expect(blocks[8]).toEqual({ kind: 'sectionHeading', text: 'RIESGOS Y COMPLICACIONES' });
    expect(blocks[9]).toEqual({ kind: 'paragraph', text: 'Riesgos.' });
  });

  it('omits a section whose body is blank or whitespace', () => {
    const blocks = buildConsentDocument(
      input({
        sections: [
          { key: 'description', body: 'Descripcion.' },
          { key: 'risks', body: '   ' },
        ],
      })
    );
    expect(blocks.some((b) => b.kind === 'sectionHeading' && b.text === 'RIESGOS Y COMPLICACIONES')).toBe(false);
  });

  it('omits the witness signature block when there is no witness', () => {
    const blocks = buildConsentDocument(input());
    const roles = blocks.filter((b) => b.kind === 'signatureBlock').map((b) => b.role);
    expect(roles).toEqual(['patient', 'doctor']);
  });

  it('includes the witness signature block with its name when there is a witness', () => {
    const blocks = buildConsentDocument(input({ witnessName: 'LUIS SOTO' }));
    const witness = blocks.find((b) => b.kind === 'signatureBlock' && b.role === 'witness');
    expect(witness).toEqual({
      kind: 'signatureBlock',
      role: 'witness',
      caption: 'TESTIGO',
      subCaption: 'LUIS SOTO',
    });
  });

  it('captions the doctor block with title, name and licence', () => {
    const blocks = buildConsentDocument(input());
    const doctor = blocks.find((b) => b.kind === 'signatureBlock' && b.role === 'doctor');
    expect(doctor).toEqual({
      kind: 'signatureBlock',
      role: 'doctor',
      caption: 'MEDICO',
      subCaption: 'DRA. MIROSLAVA GARCIA CED 11372415',
    });
  });

  it('ends with the declarationAfter paragraph before the signature blocks', () => {
    const blocks = buildConsentDocument(input());
    const lastParagraph = blocks.filter((b) => b.kind === 'paragraph').at(-1);
    expect(lastParagraph).toEqual({ kind: 'paragraph', text: 'DECLARO HABER SIDO INFORMADO.' });
    const firstSignatureIndex = blocks.findIndex((b) => b.kind === 'signatureBlock');
    const lastParagraphIndex = blocks.lastIndexOf(lastParagraph!);
    expect(lastParagraphIndex).toBeLessThan(firstSignatureIndex);
  });
});
