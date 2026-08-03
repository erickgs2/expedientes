import { NextRequest, NextResponse } from 'next/server';
import { getTreatmentItemDetail, signTreatmentItemConsent } from '../../../../../lib/treatment/consent';
import { isJpeg } from '../../../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

// Same ceiling/floor as the photo-upload endpoint — this app's only other binary-upload route.
const MAX_SIGNATURE_BYTES = 10 * 1024 * 1024;
const MIN_SIGNATURE_BYTES = 1024;

export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id } = await params;

    // Cheap early-out so an obviously-oversized request is never buffered — not authoritative,
    // the real check runs against the actually-read buffer below.
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_SIGNATURE_BYTES) {
      return apiError('INVALID_INPUT', 'Signature is too large', 413);
    }

    const item = await getTreatmentItemDetail(id);
    if (!item) return apiError('NOT_FOUND', 'Treatment item not found', 404);
    if (item.consent) {
      return apiError('CONFLICT', 'This treatment item already has a signed consent', 409);
    }

    const formData = await request.formData();
    const signature = formData.get('signature');
    if (!(signature instanceof Blob)) {
      return apiError('INVALID_INPUT', 'signature file is required', 400);
    }

    const buffer = Buffer.from(await signature.arrayBuffer());
    // The authoritative size check: what was actually read, not what the client declared.
    if (buffer.length > MAX_SIGNATURE_BYTES || buffer.length < MIN_SIGNATURE_BYTES) {
      return apiError('INVALID_INPUT', 'Signature is too large or too small', 400);
    }
    // Never trust the client's declared content-type — verify the actual bytes.
    if (!isJpeg(buffer)) {
      return apiError('INVALID_INPUT', 'signature must be a JPEG image', 400);
    }

    const result = await signTreatmentItemConsent(id, buffer);
    if (!result) return apiError('NOT_FOUND', 'Treatment item not found', 404);

    await writeAuditLogSafe({
      userId,
      action: 'create',
      entity: 'Consent',
      entityId: result.consent.id,
      patientId: result.patientId,
    });

    return NextResponse.json({ consent: result.consent }, { status: 201 });
  }
);
