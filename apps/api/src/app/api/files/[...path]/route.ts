import { NextRequest, NextResponse } from 'next/server';
import { readStoredFile, THUMBNAIL_SUFFIX } from '../../../../lib/storage/file-storage';
import { readThumbnail } from '../../../../lib/storage/thumbnail';
import { storedFileBelongsToCurrentClinic } from '../../../../lib/storage/file-access';
import { inlineImageType } from '../../../../lib/storage/image-signature';
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

    // Another clinic's file is answered exactly like a missing one.
    if (!(await storedFileBelongsToCurrentClinic(path))) {
      return apiError('NOT_FOUND', 'File not found', 404);
    }

    // `?thumb=1` asks for a small version for gallery tiles. It falls back to the original whenever
    // no thumbnail can be produced, so a client can always ask for it.
    const wantsThumbnail =
      request.nextUrl.searchParams.get('thumb') === '1' && !relativePath.endsWith(THUMBNAIL_SUFFIX);

    let buffer: Buffer;
    try {
      buffer =
        (wantsThumbnail ? await readThumbnail(relativePath) : null) ??
        (await readStoredFile(relativePath));
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

    // Only a file whose actual bytes are a real JPEG or PNG is served inline — never the client's
    // declared content-type or the storage category in the path, which are both
    // attacker-controllable. Everything else keeps the locked-down default: an opaque, forced
    // download instead of letting the browser sniff and render (or execute) it inline in this
    // app's own origin, with the viewer's session cookie.
    // Every stored file is written under a fresh UUID and never overwritten, so the bytes behind a
    // path never change and the browser can keep them instead of downloading the same photo again on
    // every gallery and timeline view. `private` keeps shared caches (Cloudflare, any proxy) from
    // storing patient images; only the viewer's own browser does. 30 days rather than a year bounds
    // how long a copy can outlive a deleted patient on a shared device.
    //
    // Trade-off: a view served from the browser cache never reaches this handler, so it writes no
    // audit entry. The first fetch on each device is still logged.
    const cacheControl = 'private, max-age=2592000, immutable';

    const imageType = inlineImageType(buffer);
    if (imageType) {
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': imageType,
          'X-Content-Type-Options': 'nosniff',
          // Defense in depth, matching how user-content-hosting services isolate uploaded bytes:
          // even if a browser edge case treated this response as a document, it could load nothing
          // and run nothing. `inline` is stated explicitly rather than left implicit.
          'Content-Security-Policy': "default-src 'none'; sandbox",
          'Content-Disposition': 'inline',
          'Cache-Control': cacheControl,
        },
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'attachment',
        'Cache-Control': cacheControl,
      },
    });
  }
);
