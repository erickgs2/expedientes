import type { PlatformClinicRow } from '@expedientes/shared-types';
import { clinicsCsv } from './clinic-rows';

const row: PlatformClinicRow = {
  id: 'c1',
  name: '=HYPERLINK("x") "Dra" Ana',
  status: 'ACTIVE',
  createdAt: '2026-11-17T10:00:00.000Z',
  ownerEmail: 'ana@clinica.mx',
  tier: 'PREMIUM',
  source: 'GRANT',
  paymentMethod: null,
  interval: null,
  premiumUntil: '2027-11-18T05:59:59.000Z',
  users: 2,
  patients: 120,
  treatmentTypes: 7,
  consents: 80,
  storageBytes: 5 * 1024 * 1024,
  lastActivityAt: null,
};

describe('clinicsCsv', () => {
  it('quotes cells, escapes quotes and neutralises formulas', () => {
    const csv = clinicsCsv([row]);
    const [, line] = csv.replace('﻿', '').split('\r\n');
    expect(line.startsWith(`"'=HYPERLINK(""x"") ""Dra"" Ana"`)).toBe(true);
    expect(line).toContain('"5.0"');
    expect(line).toContain('"2027-11-18"');
  });

  it('carries no patient data, only counts', () => {
    const header = clinicsCsv([]).replace('﻿', '').split('\r\n')[0];
    expect(header).toBe(
      'clinica,estado,alta,propietario,plan,origen,metodo,periodo,vigente_hasta,usuarios,pacientes,tipos_tratamiento,consentimientos,almacenamiento_mb,ultima_actividad'
    );
  });
});
