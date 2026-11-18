import {
  EVOLUTION_FIELDS,
  HISTORIA_CLINICAL_FIELDS,
  PRODUCT_DOSE_FIELDS,
  bodyMassIndex,
  filledFields,
  parseClinicalFields,
} from './clinical-fields';

describe('NOM-004 clinical fields (phase D)', () => {
  it('are all optional: an empty body is valid and touches nothing', () => {
    expect(parseClinicalFields({}, HISTORIA_CLINICAL_FIELDS)).toEqual({ ok: true, data: {} });
    expect(parseClinicalFields({}, EVOLUTION_FIELDS)).toEqual({ ok: true, data: {} });
    expect(parseClinicalFields({}, PRODUCT_DOSE_FIELDS)).toEqual({ ok: true, data: {} });
  });

  it('clears a field sent blank', () => {
    expect(parseClinicalFields({ diagnostico: '  ', peso: '' }, HISTORIA_CLINICAL_FIELDS)).toEqual({
      ok: true,
      data: { diagnostico: null, peso: null },
    });
  });

  it('accepts vital signs in range, decimal commas included', () => {
    const r = parseClinicalFields(
      { presionSistolica: 120, presionDiastolica: '80', temperatura: '36,6', peso: 61.5, talla: '165' },
      HISTORIA_CLINICAL_FIELDS
    );
    expect(r).toEqual({ ok: true, data: { presionSistolica: 120, presionDiastolica: 80, temperatura: 36.6, peso: 61.5, talla: 165 } });
  });

  it('refuses vital signs out of range or not whole where they must be', () => {
    expect(parseClinicalFields({ presionSistolica: 900 }, EVOLUTION_FIELDS).ok).toBe(false);
    expect(parseClinicalFields({ frecuenciaCardiaca: 72.5 }, EVOLUTION_FIELDS).ok).toBe(false);
    expect(parseClinicalFields({ temperatura: 'alta' }, EVOLUTION_FIELDS).ok).toBe(false);
  });

  it('accepts only the listed phototypes, skin types, units and routes', () => {
    expect(parseClinicalFields({ fototipoFitzpatrick: 'III', tipoPiel: 'mixta' }, HISTORIA_CLINICAL_FIELDS).ok).toBe(true);
    expect(parseClinicalFields({ fototipoFitzpatrick: 'VII' }, HISTORIA_CLINICAL_FIELDS).ok).toBe(false);
    expect(parseClinicalFields({ quantity: '0.5', unit: 'ml', route: 'intradermica', zone: 'Labio superior' }, PRODUCT_DOSE_FIELDS)).toEqual({
      ok: true,
      data: { quantity: 0.5, unit: 'ml', route: 'intradermica', zone: 'Labio superior' },
    });
    expect(parseClinicalFields({ unit: 'litros' }, PRODUCT_DOSE_FIELDS).ok).toBe(false);
    expect(parseClinicalFields({ route: 'oral' }, PRODUCT_DOSE_FIELDS).ok).toBe(false);
  });

  it('a product with no dose recorded is still valid (optional, unlike the original plan)', () => {
    expect(parseClinicalFields({ brand: 'X' }, PRODUCT_DOSE_FIELDS)).toEqual({ ok: true, data: {} });
  });

  it('leaves blank fields out of what a signature hashes', () => {
    expect(filledFields({ diagnostico: null, peso: 60, evolucion: undefined }, EVOLUTION_FIELDS)).toEqual({ peso: 60 });
  });

  it('computes the BMI from kg and cm', () => {
    expect(bodyMassIndex(60, 165)).toBe(22);
    expect(bodyMassIndex(61.5, 170)).toBe(21.3);
    expect(bodyMassIndex(null, 165)).toBeNull();
  });
});
