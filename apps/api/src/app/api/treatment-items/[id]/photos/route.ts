import { NextRequest, NextResponse } from 'next/server';
import { createTreatmentItemPhoto, listTreatmentItemPhotos } from '../../../../../lib/treatment/photo';
import { getTreatmentItemDetail } from '../../../../../lib/treatment/consent';
import { saveFile } from '../../../../../lib/storage/file-storage';
import { isJpeg } from '../../../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

const VALID_TAGS = ['BEFORE', 'AFTER'] as const;

// Same ceiling/floor as the Valoración photo endpoint — this app's only other binary-upload route
// for this content type.
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MIN_PHOTO_BYTES = 1024;

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'view');
    const { id } = await params;

    const item = await getTreatmentItemDetail(id);
    if (!item) return apiError('NOT_FOUND', 'Treatment item not found', 404);

    const photos = await listTreatmentItemPhotos(id);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'TreatmentItemPhotoList',
      entityId: id,
      patientId: item.patientId,
    });

    return NextResponse.json({ photos });
  }
);

export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id } = await params;

    // Cheap early-out so an obviously-oversized request is never buffered — not authoritative,
    // the real check runs against the actually-read buffer below.
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PHOTO_BYTES) {
      return apiError('INVALID_INPUT', 'Photo is too large', 413);
    }

    const item = await getTreatmentItemDetail(id);
    if (!item) return apiError('NOT_FOUND', 'Treatment item not found', 404);

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
    // Never trust the client's declared content-type — verify the actual bytes.
    if (!isJpeg(buffer)) {
      return apiError('INVALID_INPUT', 'File must be a JPEG image', 400);
    }

    const filePath = await saveFile(buffer, 'treatment-photos', item.patientId, 'photo.jpg');
    const photo = await createTreatmentItemPhoto(
      id,
      item.patientId,
      tag as 'BEFORE' | 'AFTER',
      filePath
    );

    await writeAuditLogSafe({
      userId,
      action: 'create',
      entity: 'TreatmentItemPhoto',
      entityId: photo.id,
      patientId: item.patientId,
    });

    return NextResponse.json({ photo }, { status: 201 });
  }
);
