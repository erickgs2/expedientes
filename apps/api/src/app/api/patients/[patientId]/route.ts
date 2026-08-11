import { NextRequest, NextResponse } from 'next/server';
import { getPatientById, updatePatient } from '../../../../lib/patients/patient-search';
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

/**
 * Updates the patient's own record. Only the CURP is editable here — it is optional at
 * registration, so it needs a way in later, and the clinical-history screen is where it is filled.
 * Name and phone stay out deliberately: nothing asks to edit them yet, and a patient's identity
 * changing under existing clinical records deserves its own deliberate flow.
 *
 * An omitted `documentId` leaves the stored value alone; an empty one clears it back to NULL, so
 * "not recorded" stays distinguishable from "recorded as empty".
 */
export const PATCH = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'patients', 'edit');

    const { patientId } = await params;
    const body = (await request.json()) as { documentId?: string | null };

    if (body.documentId === undefined) {
      return apiError('INVALID_INPUT', 'documentId is required', 400);
    }
    const trimmed = typeof body.documentId === 'string' ? body.documentId.trim() : '';
    if (trimmed.length > MAX_DOCUMENT_ID_LENGTH) {
      return apiError('INVALID_INPUT', 'documentId is too long', 400);
    }

    // No existence pre-check needed: Prisma's update throws P2025 for a missing id, which
    // `withApiErrors` already maps to a 404.
    const patient = await updatePatient(patientId, { documentId: trimmed || null });

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
