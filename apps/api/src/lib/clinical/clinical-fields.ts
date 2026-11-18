/**
 * The clinical content NOM-004-SSA3-2012 asks of a record (6.1 historia clínica, 6.2 nota de
 * evolución, 6.2.6 what was applied), adapted to aesthetic medicine. Every field is optional: an
 * aesthetic visit often has nothing to note in several of them, and a blank one never blocks a save.
 * One spec per field drives the validation of every route that writes them.
 */
type FieldSpec =
  | { kind: 'text'; max: number }
  | { kind: 'int'; min: number; max: number }
  | { kind: 'float'; min: number; max: number }
  | { kind: 'enum'; values: readonly string[] };

const TEXT: FieldSpec = { kind: 'text', max: 10_000 };
const SHORT: FieldSpec = { kind: 'text', max: 200 };

export const FITZPATRICK = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const;
export const SKIN_TYPES = ['normal', 'seca', 'grasa', 'mixta', 'sensible'] as const;
export const PRODUCT_UNITS = ['U', 'ml', 'mg', 'g'] as const;
export const PRODUCT_ROUTES = [
  'intradermica',
  'subcutanea',
  'supraperiostica',
  'intramuscular',
  'intralesional',
  'topica',
] as const;

/** Vital signs, shared by the historia and the evolution notes. */
const VITALS = {
  presionSistolica: { kind: 'int', min: 40, max: 300 },
  presionDiastolica: { kind: 'int', min: 20, max: 200 },
  frecuenciaCardiaca: { kind: 'int', min: 20, max: 250 },
  frecuenciaRespiratoria: { kind: 'int', min: 4, max: 80 },
  temperatura: { kind: 'float', min: 30, max: 45 },
  peso: { kind: 'float', min: 1, max: 400 },
} as const satisfies Record<string, FieldSpec>;

/** Added to the historia clínica (6.1), in the norm's order. */
export const HISTORIA_CLINICAL_FIELDS = {
  antecedentesPersonalesPatologicos: TEXT,
  padecimientoActual: TEXT,
  interrogatorioPiel: TEXT,
  interrogatorioCardiovascular: TEXT,
  interrogatorioEndocrino: TEXT,
  interrogatorioNeurologico: TEXT,
  interrogatorioOtros: TEXT,
  ...VITALS,
  talla: { kind: 'float', min: 30, max: 250 },
  fototipoFitzpatrick: { kind: 'enum', values: FITZPATRICK },
  tipoPiel: { kind: 'enum', values: SKIN_TYPES },
  exploracionFacial: TEXT,
  lesionesCutaneas: TEXT,
  resultadosEstudios: TEXT,
  diagnostico: TEXT,
  pronostico: TEXT,
  indicacionTerapeutica: TEXT,
} as const satisfies Record<string, FieldSpec>;

/** The nota de evolución (6.2) on a valoración or a treatment visit. */
export const EVOLUTION_FIELDS = {
  evolucion: TEXT,
  ...VITALS,
  resultadosEstudios: TEXT,
  diagnostico: TEXT,
  pronostico: TEXT,
  indicaciones: TEXT,
} as const satisfies Record<string, FieldSpec>;

/** What was applied, per product (6.2.6). */
export const PRODUCT_DOSE_FIELDS = {
  quantity: { kind: 'float', min: 0, max: 10_000 },
  unit: { kind: 'enum', values: PRODUCT_UNITS },
  route: { kind: 'enum', values: PRODUCT_ROUTES },
  zone: SHORT,
  frequency: SHORT,
} as const satisfies Record<string, FieldSpec>;

export type FieldSet = Record<string, FieldSpec>;
export type ParsedFields<T extends FieldSet> = {
  [K in keyof T]?: (T[K] extends { kind: 'int' | 'float' } ? number : string) | null;
};

/**
 * Reads the fields of `specs` from a request body. A missing key is left alone (undefined), an
 * empty value clears the field (null), anything else must fit its spec. Returns the error message
 * for the first field that does not.
 */
export function parseClinicalFields<T extends FieldSet>(
  body: Record<string, unknown>,
  specs: T
): { ok: true; data: ParsedFields<T> } | { ok: false; error: string } {
  const data: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(specs)) {
    if (!(name in body)) continue;
    const raw = body[name];
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
      data[name] = null;
      continue;
    }
    switch (spec.kind) {
      case 'text':
        if (typeof raw !== 'string') return { ok: false, error: `${name} must be text` };
        if (raw.length > spec.max) return { ok: false, error: `${name} is limited to ${spec.max} characters` };
        data[name] = raw.trim();
        break;
      case 'enum':
        if (typeof raw !== 'string' || !spec.values.includes(raw)) {
          return { ok: false, error: `${name} must be one of ${spec.values.join(', ')}` };
        }
        data[name] = raw;
        break;
      case 'int':
      case 'float': {
        const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.')) : NaN;
        if (!Number.isFinite(value) || (spec.kind === 'int' && !Number.isInteger(value))) {
          return { ok: false, error: `${name} must be a${spec.kind === 'int' ? 'n integer' : ' number'}` };
        }
        if (value < spec.min || value > spec.max) {
          return { ok: false, error: `${name} must be between ${spec.min} and ${spec.max}` };
        }
        data[name] = value;
        break;
      }
    }
  }
  return { ok: true, data: data as ParsedFields<T> };
}

/**
 * The fields of `specs` that hold a value. What a signature hashes leaves blank phase D fields out,
 * so a note signed before they existed still matches its signature.
 */
export function filledFields(row: Record<string, unknown>, specs: FieldSet): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(specs)
      .filter((name) => row[name] !== null && row[name] !== undefined)
      .map((name) => [name, row[name]])
  );
}

/** Body mass index from kg and cm, one decimal; null when either is missing. */
export function bodyMassIndex(pesoKg: number | null | undefined, tallaCm: number | null | undefined): number | null {
  if (!pesoKg || !tallaCm) return null;
  const metres = tallaCm / 100;
  return Math.round((pesoKg / (metres * metres)) * 10) / 10;
}

/** The keys of `specs` present in a multipart form, as a plain body for `parseClinicalFields`. */
export function formDataFields(form: FormData, specs: FieldSet): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const name of Object.keys(specs)) {
    const value = form.get(name);
    if (value !== null && typeof value === 'string') body[name] = value;
  }
  return body;
}
