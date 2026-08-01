import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { resolveFilePath } from '../../../../lib/storage/file-storage';
import { writeAuditLog } from '../../../../lib/audit/audit-log';
import { requireAuth, ForbiddenError, UnauthenticatedError } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  let userId: string;
  try {
    userId = await requireAuth(request, 'patients', 'view');
  } catch (e) {
    if (e instanceof UnauthenticatedError) return apiError('UNAUTHENTICATED', e.message, 401);
    if (e instanceof ForbiddenError) return apiError('FORBIDDEN', e.message, 403);
    throw e;
  }

  const { path } = await params;
  const relativePath = path.join('/');

  let buffer: Buffer;
  try {
    const absolutePath = resolveFilePath(relativePath);
    buffer = await readFile(absolutePath);
  } catch {
    return apiError('NOT_FOUND', 'File not found', 404);
  }

  const patientId = path[1];
  await writeAuditLog({
    userId,
    action: 'view',
    entity: 'File',
    entityId: relativePath,
    patientId,
  });

  return new NextResponse(buffer);
}
