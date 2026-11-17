import type { ConsentBlock } from '@expedientes/shared-types';
import { CONSENT_LABELS } from './consent-labels';

/**
 * A printed paper letter always has room for a witness: whether one is needed is decided at the
 * signing table, not at print time. Inserts the witness line before the physician's when absent.
 */
export function withBlankWitness(blocks: ConsentBlock[]): ConsentBlock[] {
  if (blocks.some((b) => b.kind === 'signatureBlock' && b.role === 'witness')) return blocks;
  const doctorAt = blocks.findIndex((b) => b.kind === 'signatureBlock' && b.role === 'doctor');
  const witness: ConsentBlock = {
    kind: 'signatureBlock',
    role: 'witness',
    caption: CONSENT_LABELS.es.signatures.witness,
  };
  if (doctorAt === -1) return [...blocks, witness];
  return [...blocks.slice(0, doctorAt), witness, ...blocks.slice(doctorAt)];
}

/**
 * The preview blocks of a pending letter, made ready to print and sign by hand: the preview carries
 * today's date but the paper copy's date is written at the signing table, and a witness line is
 * always present.
 */
export function prepareBlankConsentBlocks(blocks: ConsentBlock[]): ConsentBlock[] {
  return withBlankWitness(
    blocks.map((b) =>
      b.kind === 'fieldLine' && b.label === CONSENT_LABELS.es.date ? { ...b, value: '' } : b
    )
  );
}
