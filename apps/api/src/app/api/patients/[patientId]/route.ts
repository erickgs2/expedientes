import { NextRequest, NextResponse } from 'next/server';
import {
  getPatientById,
  updatePatient,
  type UpdatePatientData,
} from '../../../../lib/patients/patient-search';
import { archivePatient, assertPatientWritable, normalizeArchiveReason } from '../../../../lib/patients/patient-archive';
import { checkContactLink, CONTACT_LINK_MESSAGES } from '../../../../lib/patients/notification-contact';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { prisma } from '../../../../lib/prisma/client';
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

    // Who archived it, by name, for the band on the archived record.
    const archivedBy = patient.archivedById
      ? await prisma.user.findUnique({ where: { id: patient.archivedById }, select: { fullName: true } })
      : null;

    return NextResponse.json({ patient: { ...patient, archivedByName: archivedBy?.fullName ?? null } });
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
    const body = (await request.json()) as {
      documentId?: string | null;
      phone?: string;
      contactPatientId?: string | null;
    };

    const current = await getPatientById(patientId);
    if (!current) return apiError('NOT_FOUND', 'Patient not found', 404);
    await assertPatientWritable(patientId);

    const data: UpdatePatientData = {};

    if (body.contactPatientId !== undefined) {
      const contactId = typeof body.contactPatientId === 'string' ? body.contactPatientId.trim() : '';
      if (contactId) {
        const problem = await checkContactLink(patientId, contactId);
        if (problem) return apiError(problem, CONTACT_LINK_MESSAGES[problem], 400);
        data.contactPatientId = contactId;
      } else {
        data.contactPatientId = null;
      }
    }
    // After this request, will the patient's notices go to a companion?
    const willHaveContact =
      data.contactPatientId !== undefined ? data.contactPatientId !== null : !!current.contactPatientId;

    if (body.documentId !== undefined) {
      const trimmed = typeof body.documentId === 'string' ? body.documentId.trim() : '';
      if (trimmed.length > MAX_DOCUMENT_ID_LENGTH) {
        return apiError('INVALID_INPUT', 'documentId is too long', 400);
      }
      data.documentId = trimmed || null;
    }

    if (body.phone !== undefined) {
      const trimmed = typeof body.phone === 'string' ? body.phone.trim() : '';
      // Blank is allowed only while a companion receives the notices; otherwise the reminders
      // would silently have nowhere to go.
      if (!trimmed && !willHaveContact) {
        return apiError('INVALID_INPUT', 'phone cannot be empty', 400);
      }
      if (trimmed.length > MAX_PHONE_LENGTH) {
        return apiError('INVALID_INPUT', 'phone is too long', 400);
      }
      data.phone = trimmed;
    }

    // Unlinking the companion of a patient with no phone of their own would leave them with no way
    // to be reached.
    if (!willHaveContact && !(data.phone ?? current.phone).trim()) {
      return apiError('INVALID_INPUT', 'A phone is required when no contact receives the notices', 400);
    }

    if (Object.keys(data).length === 0) {
      return apiError('INVALID_INPUT', 'documentId, phone or contactPatientId is required', 400);
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

/**
 * Archives the patient (NOM-004-SSA3-2012 5.4: the record is kept at least five years after the last
 * care, so nothing is deleted here). Keeps the `patients:delete` permission it always had: archiving
 * takes the patient off every work list, which is what deleting used to be for. Needs a reason, which
 * is shown on the archived record and kept in the audit log. Future appointments are cancelled.
 */
export const DELETE = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'patients', 'delete');

    const { patientId } = await params;
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = normalizeArchiveReason(body.reason);
    if (!reason) return apiError('INVALID_INPUT', 'reason is required (up to 500 characters)', 400);

    const result = await archivePatient(patientId, userId, reason);
    if (!result) return apiError('NOT_FOUND', 'Patient not found', 404);

    if (!result.alreadyArchived) {
      await writeAuditLogSafe({
        userId,
        action: 'archive',
        entity: 'Patient',
        entityId: patientId,
        patientId,
        metadata: { reason, cancelledAppointments: result.cancelledAppointments },
      });
    }

    return NextResponse.json({ archived: true, cancelledAppointments: result.cancelledAppointments });
  }
);
