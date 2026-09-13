import { NextRequest, NextResponse } from 'next/server';
import {
  getPatientById,
  updatePatient,
  type UpdatePatientData,
} from '../../../../lib/patients/patient-search';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'patients', 'view');

    const { patientId } = await params;
    const patient = await getPatientById(patientId);
    if (!patient) return apiError('NOT_FOUND', 'Patient not found', 404);

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'Patient',
      entityId: patient.id,
      patientId: patient.id,
    });

    return NextResponse.json({ patient });
  }
);

const MAX_DOCUMENT_ID_LENGTH = 64;
const MAX_PHONE_LENGTH = 32;

/**
 * Updates the patient's own record: the CURP and the phone number, the two fields that routinely
 * need correcting after registration — a CURP because it is optional at first, a phone because it
 * gets mistyped or simply changes.
 *
 * `fullName` deliberately stays out. A patient's name changing under existing consents, exports and
 * audit entries is not a field edit; it deserves its own considered flow.
 *
 * Each field is independent: omit one and its stored value is untouched. An empty `documentId`
 * clears it back to NULL, so "not recorded" stays distinguishable from "recorded as empty". An
 * empty `phone` is rejected instead — the column is non-null, and a blank number would silently
 * stop that patient's WhatsApp appointment reminders with nothing on screen to explain why.
 */
export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'patients', 'edit');

    const { patientId } = await params;
    const body = (await request.json()) as { documentId?: string | null; phone?: string };

    const data: UpdatePatientData = {};

    if (body.documentId !== undefined) {
      const trimmed = typeof body.documentId === 'string' ? body.documentId.trim() : '';
      if (trimmed.length > MAX_DOCUMENT_ID_LENGTH) {
        return apiError('INVALID_INPUT', 'documentId is too long', 400);
      }
      data.documentId = trimmed || null;
    }

    if (body.phone !== undefined) {
      const trimmed = typeof body.phone === 'string' ? body.phone.trim() : '';
      if (!trimmed) {
        return apiError('INVALID_INPUT', 'phone cannot be empty', 400);
      }
      if (trimmed.length > MAX_PHONE_LENGTH) {
        return apiError('INVALID_INPUT', 'phone is too long', 400);
      }
      data.phone = trimmed;
    }

    if (Object.keys(data).length === 0) {
      return apiError('INVALID_INPUT', 'documentId or phone is required', 400);
    }

    // No existence pre-check needed: Prisma's update throws P2025 for a missing id, which
    // `withApiErrors` already maps to a 404.
    const patient = await updatePatient(patientId, data);

    await writeAuditLogSafe({
      userId,
      action: 'update',
      entity: 'Patient',
      entityId: patient.id,
      patientId: patient.id,
    });

    return NextResponse.json({ patient });
  }
);
