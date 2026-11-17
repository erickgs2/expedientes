import { NextRequest, NextResponse } from 'next/server';
import { getTreatmentItemDetail } from '../../../../../../lib/treatment/consent';
import { getClinicSettings } from '../../../../../../lib/clinic/clinic-settings';
import { prepareBlankConsentBlocks } from '../../../../../../lib/consent/blank-consent-blocks';
import { buildBlankConsentPdf } from '../../../../../../lib/export/blank-consent-pdf';
import { readStoredFile } from '../../../../../../lib/storage/file-storage';
import { isPng } from '../../../../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../../lib/http/require-auth';
import { apiError } from '../../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuth(request, 'treatments', 'view');
    const { id } = await params;

    const item = await getTreatmentItemDetail(id);
    if (!item) return apiError('NOT_FOUND', 'Treatment item not found', 404);
    if (item.consent) {
      return apiError('CONFLICT', 'This treatment item already has a signed consent', 409);
    }
    if (!item.consentPreview) {
      return apiError(
        'CONFLICT',
        'Clinic settings are incomplete: set the doctor name and licence number before printing consents',
        409
      );
    }

    const settings = await getClinicSettings();
    let logo: Buffer | undefined;
    if (settings?.clinicLogoPath) {
      try {
        logo = await readStoredFile(settings.clinicLogoPath);
      } catch (error) {
        console.error('Failed to read the clinic logo', error);
      }
    }

    const pdf = await buildBlankConsentPdf({
      blocks: prepareBlankConsentBlocks(item.consentPreview),
      clinicName: settings?.clinicName ?? '',
      patientName: item.patientName,
      treatmentTypeName: item.treatmentTypeName,
      logo,
      logoFormat: logo && isPng(logo) ? 'png' : 'jpg',
    });

    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'ConsentPrint',
      entityId: item.id,
      patientId: item.patientId,
    });

    const safeName = item.treatmentTypeName.replace(/[^a-zA-Z0-9]+/g, '-') || 'consentimiento';
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="consentimiento-${safeName}.pdf"`,
      },
    });
  }
);
