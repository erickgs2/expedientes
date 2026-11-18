import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { requireSignedIn } from '../../../../lib/http/require-auth';
import { hashPassword, verifyPassword } from '../../../../lib/auth/password';
import { SIGNING_PIN_PATTERN, pinFailures } from '../../../../lib/signature/note-signature';
import { writeAuditLogSafe } from '../../../../lib/audit/audit-log';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

/**
 * Sets or changes the user's 6-digit signing PIN. Asks for the account password, so a session left
 * open on a shared tablet cannot be used to set someone else's signature.
 */
export const PUT = withApiErrors(async (request: NextRequest) => {
  const userId = await requireSignedIn(request);
  const body = (await request.json().catch(() => ({}))) as { currentPassword?: unknown; pin?: unknown };
  if (typeof body.pin !== 'string' || !SIGNING_PIN_PATTERN.test(body.pin)) {
    return apiError('INVALID_INPUT', 'pin must be 6 digits', 400);
  }
  if (typeof body.currentPassword !== 'string' || !body.currentPassword) {
    return apiError('INVALID_INPUT', 'currentPassword is required', 400);
  }
  const limit = pinFailures.check(`pin-set:${userId}`);
  if (!limit.allowed) return apiError('TOO_MANY_ATTEMPTS', 'Too many attempts. Try again later.', 429);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
    pinFailures.recordFailure(`pin-set:${userId}`);
    return apiError('WRONG_PASSWORD', 'Wrong password', 403);
  }
  pinFailures.reset(`pin-set:${userId}`);
  await prisma.user.update({ where: { id: userId }, data: { signingPinHash: await hashPassword(body.pin) } });
  await writeAuditLogSafe({ userId: userId, action: 'update', entity: 'SigningPin', entityId: userId });
  return new NextResponse(null, { status: 204 });
});
