import { NextRequest, NextResponse } from 'next/server';
import { createPhoto, getValoracionPatientId, listPhotos } from '../../../../../lib/photo/photo';
import { saveFile } from '../../../../../lib/storage/file-storage';
import { isJpeg } from '../../../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

const VALID_TAGS = ['BEFORE', 'AFTER'] as const;

// App Router route handlers have no built-in body-size limit, and this is the app's only
// binary-upload/disk-write endpoint — without a ceiling, any `valoracion:edit` user could exhaust
// memory or fill the storage volume.
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // capture produces roughly 0.3–1 MB; generous headroom
const MIN_PHOTO_BYTES = 1024; // rejects trivially-truncated/malformed uploads

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'valoracion', 'view');
    const { id } = await params;

    const patientId = await getValoracionPatientId(id);
    if (!patientId) return apiError('NOT_FOUND', 'Valoración not found', 404);

    const photos = await listPhotos(id);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'PhotoList',
      entityId: id,
      patientId,
    });

    return NextResponse.json({ photos });
  }
);

export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'valoracion', 'edit');
    const { id } = await params;

    // Cheap early-out so an obviously-oversized request is never buffered. Not authoritative —
    // the header can be absent, wrong, or avoided with chunked encoding — so the real check runs
    // against the read buffer below.
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PHOTO_BYTES) {
      return apiError('INVALID_INPUT', 'Photo is too large', 413);
    }

    const patientId = await getValoracionPatientId(id);
    if (!patientId) return apiError('NOT_FOUND', 'Valoración not found', 404);

    const formData = await request.formData();
    const file = formData.get('photo');
    const tag = formData.get('tag');

    if (!(file instanceof Blob)) {
      return apiError('INVALID_INPUT', 'photo file is required', 400);
    }
    if (typeof tag !== 'string' || !VALID_TAGS.includes(tag as (typeof VALID_TAGS)[number])) {
      return apiError('INVALID_INPUT', 'tag must be BEFORE or AFTER', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // The authoritative size check: what was actually read, not what the client declared.
    if (buffer.length > MAX_PHOTO_BYTES || buffer.length < MIN_PHOTO_BYTES) {
      return apiError('INVALID_INPUT', 'Photo is too large or too small', 400);
    }
    // Never trust the client's declared content-type — verify the actual bytes, the same
    // discipline this project applies to any other untrusted stored data.
    if (!isJpeg(buffer)) {
      return apiError('INVALID_INPUT', 'File must be a JPEG image', 400);
    }

    const filePath = await saveFile(buffer, 'photos', patientId, 'photo.jpg');
    const photo = await createPhoto(id, patientId, tag as 'BEFORE' | 'AFTER', filePath);

    await writeAuditLogSafe({
      userId,
      action: 'create',
      entity: 'Photo',
      entityId: photo.id,
      patientId,
    });

    return NextResponse.json({ photo }, { status: 201 });
  }
);
