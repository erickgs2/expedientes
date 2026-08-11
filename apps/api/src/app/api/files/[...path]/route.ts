import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { resolveFilePath } from '../../../../lib/storage/file-storage';
import { isJpeg } from '../../../../lib/storage/image-signature';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { requireAuth } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

export const GET = withApiErrors(
  async (request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => {
    const { path } = await params;

    // Everything under `clinic/` (currently just the physician's signature image, at
    // `clinic/settings/<uuid>.jpg`) is gated separately from patient files: it isn't a patient
    // asset at all, and it's the one asset in this system that could be used to fabricate a
    // consent, so viewing a patient's record must not be enough to fetch it.
    const isClinicAsset = path[0] === 'clinic';
    const userId = await requireAuth(
      request,
      isClinicAsset ? 'clinic-settings' : 'patients',
      'view'
    );

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

    // The `path[1]` convention is "the patient id" for every other category; for a `clinic/` path
    // that segment is the literal `settings` bucket name, not a patient — logging it as one would
    // be misleading, so the audit entry carries no patientId for this bucket.
    const patientId = isClinicAsset ? undefined : path[1];
    await writeAuditLogSafe({
      userId,
      action: 'view',
      entity: 'File',
      entityId: relativePath,
      patientId,
    });

    // Only a file whose actual bytes are a real JPEG is served inline — never the client's
    // declared content-type or the storage category in the path, which are both
    // attacker-controllable. Everything else keeps the locked-down default: an opaque, forced
    // download instead of letting the browser sniff and render (or execute) it inline in this
    // app's own origin, with the viewer's session cookie.
    if (isJpeg(buffer)) {
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'image/jpeg',
          'X-Content-Type-Options': 'nosniff',
          // Defense in depth, matching how user-content-hosting services isolate uploaded bytes:
          // even if a browser edge case treated this response as a document, it could load nothing
          // and run nothing. `inline` is stated explicitly rather than left implicit.
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Content-Disposition': 'inline',
        },
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'attachment',
      },
    });
  }
);
