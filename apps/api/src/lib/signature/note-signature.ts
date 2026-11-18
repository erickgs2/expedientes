import { createHash } from 'node:crypto';
import { prisma } from '../prisma/client';
import { verifyPassword } from '../auth/password';
import { createFailureLimiter } from '../auth/failure-limiter';

/**
 * NOM-004-SSA3-2012 5.10: every note in the record carries the date, time, full name of whoever
 * wrote it, and their signature (autograph, electronic or digital). MedCloud signs with a simple
 * electronic signature: the author confirms with a personal 6-digit PIN, and the note keeps who
 * signed, when, their name, title and licence as they were at that moment, and a SHA-256 of the
 * note's content. Editing a signed note voids the signature (phase C replaces this with locking
 * and addenda). Notes written before signatures existed (`legacyRecord`) are never signed later.
 */
export type NoteKind = 'valoracion' | 'treatment' | 'historiaClinica';

export const NOTE_KINDS: NoteKind[] = ['valoracion', 'treatment', 'historiaClinica'];

/** The permission module whose `edit` right lets someone sign a note of this kind. */
export const NOTE_PERMISSION: Record<NoteKind, string> = {
  valoracion: 'valoracion',
  treatment: 'treatments',
  historiaClinica: 'historia-clinica',
};

export const SIGNING_PIN_PATTERN = /^\d{6}$/;

/** Five wrong PINs in 15 minutes lock signing for that user until the window passes. */
export const pinFailures = createFailureLimiter({ maxFailures: 5, windowMs: 15 * 60_000 });

/** JSON with object keys sorted at every level, so the same content always hashes the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function hashContent(content: unknown): string {
  return createHash('sha256').update(stableStringify(content)).digest('hex');
}

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
        items: t.items
          .map((i) => ({
            treatmentTypeId: i.treatmentTypeId,
            notes: i.notes,
            diagrams: i.diagrams.map((d) => ({ view: d.view, data: d.data })).sort(byKey((d) => d.view)),
            products: i.products.map((p) => ({ brand: p.brand, lotNumber: p.lotNumber, expiryDate: p.expiryDate })),
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
  return { patientId, content: { ...fields, allergies: allergies.map((a) => a.allergy.name).sort() } };
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
  const row = await signatureRow(kind, id);
  if (!row) return null;
  const author = row.createdById
    ? await prisma.user.findUnique({ where: { id: row.createdById }, select: { fullName: true } })
    : null;
  return toSignatureView(row, author?.fullName ?? null);
}

export type SignResult =
  | { ok: true; signature: NoteSignatureView; patientId: string }
  | { ok: false; code: 'NOT_FOUND' | 'LEGACY_RECORD' | 'ALREADY_SIGNED' | 'NO_SIGNING_PIN' | 'LICENSE_REQUIRED' | 'WRONG_PIN' | 'TOO_MANY_ATTEMPTS'; retryAfterSeconds?: number };

/** Signs a note with the user's PIN. The caller has already checked the user may edit it. */
export async function signNote(kind: NoteKind, id: string, userId: string, pin: string, now = new Date()): Promise<SignResult> {
  const row = await signatureRow(kind, id);
  if (!row) return { ok: false, code: 'NOT_FOUND' };
  if (row.legacyRecord) return { ok: false, code: 'LEGACY_RECORD' };
  if (row.signedAt) return { ok: false, code: 'ALREADY_SIGNED' };

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

  const note = await noteContent(kind, id);
  if (!note) return { ok: false, code: 'NOT_FOUND' };
  await writeSignature(kind, id, {
    signedById: userId,
    signedAt: now,
    signedHash: hashContent(note.content),
    signerName: user.fullName,
    signerTitle: user.professionalTitle?.trim() || null,
    signerLicense: user.professionalLicense.trim(),
  });
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

/**
 * Called by every route that edits a note's content: voids a signature that no longer matches and
 * records it in the audit log, so a changed note never keeps showing a signature for other words.
 */
export async function afterNoteEdit(
  kind: NoteKind,
  id: string | null | undefined,
  userId: string,
  patientId?: string | null
): Promise<void> {
  if (!id) return;
  try {
    if (await voidSignatureIfChanged(kind, id)) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'update',
          entity: ENTITY[kind],
          entityId: id,
          patientId: patientId ?? undefined,
          metadata: { signatureVoided: true },
        },
      });
    }
  } catch (error) {
    console.error('signature check after edit failed', error);
  }
}

const ENTITY: Record<NoteKind, string> = {
  valoracion: 'Valoracion',
  treatment: 'Treatment',
  historiaClinica: 'HistoriaClinica',
};

/** The treatment visit a treatment item belongs to. */
export async function treatmentIdOfItem(itemId: string): Promise<string | null> {
  return (await prisma.treatmentItem.findUnique({ where: { id: itemId }, select: { treatmentId: true } }))?.treatmentId ?? null;
}
