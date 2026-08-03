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
    for (const [key, value] of formData.entries()) {
      if (key === 'modules' || key === 'language') continue;
      if (value instanceof File) {
        diagramImages.set(key, Buffer.from(await value.arrayBuffer()));
      }
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
