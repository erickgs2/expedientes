import { NextRequest, NextResponse } from 'next/server';
import {
  ADDENDUM_KINDS,
  ADDENDUM_TEXT_MAX,
  createAddendum,
  listAddenda,
  parseAddendumDiagrams,
  type AddendumKind,
} from '../../../../lib/signature/addenda';
import { NOTE_PERMISSION, noteContent } from '../../../../lib/signature/note-signature';
import { assertPatientWritable } from '../../../../lib/patients/patient-archive';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

const ERRORS = {
  NOT_FOUND: [404, 'Note not found'],
  NOTE_NOT_SIGNED: [409, 'Only a signed note takes addenda; edit the draft instead'],
  NO_SIGNING_PIN: [409, 'Set your signing PIN in your profile first'],
  LICENSE_REQUIRED: [409, 'Add your professional licence to your profile first'],
  WRONG_PIN: [403, 'Wrong signing PIN'],
  TOO_MANY_ATTEMPTS: [429, 'Too many wrong PINs. Try again later.'],
} as const;

/** The addenda of a signed valoración or treatment visit, oldest first. */
export const GET = withApiErrors(async (request: NextRequest) => {
  const kind = request.nextUrl.searchParams.get('kind') as AddendumKind;
  const id = request.nextUrl.searchParams.get('id');
  if (!ADDENDUM_KINDS.includes(kind) || !id) return apiError('INVALID_INPUT', 'kind and id are required', 400);
  await requireAuth(request, NOTE_PERMISSION[kind], 'view');
  if (!(await noteContent(kind, id))) return apiError('NOT_FOUND', 'Note not found', 404);
  return NextResponse.json({ addenda: await listAddenda(kind, id) });
});

/**
 * Writes and signs an addendum to a signed note (NOM-004-SSA3-2012 5.10). Whoever may edit that
 * kind of note may add one; addenda are never edited or deleted.
 */
export const POST = withApiErrors(async (request: NextRequest) => {
  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    id?: unknown;
    text?: unknown;
    diagrams?: unknown;
    pin?: unknown;
  };
  if (!ADDENDUM_KINDS.includes(body.kind as AddendumKind) || typeof body.id !== 'string' || typeof body.pin !== 'string') {
    return apiError('INVALID_INPUT', 'kind, id and pin are required', 400);
  }
  const kind = body.kind as AddendumKind;
  const userId = await requireAuth(request, NOTE_PERMISSION[kind], 'edit');

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const diagrams = parseAddendumDiagrams(body.diagrams);
  if (!diagrams) return apiError('INVALID_INPUT', 'diagrams must be a list of {view, data}', 400);
  if (!text && diagrams.length === 0) return apiError('INVALID_INPUT', 'An addendum needs text or a diagram', 400);
  if (text.length > ADDENDUM_TEXT_MAX) return apiError('INVALID_INPUT', `text is limited to ${ADDENDUM_TEXT_MAX} characters`, 400);

  const note = await noteContent(kind, body.id);
  if (!note) return apiError('NOT_FOUND', 'Note not found', 404);
  await assertPatientWritable(note.patientId);

  const result = await createAddendum(kind, body.id, userId, { text, diagrams, pin: body.pin });
  if (!result.ok) {
    const [status, message] = ERRORS[result.code];
    const response = apiError(result.code, message, status);
    if (result.retryAfterSeconds) response.headers.set('Retry-After', String(result.retryAfterSeconds));
    return response;
  }

  await writeAuditLogSafe({
    userId,
    action: 'create',
    entity: 'ClinicalAddendum',
    entityId: result.addendum.id,
    patientId: result.patientId,
    metadata: { note: kind, noteId: body.id },
  });
  return NextResponse.json({ addendum: result.addendum }, { status: 201 });
});
