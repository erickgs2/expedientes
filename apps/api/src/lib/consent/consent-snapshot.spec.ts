import { buildConsentSnapshot } from './consent-snapshot';

const settings = {
  clinicName: 'Clinica Demo',
  doctorTitle: 'DRA.',
  doctorName: 'MIROSLAVA GARCIA',
  doctorLicense: '11372415',
  declarationBefore: 'YO {{patientName}} AUTORIZO A {{doctorTitle}} {{doctorName}}.',
  declarationAfter: 'DECLARO HABER SIDO INFORMADO POR {{clinicName}}.',
};

const base = {
  settings,
  patientName: 'JUAN PEREZ',
  patientIdentification: 'INE 1234',
  place: 'Culiacan',
  signedDate: '2026-11-11',
  witnessName: null,
  sections: [{ key: 'description' as const, body: 'Toxina.' }],
};

describe('buildConsentSnapshot', () => {
  it('freezes the clinic, doctor, patient, place and date', () => {
    const s = buildConsentSnapshot(base);
    expect(s).toMatchObject({
      place: 'Culiacan',
      signedDateSnapshot: '2026-11-11',
      patientNameSnapshot: 'JUAN PEREZ',
      patientIdentification: 'INE 1234',
      clinicNameSnapshot: 'Clinica Demo',
      doctorTitleSnapshot: 'DRA.',
      doctorNameSnapshot: 'MIROSLAVA GARCIA',
      doctorLicenseSnapshot: '11372415',
      witnessName: null,
    });
  });

  it('interpolates the declarations at snapshot time', () => {
    const s = buildConsentSnapshot(base);
    expect(s.declarationBeforeSnapshot).toBe('YO JUAN PEREZ AUTORIZO A DRA. MIROSLAVA GARCIA.');
    expect(s.declarationAfterSnapshot).toBe('DECLARO HABER SIDO INFORMADO POR Clinica Demo.');
  });

  it('stores the sections as given', () => {
    expect(buildConsentSnapshot(base).sections).toEqual(base.sections);
  });
});
