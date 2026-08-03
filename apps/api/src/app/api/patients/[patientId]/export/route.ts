import { NextRequest, NextResponse } from 'next/server';
import {
  gatherExportData,
  type ExportModulesSelection,
} from '../../../../../lib/export/gather-export-data';
import { buildExportPdf } from '../../../../../lib/export/build-pdf';
import { writeAuditLogSafe } from '../../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../../lib/http/require-auth';
import { apiError } from '../../../../../lib/http/api-error';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';
import { isPng } from '../../../../../lib/storage/image-signature';

// App Router route handlers have no built-in body-size limit. A rendered 480x600 diagram PNG is
// well under 1 MB; this ceiling is generous headroom, not a tight fit. The count cap bounds how
// many diagrams one export request can plausibly need to embed.
const MAX_DIAGRAM_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_DIAGRAM_IMAGES = 100;

function isValidModulesSelection(value: unknown): value is ExportModulesSelection {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['historiaClinica'] === 'boolean' &&
    typeof v['valoracion'] === 'boolean' &&
    typeof v['treatments'] === 'boolean'
  );
}

export const POST = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) => {
    const userId = await requireAuth(request, 'export', 'create');
    const { patientId } = await params;

    const formData = await request.formData();
    const modulesRaw = formData.get('modules');
    const languageRaw = formData.get('language');

    if (typeof modulesRaw !== 'string' || typeof languageRaw !== 'string') {
      return apiError('INVALID_INPUT', 'modules and language are required', 400);
    }
    if (languageRaw !== 'es' && languageRaw !== 'en') {
      return apiError('INVALID_INPUT', 'language must be "es" or "en"', 400);
    }

    let modules: unknown;
    try {
      modules = JSON.parse(modulesRaw);
    } catch {
      return apiError('INVALID_INPUT', 'modules must be valid JSON', 400);
    }
    if (!isValidModulesSelection(modules)) {
      return apiError(
        'INVALID_INPUT',
        'modules must specify historiaClinica, valoracion, and treatments as booleans',
        400
      );
    }

    const data = await gatherExportData(patientId, modules);
    if (!data) {
      return apiError('NOT_FOUND', 'Patient not found', 404);
    }

    const diagramImages = new Map<string, Buffer>();
    let diagramImageCount = 0;
    for (const [key, value] of formData.entries()) {
      if (key === 'modules' || key === 'language') continue;
      if (!(value instanceof File)) continue;

      diagramImageCount++;
      if (diagramImageCount > MAX_DIAGRAM_IMAGES) {
        return apiError('INVALID_INPUT', 'Too many diagram images', 400);
      }

      const buffer = Buffer.from(await value.arrayBuffer());
      if (buffer.length > MAX_DIAGRAM_IMAGE_BYTES) {
        return apiError('INVALID_INPUT', 'Diagram image is too large', 400);
      }
      // Never trust the client's declared content-type — verify the actual bytes, the same
      // discipline this project applies to any other untrusted upload.
      if (!isPng(buffer)) {
        return apiError('INVALID_INPUT', 'Diagram image must be a PNG', 400);
      }

      diagramImages.set(key, buffer);
    }

    const pdfBuffer = await buildExportPdf(data, diagramImages, languageRaw);

    await writeAuditLogSafe({
      userId,
      action: 'create',
      entity: 'PatientExport',
      entityId: patientId,
      patientId,
      metadata: { modules, language: languageRaw },
    });

    const safeFileName = data.patient.fullName.replace(/[^a-zA-Z0-9]+/g, '-') || 'patient';
    const dateStr = new Date().toISOString().substring(0, 10);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFileName}-${dateStr}.pdf"`,
      },
    });
  }
);
