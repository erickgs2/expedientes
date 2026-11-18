import { NextRequest, NextResponse } from 'next/server';
import { NOTE_KINDS, NOTE_PERMISSION, signNote, type NoteKind } from '../../../../lib/signature/note-signature';
import { assertPatientWritable } from '../../../../lib/patients/patient-archive';
import { noteContent } from '../../../../lib/signature/note-signature';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

const ERRORS = {
  NOT_FOUND: [404, 'Note not found'],
  LEGACY_RECORD: [409, 'Notes written before electronic signatures cannot be signed'],
  ALREADY_SIGNED: [409, 'This note is already signed'],
  NO_SIGNING_PIN: [409, 'Set your signing PIN in your profile first'],
  LICENSE_REQUIRED: [409, 'Add your professional licence to your profile first'],
  WRONG_PIN: [403, 'Wrong signing PIN'],
  TOO_MANY_ATTEMPTS: [429, 'Too many wrong PINs. Try again later.'],
} as const;

/**
 * Signs a valoración, treatment visit or clinical history with the user's signing PIN
 * (NOM-004-SSA3-2012 5.10). Whoever may edit that kind of note may sign it.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; id?: unknown; pin?: unknown };
  if (!NOTE_KINDS.includes(body.kind as NoteKind) || typeof body.id !== 'string' || typeof body.pin !== 'string') {
    return apiError('INVALID_INPUT', 'kind, id and pin are required', 400);
  }
  const kind = body.kind as NoteKind;
  const userId = await requireAuth(request, NOTE_PERMISSION[kind], 'edit');

  const note = await noteContent(kind, body.id);
  if (!note) return apiError('NOT_FOUND', 'Note not found', 404);
  await assertPatientWritable(note.patientId);

  const result = await signNote(kind, body.id, userId, body.pin);
  if (!result.ok) {
    const [status, message] = ERRORS[result.code];
    const response = apiError(result.code, message, status);
    if (result.retryAfterSeconds) response.headers.set('Retry-After', String(result.retryAfterSeconds));
    return response;
  }

  await writeAuditLogSafe({
    userId,
    action: 'sign',
    entity: { valoracion: 'Valoracion', treatment: 'Treatment', historiaClinica: 'HistoriaClinica' }[kind],
    entityId: body.id,
    patientId: result.patientId,
  });
  return NextResponse.json({ signature: result.signature });
});
