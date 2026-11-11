import { NextRequest, NextResponse } from 'next/server';
import { registerPaperConsents } from '../../../../../lib/treatment/consent-scan';
import { localSigningDate } from '../../../../../lib/consent/build-consent-document';
import {
  MAX_SCAN_PAGE_BYTES,
  MAX_SCAN_PAGES,
  validateScanPages,
  validateSignedDate,
} from '../../../../../lib/consent/scan-validation';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

const MAX_FIELD_LENGTH = 200;
const MAX_REQUEST_BYTES = MAX_SCAN_PAGE_BYTES * MAX_SCAN_PAGES;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id } = await params;

    // Cheap early-out only; the authoritative size check runs on the buffers actually read.
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return apiError('INVALID_INPUT', 'Request is too large', 413);
    }

    const formData = await request.formData();
    const itemIds = formData.getAll('itemIds').filter((v): v is string => typeof v === 'string');
    const signedDate = text(formData, 'signedDate');
    const place = text(formData, 'place');
    const patientIdentification = text(formData, 'patientIdentification');
    const witnessName = text(formData, 'witnessName');

    const dateError = validateSignedDate(signedDate, localSigningDate());
    if (dateError) return apiError('INVALID_INPUT', dateError, 400);
    if (!place || place.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', 'place is required and must be short', 400);
    }
    if (!patientIdentification || patientIdentification.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', 'patientIdentification is required and must be short', 400);
    }
    if (witnessName.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', 'witnessName is too long', 400);
    }

    const files = formData.getAll('pages').filter((v): v is File => v instanceof File);
    const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
    const validated = validateScanPages(buffers);
    if (!validated.ok) return apiError('INVALID_INPUT', validated.message, 400);

    const result = await registerPaperConsents(id, {
      itemIds,
      signedDate,
      place,
      patientIdentification,
      witnessName: witnessName || null,
      pages: validated.pages,
    });

    if (result === 'NOT_FOUND') return apiError('NOT_FOUND', 'Treatment not found', 404);
    if (result === 'NO_CLINIC_IDENTITY') {
      return apiError(
        'CONFLICT',
        'Clinic settings are incomplete: set the doctor name and licence number before registering consents',
        409
      );
    }
    if ('error' in result) {
      return result.error === 'ALREADY_SIGNED'
        ? apiError('CONFLICT', result.message, 409)
        : apiError('INVALID_INPUT', result.message, 400);
    }

    await writeAuditLogSafe({
      userId,
      action: 'create',
      entity: 'ConsentScan',
      entityId: result.scanId,
      patientId: result.patientId,
      metadata: { consentIds: result.consentIds, pages: validated.pages.length },
    });

    return NextResponse.json(
      { scanId: result.scanId, consentIds: result.consentIds },
      { status: 201 }
    );
  }
);
