import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { resolveFilePath } from '../../../../lib/storage/file-storage';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => {
    const userId = await requireAuth(request, 'patients', 'view');

    const { path } = await params;
    const relativePath = path.join('/');

    let buffer: Buffer;
    try {
      const absolutePath = resolveFilePath(relativePath);
      buffer = await readFile(absolutePath);
    } catch {
      // A path that escapes the storage root is answered the same as a missing file, so the
      // response never confirms what does or doesn't exist outside the root.
      return apiError('NOT_FOUND', 'File not found', 404);
    }

    const patientId = path[1];
    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'File',
      entityId: relativePath,
      patientId,
    });

    // Conservative defaults until a later module adds per-file-type handling: force a download of
    // an opaque byte stream rather than letting the browser sniff and render (or execute) an
    // uploaded .html/.svg inline, in this app's own origin, with the viewer's session cookie.
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'attachment',
      },
    });
  }
);
