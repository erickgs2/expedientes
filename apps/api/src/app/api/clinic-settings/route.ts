import { NextRequest, NextResponse } from 'next/server';
import {
  getClinicSettings,
  toPublicClinicSettings,
  upsertClinicSettings,
  type ClinicSettingsUpdate,
} from '../../../lib/clinic/clinic-settings';
import { saveFile } from '../../../lib/storage/file-storage';
import { isJpeg, isPng } from '../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../lib/audit/audit-log';
import { requireAuth } from '../../../lib/http/require-auth';
import { apiError } from '../../../lib/http/api-error';
import { withApiErrors } from '../../../lib/http/with-api-errors';

const MAX_SIGNATURE_BYTES = 10 * 1024 * 1024;
const MIN_SIGNATURE_BYTES = 1024;
const MAX_FIELD_LENGTH = 200;
const MAX_DECLARATION_LENGTH = 20000;
const MAX_TOKEN_LENGTH = 1000;

const TEXT_FIELDS = ['defaultPlace', 'doctorTitle', 'doctorName', 'doctorLicense'] as const;

/**
 * `clinicName` is no longer edited: the letterhead is the uploaded logo, so the settings screen has
 * no name field to send. It stays accepted-but-optional rather than removed, because it still backs
 * the `{{clinicName}}` declaration placeholder and the `clinicNameSnapshot` frozen onto consents
 * signed while the field existed. An omitted key keeps whatever is already stored.
 */
const OPTIONAL_TEXT_FIELDS = [
  'clinicName',
  'whatsappPhoneNumberId',
  'whatsappConfirmationTemplate',
  'whatsappReminderTemplate',
  'whatsappTemplateLanguage',
] as const;

export const GET = withApiErrors(async (request: NextRequest) => {
  await requireAuth(request, 'clinic-settings', 'view');
  const settings = await getClinicSettings();
  return NextResponse.json({
    clinicSettings: settings ? toPublicClinicSettings(settings) : null,
  });
});

export const PUT = withApiErrors(async (request: NextRequest) => {
  const userId = await requireAuth(request, 'clinic-settings', 'edit');

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SIGNATURE_BYTES) {
    return apiError('INVALID_INPUT', 'Request is too large', 413);
  }

  const formData = await request.formData();

  const values: Record<string, string> = {};
  for (const field of TEXT_FIELDS) {
    const raw = formData.get(field);
    if (typeof raw !== 'string') return apiError('INVALID_INPUT', `${field} is required`, 400);
    const trimmed = raw.trim();
    if (trimmed.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', `${field} is too long`, 400);
    }
    values[field] = trimmed;
  }
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const raw = formData.get(field);
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed.length > MAX_FIELD_LENGTH) {
      return apiError('INVALID_INPUT', `${field} is too long`, 400);
    }
    values[field] = trimmed;
  }
  for (const field of ['declarationBefore', 'declarationAfter'] as const) {
    const raw = formData.get(field);
    if (typeof raw !== 'string' || !raw.trim()) {
      return apiError('INVALID_INPUT', `${field} is required`, 400);
    }
    if (raw.length > MAX_DECLARATION_LENGTH) {
      return apiError('INVALID_INPUT', `${field} is too long`, 400);
    }
    values[field] = raw;
  }

  const data: ClinicSettingsUpdate = {
    defaultPlace: values.defaultPlace,
    doctorTitle: values.doctorTitle,
    doctorName: values.doctorName,
    doctorLicense: values.doctorLicense,
    declarationBefore: values.declarationBefore,
    declarationAfter: values.declarationAfter,
  };

  const signature = formData.get('doctorSignature');
  if (signature instanceof Blob) {
    const buffer = Buffer.from(await signature.arrayBuffer());
    if (buffer.length > MAX_SIGNATURE_BYTES || buffer.length < MIN_SIGNATURE_BYTES) {
      return apiError('INVALID_INPUT', 'Signature is too large or too small', 400);
    }
    if (!isJpeg(buffer)) {
      return apiError('INVALID_INPUT', 'doctorSignature must be a JPEG image', 400);
    }
    // `saveFile`'s second and third segments are category and patient id; the clinic signature has
    // no patient, so it lives under a fixed `settings` bucket. Both segments are literals here, so
    // the path-traversal guard inside `saveFile` has nothing user-controlled to reject.
    data.doctorSignaturePath = await saveFile(buffer, 'clinic', 'settings', 'signature.jpg');
  }

  if (values.clinicName !== undefined) {
    data.clinicName = values.clinicName;
  }
  for (const field of [
    'whatsappPhoneNumberId',
    'whatsappConfirmationTemplate',
    'whatsappReminderTemplate',
    'whatsappTemplateLanguage',
  ] as const) {
    if (values[field] !== undefined) {
      data[field] = values[field] || null;
    }
  }

  // Write-only. The form cannot show the stored token, so it submits an empty field whenever the
  // user isn't deliberately changing it — treating that as "clear the token" would silently switch
  // notifications off on every unrelated save. Clearing is explicit, via `whatsappAccessTokenClear`.
  const accessToken = formData.get('whatsappAccessToken');
  if (typeof accessToken === 'string' && accessToken.trim()) {
    if (accessToken.trim().length > MAX_TOKEN_LENGTH) {
      return apiError('INVALID_INPUT', 'whatsappAccessToken is too long', 400);
    }
    data.whatsappAccessToken = accessToken.trim();
  } else if (formData.get('whatsappAccessTokenClear') === 'true') {
    data.whatsappAccessToken = null;
  }

  // The logo is the export's letterhead, printed at the top of every page. PNG is accepted
  // alongside JPEG because a logo usually needs a transparent background, which JPEG cannot carry.
  const logo = formData.get('clinicLogo');
  if (logo instanceof Blob) {
    const buffer = Buffer.from(await logo.arrayBuffer());
    if (buffer.length > MAX_SIGNATURE_BYTES || buffer.length < MIN_SIGNATURE_BYTES) {
      return apiError('INVALID_INPUT', 'Logo is too large or too small', 400);
    }
    const png = isPng(buffer);
    if (!png && !isJpeg(buffer)) {
      return apiError('INVALID_INPUT', 'clinicLogo must be a PNG or JPEG image', 400);
    }
    data.clinicLogoPath = await saveFile(
      buffer,
      'clinic',
      'settings',
      png ? 'logo.png' : 'logo.jpg'
    );
  }

  const clinicSettings = await upsertClinicSettings(data);

  await writeAuditLogSafe({
    userId,
    action: 'update',
    entity: 'ClinicSettings',
    entityId: clinicSettings.id,
  });

  // Same projection as GET: the save response must not hand the token back either.
  return NextResponse.json({ clinicSettings: toPublicClinicSettings(clinicSettings) });
});
