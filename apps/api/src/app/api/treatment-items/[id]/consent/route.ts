import { NextRequest, NextResponse } from 'next/server';
import type { ConsentSection } from '@expedientes/shared-types';
import { getTreatmentItemDetail, signTreatmentItemConsent } from '../../../../../lib/treatment/consent';
import { buildConsentDocument } from '../../../../../lib/consent/build-consent-document';
import { CONSENT_LABELS } from '../../../../../lib/consent/consent-labels';
import { isJpeg } from '../../../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

// Same ceiling/floor as the photo-upload endpoint — this app's only other binary-upload routes.
// Doubled here relative to a single-image upload because a witnessed consent carries two signature
// images in the one request; each individual image is still held to MAX_SIGNATURE_BYTES below.
const MAX_SIGNATURE_BYTES = 10 * 1024 * 1024;
const MIN_SIGNATURE_BYTES = 1024;
const MAX_REQUEST_BYTES = MAX_SIGNATURE_BYTES * 2;
const MAX_FIELD_LENGTH = 200;

export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id } = await params;

    // Cheap early-out so an obviously-oversized request is never buffered — not authoritative,
    // the real check runs against the actually-read buffers below.
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return apiError('INVALID_INPUT', 'Request is too large', 413);
    }

    const item = await getTreatmentItemDetail(id);
    if (!item) return apiError('NOT_FOUND', 'Treatment item not found', 404);
    if (item.consent) {
      return apiError('CONFLICT', 'This treatment item already has a signed consent', 409);
    }

    const formData = await request.formData();
    const place = formData.get('place');
    const patientIdentification = formData.get('patientIdentification');
    const witnessNameRaw = formData.get('witnessName');
    const patientSignature = formData.get('patientSignature');
    const witnessSignature = formData.get('witnessSignature');
    const templateUpdatedAt = formData.get('templateUpdatedAt');
    const settingsUpdatedAt = formData.get('settingsUpdatedAt');

    if (typeof place !== 'string' || !place.trim()) {
      return apiError('INVALID_INPUT', 'place is required', 400);
    }
    const placeTrimmed = place.trim();
    if (placeTrimmed.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', 'place is too long', 400);
    }
    if (typeof patientIdentification !== 'string' || !patientIdentification.trim()) {
      return apiError('INVALID_INPUT', 'patientIdentification is required', 400);
    }
    const patientIdentificationTrimmed = patientIdentification.trim();
    if (patientIdentificationTrimmed.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', 'patientIdentification is too long', 400);
    }

    const witnessNameTrimmed = typeof witnessNameRaw === 'string' ? witnessNameRaw.trim() : '';
    const hasWitnessName = witnessNameTrimmed.length > 0;
    const hasWitnessSignature = witnessSignature instanceof Blob;
    // A witness is either fully present or fully absent — a name with no signature (or a signature
    // with no name) can't be reconciled into a single consistent "who witnessed this" answer.
    if (hasWitnessName !== hasWitnessSignature) {
      return apiError(
        'INVALID_INPUT',
        'A witness name requires a witness signature, and vice versa',
        400
      );
    }
    if (witnessNameTrimmed.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', 'witnessName is too long', 400);
    }

    if (!(patientSignature instanceof Blob)) {
      return apiError('INVALID_INPUT', 'patientSignature file is required', 400);
    }
    if (typeof templateUpdatedAt !== 'string' || !templateUpdatedAt) {
      return apiError('INVALID_INPUT', 'templateUpdatedAt is required', 400);
    }
    // The client only ever supplies this to prove it saw the SAME template version being signed —
    // never the text itself. If the catalog template changed since the page loaded, reject so the
    // patient doesn't end up signing text they never actually read.
    if (new Date(templateUpdatedAt).getTime() !== item.consentTemplateUpdatedAt.getTime()) {
      return apiError(
        'CONFLICT',
        'The consent template has changed since this page was loaded — please reload and try again',
        409
      );
    }
    if (typeof settingsUpdatedAt !== 'string') {
      return apiError('INVALID_INPUT', 'settingsUpdatedAt is required', 400);
    }
    // Same rule, extended to the clinic identity and declarations: the client only ever supplies a
    // version token for the settings it saw, never the clinic name, declarations, or doctor identity
    // themselves — so a tampered request cannot alter what the record says was agreed to or who it
    // says the physician is. An empty token pairs with "no settings snapshot was ever seen" (item
    // has none either), which still lets a legitimate NO_CLINIC_IDENTITY rejection happen below.
    const currentSettingsUpdatedAt = item.settingsUpdatedAt ? item.settingsUpdatedAt.getTime() : null;
    const incomingSettingsUpdatedAt = settingsUpdatedAt ? new Date(settingsUpdatedAt).getTime() : null;
    if (currentSettingsUpdatedAt !== incomingSettingsUpdatedAt) {
      return apiError(
        'CONFLICT',
        'The clinic settings changed since this page was loaded — please reload and try again',
        409
      );
    }

    const patientBuffer = Buffer.from(await patientSignature.arrayBuffer());
    // The authoritative size check: what was actually read, not what the client declared.
    if (patientBuffer.length > MAX_SIGNATURE_BYTES || patientBuffer.length < MIN_SIGNATURE_BYTES) {
      return apiError('INVALID_INPUT', 'Signature is too large or too small', 400);
    }
    // Never trust the client's declared content-type — verify the actual bytes.
    if (!isJpeg(patientBuffer)) {
      return apiError('INVALID_INPUT', 'patientSignature must be a JPEG image', 400);
    }

    let witnessBuffer: Buffer | null = null;
    if (witnessSignature instanceof Blob) {
      witnessBuffer = Buffer.from(await witnessSignature.arrayBuffer());
      if (witnessBuffer.length > MAX_SIGNATURE_BYTES || witnessBuffer.length < MIN_SIGNATURE_BYTES) {
        return apiError('INVALID_INPUT', 'Signature is too large or too small', 400);
      }
      if (!isJpeg(witnessBuffer)) {
        return apiError('INVALID_INPUT', 'witnessSignature must be a JPEG image', 400);
      }
    }

    const result = await signTreatmentItemConsent(id, {
      place: placeTrimmed,
      patientIdentification: patientIdentificationTrimmed,
      witnessName: hasWitnessName ? witnessNameTrimmed : null,
      patientSignature: patientBuffer,
      witnessSignature: witnessBuffer,
    });
    if (!result) return apiError('NOT_FOUND', 'Treatment item not found', 404);
    if (result === 'NO_CLINIC_IDENTITY') {
      return apiError(
        'CONFLICT',
        'Clinic settings are incomplete: set the doctor name and licence number before signing consents',
        409
      );
    }

    await writeAuditLogSafe({
      userId,
      action: 'create',
      entity: 'Consent',
      entityId: result.consent.id,
      patientId: result.patientId,
    });

    // Built fresh from the snapshot that was just written, so the screen can render the signed
    // document without a refetch.
    const consentDocument = buildConsentDocument({
      clinicName: result.consent.clinicNameSnapshot,
      doctorTitle: result.consent.doctorTitleSnapshot,
      doctorName: result.consent.doctorNameSnapshot,
      doctorLicense: result.consent.doctorLicenseSnapshot,
      patientName: result.consent.patientNameSnapshot,
      patientIdentification: result.consent.patientIdentification,
      place: result.consent.place,
      signedDate: result.consent.signedDateSnapshot,
      declarationBefore: result.consent.declarationBeforeSnapshot,
      declarationAfter: result.consent.declarationAfterSnapshot,
      sections: result.consent.sections as unknown as ConsentSection[],
      witnessName: result.consent.witnessName,
      labels: CONSENT_LABELS.es,
    });

    return NextResponse.json(
      {
        consent: {
          id: result.consent.id,
          place: result.consent.place,
          patientIdentification: result.consent.patientIdentification,
          witnessName: result.consent.witnessName,
          patientSignatureImagePath: result.consent.patientSignatureImagePath,
          witnessSignatureImagePath: result.consent.witnessSignatureImagePath,
          signedAt: result.consent.signedAt,
        },
        consentDocument,
      },
      { status: 201 }
    );
  }
);
