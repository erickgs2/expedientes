import { NextRequest, NextResponse } from 'next/server';
import type { PlatformTotpSetup } from '@expedientes/shared-types';
import { prismaUnscoped } from '../../../../../lib/prisma/client';
import { requirePlatformAdmin } from '../../../../../lib/platform/require-admin';
import { generateTotpSecret, otpauthUri } from '../../../../../lib/platform/totp';
import { openSecret, sealSecret } from '../../../../../lib/platform/secret-box';
import { withApiErrors } from '../../../../../lib/http/with-api-errors';

/**
 * Enrolment, first sign-in only: the secret to add to an authenticator app. Kept (encrypted) until
 * a code from it is confirmed, so reloading the page shows the same secret.
 */
export const GET = withApiErrors(async (request: NextRequest) => {
  const { admin } = await requirePlatformAdmin(request, ['setup']);
  let secret = admin.totpSecret ? openSecret(admin.totpSecret) : null;
  if (!secret) {
    secret = generateTotpSecret();
    await prismaUnscoped.platformAdmin.update({
      where: { id: admin.id },
      data: { totpSecret: sealSecret(secret) },
    });
  }
  const body: PlatformTotpSetup = { secret, otpauthUri: otpauthUri(admin.email, secret) };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
});
