import { FormControl, FormGroup } from '@angular/forms';
import type { EvolutionNote, VitalSigns } from '@expedientes/shared-types';

/**
 * Form helpers for the NOM-004-SSA3-2012 clinical fields of phase D. Every control is optional:
 * a blank one is sent as null and never blocks a save.
 */
export const VITAL_KEYS = [
  'presionSistolica',
  'presionDiastolica',
  'frecuenciaCardiaca',
  'frecuenciaRespiratoria',
  'temperatura',
  'peso',
] as const satisfies readonly (keyof VitalSigns)[];

export const EVOLUTION_TEXT_KEYS = ['evolucion', 'resultadosEstudios', 'diagnostico', 'pronostico', 'indicaciones'] as const;
export const EVOLUTION_KEYS = [...EVOLUTION_TEXT_KEYS, ...VITAL_KEYS] as const;

/** Controls hold strings (what the inputs give); `cleanClinical` turns them into the API's values. */
export function clinicalControls<K extends string>(keys: readonly K[]): Record<K, FormControl<string>> {
  return Object.fromEntries(keys.map((k) => [k, new FormControl('', { nonNullable: true })])) as Record<
    K,
    FormControl<string>
  >;
}

export function evolutionGroup(): FormGroup<Record<(typeof EVOLUTION_KEYS)[number], FormControl<string>>> {
  return new FormGroup(clinicalControls(EVOLUTION_KEYS));
}

const NUMERIC = new Set<string>([...VITAL_KEYS, 'talla', 'quantity']);

/** Patch values from the API into string controls. */
export function toControlValues(source: object, keys: readonly string[]): Record<string, string> {
  const values = source as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, values[k] === null || values[k] === undefined ? '' : String(values[k])]));
}

/** Form strings to API values: blank → null, numbers parsed (decimal comma accepted). */
export function cleanClinical(raw: Record<string, string | null | undefined>, keys: readonly string[]): Record<string, string | number | null> {
  return Object.fromEntries(
    keys.map((k) => {
      const v = (raw[k] ?? '').trim();
      if (!v) return [k, null];
      if (NUMERIC.has(k)) {
        const n = Number(v.replace(',', '.'));
        return [k, Number.isFinite(n) ? n : null];
      }
      return [k, v];
    })
  );
}

/** Whether an evolution note holds anything, so its section opens by itself. */
export function hasEvolution(note: Partial<EvolutionNote> | null | undefined): boolean {
  return !!note && EVOLUTION_KEYS.some((k) => note[k] !== null && note[k] !== undefined && note[k] !== '');
}
