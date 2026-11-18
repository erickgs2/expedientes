import type { ConsentBlock } from '@expedientes/shared-types';
import { CONSENT_LABELS } from './consent-labels';

/**
 * A printed paper letter always has room for both witnesses (NOM-004-SSA3-2012 10.1.1 asks for two).
 * Inserts each missing witness line before the physician's.
 */
export function withBlankWitness(blocks: ConsentBlock[]): ConsentBlock[] {
  const missing: ConsentBlock[] = (['witness', 'secondWitness'] as const)
    .filter((role) => !blocks.some((b) => b.kind === 'signatureBlock' && b.role === role))
    .map((role) => ({ kind: 'signatureBlock', role, caption: CONSENT_LABELS.es.signatures[role] }));
  if (missing.length === 0) return blocks;
  const doctorAt = blocks.findIndex((b) => b.kind === 'signatureBlock' && b.role === 'doctor');
  if (doctorAt === -1) return [...blocks, ...missing];
  return [...blocks.slice(0, doctorAt), ...missing, ...blocks.slice(doctorAt)];
}

/**
 * The preview blocks of a pending letter, made ready to print and sign by hand: the preview carries
 * today's date but the paper copy's date is written at the signing table, and both witness lines
 * are always present.
 */
export function prepareBlankConsentBlocks(blocks: ConsentBlock[]): ConsentBlock[] {
  return withBlankWitness(
    blocks.map((b) =>
      b.kind === 'fieldLine' && b.label === CONSENT_LABELS.es.date ? { ...b, value: '' } : b
    )
  );
}
