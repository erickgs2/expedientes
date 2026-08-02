import { NextRequest, NextResponse } from 'next/server';
import { createPhoto, getValoracionPatientId, listPhotos } from '../../../../../lib/photo/photo';
import { saveFile } from '../../../../../lib/storage/file-storage';
import { isJpeg } from '../../../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

const VALID_TAGS = ['BEFORE', 'AFTER'] as const;

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
