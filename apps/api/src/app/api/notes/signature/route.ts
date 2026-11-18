import { NextRequest, NextResponse } from 'next/server';
import { NOTE_KINDS, NOTE_PERMISSION, noteSignature, type NoteKind } from '../../../../lib/signature/note-signature';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/** Who recorded a note, when, and whether and by whom it is signed. `?kind=…&id=…` */
export const GET = withApiErrors(async (request: NextRequest) => {
  const kind = request.nextUrl.searchParams.get('kind') as NoteKind | null;
  const id = request.nextUrl.searchParams.get('id');
  if (!kind || !NOTE_KINDS.includes(kind) || !id) return apiError('INVALID_INPUT', 'kind and id are required', 400);
  await requireAuth(request, NOTE_PERMISSION[kind], 'view');
  const signature = await noteSignature(kind, id);
  if (!signature) return apiError('NOT_FOUND', 'Note not found', 404);
  return NextResponse.json({ signature });
});
