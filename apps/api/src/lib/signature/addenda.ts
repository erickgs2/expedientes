import { prisma } from '../prisma/client';
import { hashContent } from './content-hash';
import { noteContent, verifySigner, type NoteKind, type SignerFailure } from './note-signature';

/**
 * NOM-004-SSA3-2012 5.10: a signed valoración or treatment visit is corrected or completed with an
 * addendum, never by editing it. An addendum is written and signed in one step (the author's
 * signing PIN), may carry its own diagram views, and is never edited or deleted.
 */
export type AddendumKind = Extract<NoteKind, 'valoracion' | 'treatment'>;
export const ADDENDUM_KINDS: AddendumKind[] = ['valoracion', 'treatment'];

export const ADDENDUM_TEXT_MAX = 10_000;
const DIAGRAM_VIEWS = new Set(['FRONT', 'LEFT_PROFILE', 'RIGHT_PROFILE', 'EYES', 'NOSE', 'LIPS']);

export interface AddendumDiagram {
  view: string;
  data: Record<string, unknown>;
}

export interface AddendumView {
  id: string;
  text: string;
  diagrams: AddendumDiagram[];
  createdAt: string;
  signed: { at: string; name: string; title: string | null; license: string | null };
}

/** Validates the diagrams an addendum carries: known views, one each, an object of data. */
export function parseAddendumDiagrams(raw: unknown): AddendumDiagram[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > DIAGRAM_VIEWS.size) return null;
  const seen = new Set<string>();
  const out: AddendumDiagram[] = [];
  for (const d of raw as { view?: unknown; data?: unknown }[]) {
    if (!d || typeof d.view !== 'string' || !DIAGRAM_VIEWS.has(d.view) || seen.has(d.view)) return null;
    if (!d.data || typeof d.data !== 'object' || Array.isArray(d.data)) return null;
    seen.add(d.view);
    out.push({ view: d.view, data: d.data as Record<string, unknown> });
  }
  return out;
}

export type AddendumResult =
  | { ok: true; addendum: AddendumView; patientId: string }
  | { ok: false; code: 'NOT_FOUND' | 'NOTE_NOT_SIGNED' | SignerFailure; retryAfterSeconds?: number };

function toView(row: {
  id: string;
  text: string;
  diagrams: unknown;
  createdAt: Date;
  signedAt: Date;
  signerName: string;
  signerTitle: string | null;
  signerLicense: string;
}): AddendumView {
  return {
    id: row.id,
    text: row.text,
    diagrams: (row.diagrams as AddendumDiagram[] | null) ?? [],
    createdAt: row.createdAt.toISOString(),
    signed: { at: row.signedAt.toISOString(), name: row.signerName, title: row.signerTitle, license: row.signerLicense },
  };
}

/** Writes and signs an addendum to a signed note. The caller checked permission and the patient. */
export async function createAddendum(
  kind: AddendumKind,
  entityId: string,
  userId: string,
  input: { text: string; diagrams: AddendumDiagram[]; pin: string },
  now = new Date()
): Promise<AddendumResult> {
  const note = await noteContent(kind, entityId);
  if (!note) return { ok: false, code: 'NOT_FOUND' };
  const signed =
    kind === 'valoracion'
      ? await prisma.valoracion.findUnique({ where: { id: entityId }, select: { signedAt: true } })
      : await prisma.treatment.findUnique({ where: { id: entityId }, select: { signedAt: true } });
  // A draft is simply edited; addenda exist for what can no longer be.
  if (!signed?.signedAt) return { ok: false, code: 'NOTE_NOT_SIGNED' };

  const verified = await verifySigner(userId, input.pin);
  if (!verified.ok) return verified;

  const row = await prisma.clinicalAddendum.create({
    data: {
      patientId: note.patientId,
      entity: kind,
      entityId,
      text: input.text,
      diagrams: input.diagrams.length ? (input.diagrams as object[]) : undefined,
      createdById: userId,
      createdAt: now,
      signedById: userId,
      signedAt: now,
      contentHash: hashContent({ entity: kind, entityId, text: input.text, diagrams: input.diagrams }),
      signerName: verified.signer.name,
      signerTitle: verified.signer.title,
      signerLicense: verified.signer.license,
    },
  });
  return { ok: true, addendum: toView(row), patientId: note.patientId };
}

/** A note's addenda in the order they were written. */
export async function listAddenda(kind: AddendumKind, entityId: string): Promise<AddendumView[]> {
  const rows = await prisma.clinicalAddendum.findMany({
    where: { entity: kind, entityId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toView);
}
