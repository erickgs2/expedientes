import { prisma } from '../prisma/client';
import { verifyPassword } from '../auth/password';
import { createFailureLimiter } from '../auth/failure-limiter';
import { ApiProblem } from '../http/api-problem';
import { hashContent, stableStringify } from './content-hash';
import { EVOLUTION_FIELDS, HISTORIA_CLINICAL_FIELDS, PRODUCT_DOSE_FIELDS, filledFields } from '../clinical/clinical-fields';
import { ensureBaseRevision, latestRevision, recordRevision, stampRevisionSignature } from '../historia-clinica/revisions';

export { hashContent, stableStringify };

/**
 * NOM-004-SSA3-2012 5.10: every note in the record carries the date, time, full name of whoever
 * wrote it, and their signature (autograph, electronic or digital). MedCloud signs with a simple
 * electronic signature: the author confirms with a personal 6-digit PIN, and the note keeps who
 * signed, when, their name, title and licence as they were at that moment, and a SHA-256 of the
 * note's content. Notes written before signatures existed (`legacyRecord`) are never signed later.
 *
 * Phase C: a signed valoración or treatment visit is locked; every route that edits one calls
 * `beginNoteEdit` first, which answers 409 NOTE_SIGNED, and the correction goes in a signed
 * addendum (addenda.ts). The historia clínica is not locked: each save keeps a revision
 * (historia-clinica/revisions.ts) and signing signs the latest one, so editing it voids only the
 * signature of the current version. Every edit of a draft records the fields' before and after in
 * the audit log.
 */
export type NoteKind = 'valoracion' | 'treatment' | 'historiaClinica';

export const NOTE_KINDS: NoteKind[] = ['valoracion', 'treatment', 'historiaClinica'];

/** The permission module whose `edit` right lets someone sign a note of this kind. */
export const NOTE_PERMISSION: Record<NoteKind, string> = {
  valoracion: 'valoracion',
  treatment: 'treatments',
  historiaClinica: 'historia-clinica',
};

/** Signed notes of these kinds cannot be edited; the historia clínica keeps revisions instead. */
export const LOCKED_WHEN_SIGNED: NoteKind[] = ['valoracion', 'treatment'];

export const SIGNING_PIN_PATTERN = /^\d{6}$/;

/** Five wrong PINs in 15 minutes lock signing for that user until the window passes. */
export const pinFailures = createFailureLimiter({ maxFailures: 5, windowMs: 15 * 60_000 });

const byKey = <T>(key: (t: T) => string) => (a: T, b: T) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);

/**
 * What a signature covers, per kind: the clinical content of the note. Photos and consents are
 * left out on purpose: an "after" photo is routinely added later, and a consent is its own signed
 * document.
 */
export async function noteContent(
  kind: NoteKind,
  id: string
): Promise<{ patientId: string; content: unknown } | null> {
  if (kind === 'valoracion') {
    const v = await prisma.valoracion.findUnique({ where: { id }, include: { diagrams: true } });
    if (!v) return null;
    return {
      patientId: v.patientId,
      content: {
        fecha: v.fecha,
        queQuiereElPaciente: v.queQuiereElPaciente,
        queNecesitaElPaciente: v.queNecesitaElPaciente,
        notas: v.notas,
        ...filledFields(v, EVOLUTION_FIELDS),
        diagrams: v.diagrams.map((d) => ({ view: d.view, data: d.data })).sort(byKey((d) => d.view)),
      },
    };
  }
  if (kind === 'treatment') {
    const t = await prisma.treatment.findUnique({
      where: { id },
      include: { items: { include: { diagrams: true, products: { orderBy: { createdAt: 'asc' } } } } },
    });
    if (!t) return null;
    return {
      patientId: t.patientId,
      content: {
        fecha: t.fecha,
        ...filledFields(t, EVOLUTION_FIELDS),
        items: t.items
          .map((i) => ({
            treatmentTypeId: i.treatmentTypeId,
            notes: i.notes,
            diagrams: i.diagrams.map((d) => ({ view: d.view, data: d.data })).sort(byKey((d) => d.view)),
            products: i.products.map((p) => ({
              brand: p.brand,
              lotNumber: p.lotNumber,
              expiryDate: p.expiryDate,
              ...filledFields(p, PRODUCT_DOSE_FIELDS),
            })),
          }))
          .sort(byKey((i) => i.treatmentTypeId)),
      },
    };
  }
  const h = await prisma.historiaClinica.findUnique({
    where: { id },
    include: { allergies: { include: { allergy: true } } },
  });
  if (!h) return null;
  const {
    id: _id,
    clinicId: _clinicId,
    patientId,
    createdAt: _c,
    updatedAt: _u,
    createdById: _cb,
    signedById: _sb,
    signedAt: _sa,
    signedHash: _sh,
    signerName: _sn,
    signerTitle: _st,
    signerLicense: _sl,
    legacyRecord: _lr,
    allergies,
    ...fields
  } = h;
  // Phase D fields count only once filled, so a version saved before they existed hashes the same.
  const phaseD = new Set(Object.keys(HISTORIA_CLINICAL_FIELDS));
  const kept = Object.fromEntries(
    Object.entries(fields).filter(([k, v]) => !phaseD.has(k) || (v !== null && v !== undefined))
  );
  return { patientId, content: { ...kept, allergies: allergies.map((a) => a.allergy.name).sort() } };
}

interface SignatureColumns {
  createdById: string | null;
  createdAt: Date;
  signedById: string | null;
  signedAt: Date | null;
  signedHash: string | null;
  signerName: string | null;
  signerTitle: string | null;
  signerLicense: string | null;
  legacyRecord: boolean;
}

async function signatureRow(kind: NoteKind, id: string): Promise<SignatureColumns | null> {
  const select = {
    createdById: true,
    createdAt: true,
    signedById: true,
    signedAt: true,
    signedHash: true,
    signerName: true,
    signerTitle: true,
    signerLicense: true,
    legacyRecord: true,
  } as const;
  if (kind === 'valoracion') return prisma.valoracion.findUnique({ where: { id }, select });
  if (kind === 'treatment') return prisma.treatment.findUnique({ where: { id }, select });
  return prisma.historiaClinica.findUnique({ where: { id }, select });
}

async function writeSignature(kind: NoteKind, id: string, data: Partial<SignatureColumns>): Promise<void> {
  if (kind === 'valoracion') await prisma.valoracion.update({ where: { id }, data });
  else if (kind === 'treatment') await prisma.treatment.update({ where: { id }, data });
  else await prisma.historiaClinica.update({ where: { id }, data });
}

/** A note's authorship and signature as the screens and the PDF show it. */
export interface NoteSignatureView {
  createdAt: string;
  createdByName: string | null;
  signed: { at: string; name: string; title: string | null; license: string | null } | null;
  legacy: boolean;
}

export function toSignatureView(row: SignatureColumns, createdByName: string | null): NoteSignatureView {
  return {
    createdAt: row.createdAt.toISOString(),
    createdByName,
    signed:
      row.signedAt && row.signerName
        ? { at: row.signedAt.toISOString(), name: row.signerName, title: row.signerTitle, license: row.signerLicense }
        : null,
    legacy: row.legacyRecord,
  };
}

/** The signature view of one note, with the author's current name. */
export async function noteSignature(kind: NoteKind, id: string): Promise<NoteSignatureView | null> {
  let row = await signatureRow(kind, id);
  if (!row) return null;
  if (kind === 'historiaClinica') {
    // The historia's line describes its current version: who last saved it and when.
    const latest = await latestRevision(id);
    if (latest) {
      row = { ...row, createdById: latest.changedById, createdAt: latest.changedAt, legacyRecord: latest.legacyRecord };
    }
  }
  const author = row.createdById
    ? await prisma.user.findUnique({ where: { id: row.createdById }, select: { fullName: true } })
    : null;
  return toSignatureView(row, author?.fullName ?? null);
}

export type SignerFailure =
  | 'NO_SIGNING_PIN'
  | 'LICENSE_REQUIRED'
  | 'WRONG_PIN'
  | 'TOO_MANY_ATTEMPTS';

export interface Signer {
  name: string;
  title: string | null;
  license: string;
}

/**
 * Checks the user's signing PIN and returns who signs, as it will be stamped. Shared by signing a
 * note and by writing an addendum; failures count against the same per-user limit.
 */
export async function verifySigner(
  userId: string,
  pin: string
): Promise<{ ok: true; signer: Signer } | { ok: false; code: SignerFailure; retryAfterSeconds?: number }> {
  const limit = pinFailures.check(userId);
  if (!limit.allowed) return { ok: false, code: 'TOO_MANY_ATTEMPTS', retryAfterSeconds: limit.retryAfterSeconds };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, professionalTitle: true, professionalLicense: true, signingPinHash: true },
  });
  if (!user?.signingPinHash) return { ok: false, code: 'NO_SIGNING_PIN' };
  if (!user.professionalLicense?.trim()) return { ok: false, code: 'LICENSE_REQUIRED' };
  if (!SIGNING_PIN_PATTERN.test(pin) || !(await verifyPassword(pin, user.signingPinHash))) {
    pinFailures.recordFailure(userId);
    return { ok: false, code: 'WRONG_PIN' };
  }
  pinFailures.reset(userId);
  return {
    ok: true,
    signer: { name: user.fullName, title: user.professionalTitle?.trim() || null, license: user.professionalLicense.trim() },
  };
}

export type SignResult =
  | { ok: true; signature: NoteSignatureView; patientId: string }
  | { ok: false; code: 'NOT_FOUND' | 'LEGACY_RECORD' | 'ALREADY_SIGNED' | SignerFailure; retryAfterSeconds?: number };

/** Signs a note with the user's PIN. The caller has already checked the user may edit it. */
export async function signNote(kind: NoteKind, id: string, userId: string, pin: string, now = new Date()): Promise<SignResult> {
  const row = await signatureRow(kind, id);
  if (!row) return { ok: false, code: 'NOT_FOUND' };
  if (row.legacyRecord) return { ok: false, code: 'LEGACY_RECORD' };
  if (row.signedAt) return { ok: false, code: 'ALREADY_SIGNED' };

  const verified = await verifySigner(userId, pin);
  if (!verified.ok) return verified;
  const { signer } = verified;

  const note = await noteContent(kind, id);
  if (!note) return { ok: false, code: 'NOT_FOUND' };
  const signedHash = hashContent(note.content);
  const stamp = {
    signedById: userId,
    signedAt: now,
    signerName: signer.name,
    signerTitle: signer.title,
    signerLicense: signer.license,
  };
  await writeSignature(kind, id, { ...stamp, signedHash });
  if (kind === 'historiaClinica') {
    // The signature belongs to the version being signed; it stays on that revision when the
    // historia is edited later.
    const revision = await recordRevision(id, note.content, userId);
    await stampRevisionSignature(revision.id, stamp);
  }
  const signature = await noteSignature(kind, id);
  return { ok: true, signature: signature as NoteSignatureView, patientId: note.patientId };
}

/**
 * After an edit: a signed note whose content no longer matches what was signed loses its signature,
 * and the caller records that in the audit log. Returns true when a signature was voided.
 */
export async function voidSignatureIfChanged(kind: NoteKind, id: string): Promise<boolean> {
  const row = await signatureRow(kind, id);
  if (!row?.signedAt) return false;
  const note = await noteContent(kind, id);
  if (note && row.signedHash === hashContent(note.content)) return false;
  await writeSignature(kind, id, {
    signedById: null,
    signedAt: null,
    signedHash: null,
    signerName: null,
    signerTitle: null,
    signerLicense: null,
  });
  return true;
}

/** Whether a signed note still matches the content that was signed. */
export async function signatureIntact(kind: NoteKind, id: string): Promise<boolean | null> {
  const row = await signatureRow(kind, id);
  if (!row?.signedAt) return null;
  const note = await noteContent(kind, id);
  return !!note && row.signedHash === hashContent(note.content);
}

/** The state of a note just before an edit, taken by `beginNoteEdit`. */
export interface NoteEditStart {
  kind: NoteKind;
  id: string;
  before: unknown;
}

/**
 * Called by every route that edits a note's content, before it writes. A signed valoración or
 * treatment visit answers 409 NOTE_SIGNED: it is corrected with an addendum. Returns the content
 * before the edit, for the audit log (null when the note does not exist; the route 404s itself).
 */
export async function beginNoteEdit(kind: NoteKind, id: string | null | undefined): Promise<NoteEditStart | null> {
  if (!id) return null;
  const row = await signatureRow(kind, id);
  if (!row) return null;
  if (row.signedAt && LOCKED_WHEN_SIGNED.includes(kind)) {
    throw new ApiProblem('NOTE_SIGNED', 'This note is signed; add an addendum instead of editing it', 409);
  }
  const note = await noteContent(kind, id);
  if (!note) return null;
  if (kind === 'historiaClinica') await ensureBaseRevision(id, note.content);
  return { kind, id, before: note.content };
}

/**
 * Diagram strokes are large and unreadable in a log: the audit records each view by a short hash,
 * which still shows which views changed.
 */
export function auditable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(auditable);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.entries(value as Record<string, unknown>);
    const isDiagram = 'view' in (value as object) && 'data' in (value as object);
    return Object.fromEntries(
      entries.map(([k, v]) => [k, isDiagram && k === 'data' ? hashContent(v).slice(0, 12) : auditable(v)])
    );
  }
  return value;
}

/** The top-level fields that differ between two versions of a note, with both values. */
export function diffContent(before: unknown, after: unknown): Record<string, { before: unknown; after: unknown }> {
  const a = (auditable(before) ?? {}) as Record<string, unknown>;
  const b = (auditable(after) ?? {}) as Record<string, unknown>;
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (stableStringify(a[key]) !== stableStringify(b[key])) {
      changes[key] = { before: JSON.parse(stableStringify(a[key])), after: JSON.parse(stableStringify(b[key])) };
    }
  }
  return changes;
}

/**
 * Called by every route that edits a note's content, after it writes. Records which fields changed
 * (before and after) in the audit log; for the historia clínica also keeps the new version as a
 * revision and voids the current signature when the content no longer matches it.
 */
export async function afterNoteEdit(
  kind: NoteKind,
  id: string | null | undefined,
  userId: string,
  patientId?: string | null,
  start?: NoteEditStart | null
): Promise<void> {
  if (!id) return;
  try {
    const note = await noteContent(kind, id);
    if (!note) return;
    const changes = start ? diffContent(start.before, note.content) : {};
    const voided = await voidSignatureIfChanged(kind, id);
    let revision: number | undefined;
    if (kind === 'historiaClinica') {
      const saved = await recordRevision(id, note.content, userId);
      if (saved.created) {
        revision = saved.revision;
        // Saved by a known user, the current version can be signed even if the first one was not.
        await prisma.historiaClinica.update({ where: { id }, data: { legacyRecord: false } });
      }
    }
    if (Object.keys(changes).length > 0 || voided) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'update',
          entity: ENTITY[kind],
          entityId: id,
          patientId: patientId ?? note.patientId,
          metadata: JSON.parse(
            stableStringify({ changes, signatureVoided: voided || undefined, revision })
          ),
        },
      });
    }
  } catch (error) {
    console.error('recording a note edit failed', error);
  }
}

export const ENTITY: Record<NoteKind, string> = {
  valoracion: 'Valoracion',
  treatment: 'Treatment',
  historiaClinica: 'HistoriaClinica',
};

/** The treatment visit a treatment item belongs to. */
export async function treatmentIdOfItem(itemId: string): Promise<string | null> {
  return (await prisma.treatmentItem.findUnique({ where: { id: itemId }, select: { treatmentId: true } }))?.treatmentId ?? null;
}
