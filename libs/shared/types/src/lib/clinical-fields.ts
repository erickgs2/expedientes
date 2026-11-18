/**
 * The clinical content of NOM-004-SSA3-2012 added in phase D (5.9, 6.1, 6.2), adapted to aesthetic
 * medicine. Every field is optional.
 */
export type FitzpatrickPhototype = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
export type SkinType = 'normal' | 'seca' | 'grasa' | 'mixta' | 'sensible';
export type ProductUnit = 'U' | 'ml' | 'mg' | 'g';
export type ProductRoute = 'intradermica' | 'subcutanea' | 'supraperiostica' | 'intramuscular' | 'intralesional' | 'topica';

export const FITZPATRICK_PHOTOTYPES: FitzpatrickPhototype[] = ['I', 'II', 'III', 'IV', 'V', 'VI'];
export const SKIN_TYPES: SkinType[] = ['normal', 'seca', 'grasa', 'mixta', 'sensible'];
export const PRODUCT_UNITS: ProductUnit[] = ['U', 'ml', 'mg', 'g'];
export const PRODUCT_ROUTES: ProductRoute[] = ['intradermica', 'subcutanea', 'supraperiostica', 'intramuscular', 'intralesional', 'topica'];

/** mmHg, per minute, °C and kg. */
export interface VitalSigns {
  presionSistolica: number | null;
  presionDiastolica: number | null;
  frecuenciaCardiaca: number | null;
  frecuenciaRespiratoria: number | null;
  temperatura: number | null;
  peso: number | null;
}

/** Nota de evolución (6.2) on a valoración or a treatment visit. */
export interface EvolutionNote extends VitalSigns {
  evolucion: string | null;
  resultadosEstudios: string | null;
  diagnostico: string | null;
  pronostico: string | null;
  indicaciones: string | null;
}

/** Added to the historia clínica (6.1), in the norm's order. */
export interface HistoriaClinicalContent extends VitalSigns {
  antecedentesPersonalesPatologicos: string | null;
  padecimientoActual: string | null;
  interrogatorioPiel: string | null;
  interrogatorioCardiovascular: string | null;
  interrogatorioEndocrino: string | null;
  interrogatorioNeurologico: string | null;
  interrogatorioOtros: string | null;
  /** cm; the BMI is computed from weight and height. */
  talla: number | null;
  fototipoFitzpatrick: FitzpatrickPhototype | null;
  tipoPiel: SkinType | null;
  exploracionFacial: string | null;
  lesionesCutaneas: string | null;
  resultadosEstudios: string | null;
  diagnostico: string | null;
  pronostico: string | null;
  indicacionTerapeutica: string | null;
}

/** What was applied, per product (6.2.6). */
export interface ProductDose {
  quantity: number | null;
  unit: ProductUnit | null;
  route: ProductRoute | null;
  zone: string | null;
  frequency: string | null;
}

/** Body mass index from kg and cm, one decimal; null when either is missing. */
export function bodyMassIndex(pesoKg: number | null | undefined, tallaCm: number | null | undefined): number | null {
  if (!pesoKg || !tallaCm) return null;
  const metres = tallaCm / 100;
  return Math.round((pesoKg / (metres * metres)) * 10) / 10;
}
