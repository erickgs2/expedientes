import { NextRequest, NextResponse } from 'next/server';
import {
  consentDocumentFromSnapshot,
  getTreatmentItemDetail,
  signTreatmentItemConsent,
} from '../../../../../lib/treatment/consent';
import { isJpeg } from '../../../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';
import { assertRecordWritable } from '../../../../../lib/patients/patient-archive';

// Same ceiling/floor as the photo-upload endpoint — this app's only other binary-upload routes.
// Tripled here relative to a single-image upload because a consent carries up to three signature
// images in the one request (patient and up to two witnesses); each image is still held to
// MAX_SIGNATURE_BYTES below.
const MAX_SIGNATURE_BYTES = 10 * 1024 * 1024;
const MIN_SIGNATURE_BYTES = 1024;
const MAX_REQUEST_BYTES = MAX_SIGNATURE_BYTES * 3;
const MAX_FIELD_LENGTH = 200;

export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'edit');
    const { id } = await params;
    await assertRecordWritable('treatmentItem', id);

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
    const secondWitnessNameRaw = formData.get('secondWitnessName');
    const secondWitnessSignature = formData.get('secondWitnessSignature');
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

    // Witnesses are optional: the clinic decides whether a consent carries them (NOM-004-SSA3-2012
    // 10.1.1 asks for two; leaving them out is the clinic's call). A witness given is whole: a name
    // with a signature. The second one may use the clinic's stored signature instead of signing here.
    const witnessNameTrimmed = typeof witnessNameRaw === 'string' ? witnessNameRaw.trim() : '';
    const secondWitnessNameTrimmed = typeof secondWitnessNameRaw === 'string' ? secondWitnessNameRaw.trim() : '';
    const useClinicSecondWitness = formData.get('useClinicSecondWitnessSignature') === 'true';
    const hasWitnessSignature = witnessSignature instanceof Blob;
    const hasSecondSignature = secondWitnessSignature instanceof Blob || useClinicSecondWitness;
    if (!!witnessNameTrimmed !== hasWitnessSignature) {
      return apiError('WITNESS_INCOMPLETE', 'The first witness needs both a name and a signature, or neither', 400);
    }
    if (!!secondWitnessNameTrimmed !== hasSecondSignature) {
      return apiError('WITNESS_INCOMPLETE', 'The second witness needs both a name and a signature, or neither', 400);
    }
    if (witnessNameTrimmed.length > MAX_FIELD_LENGTH || secondWitnessNameTrimmed.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', 'witness name is too long', 400);
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

    const readSignature = async (file: Blob, field: string): Promise<Buffer | string> => {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > MAX_SIGNATURE_BYTES || buffer.length < MIN_SIGNATURE_BYTES) {
        return 'Signature is too large or too small';
      }
      if (!isJpeg(buffer)) return `${field} must be a JPEG image`;
      return buffer;
    };
    let witnessBuffer: Buffer | null = null;
    if (witnessSignature instanceof Blob) {
      const read = await readSignature(witnessSignature, 'witnessSignature');
      if (typeof read === 'string') return apiError('INVALID_INPUT', read, 400);
      witnessBuffer = read;
    }
    let secondWitnessBuffer: Buffer | null = null;
    if (secondWitnessSignature instanceof Blob) {
      const read = await readSignature(secondWitnessSignature, 'secondWitnessSignature');
      if (typeof read === 'string') return apiError('INVALID_INPUT', read, 400);
      secondWitnessBuffer = read;
    }

    const result = await signTreatmentItemConsent(id, {
      place: placeTrimmed,
      patientIdentification: patientIdentificationTrimmed,
      patientSignature: patientBuffer,
      witness: witnessBuffer ? { name: witnessNameTrimmed, signature: witnessBuffer } : null,
      secondWitness: secondWitnessNameTrimmed ? { name: secondWitnessNameTrimmed, signature: secondWitnessBuffer } : null,
    });
    if (!result) return apiError('NOT_FOUND', 'Treatment item not found', 404);
    if (result === 'NO_SECOND_WITNESS_SIGNATURE') {
      return apiError(
        'WITNESSES_REQUIRED',
        'The clinic has no stored second-witness signature: have the second witness sign here',
        400
      );
    }
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
    const consentDocument = consentDocumentFromSnapshot(result.consent);

    return NextResponse.json(
      {
        consent: {
          id: result.consent.id,
          signatureMethod: result.consent.signatureMethod,
          place: result.consent.place,
          patientIdentification: result.consent.patientIdentification,
          witnessName: result.consent.witnessName,
          patientSignatureImagePath: result.consent.patientSignatureImagePath,
          witnessSignatureImagePath: result.consent.witnessSignatureImagePath,
          secondWitnessName: result.consent.secondWitnessName,
          secondWitnessSignatureImagePath: result.consent.secondWitnessSignatureImagePath,
          scanPages: [],
          signedAt: result.consent.signedAt,
        },
        consentDocument,
      },
      { status: 201 }
    );
  }
);
