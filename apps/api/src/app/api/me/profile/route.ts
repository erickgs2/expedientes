import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma/client';
import { requireSignedIn } from '../../../../lib/http/require-auth';
import { apiError } from '../../../../lib/http/api-error';
import { withApiErrors } from '../../../../lib/http/with-api-errors';

const MAX_LENGTH = 60;

async function profile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, email: true, professionalTitle: true, professionalLicense: true, signingPinHash: true },
  });
  if (!user) return null;
  const { signingPinHash, ...rest } = user;
  return { ...rest, hasSigningPin: !!signingPinHash };
}

/** The signed-in user's own profile: what prints with the notes they sign. */
export const GET = withApiErrors(async (request: NextRequest) => {
  const userId = await requireSignedIn(request);
  const result = await profile(userId);
  if (!result) return apiError('NOT_FOUND', 'User not found', 404);
  return NextResponse.json({ profile: result });
});

/** Title (Dr., Dra., Lic.) and professional licence (cédula). Notes signed before keep theirs. */
export const PATCH = withApiErrors(async (request: NextRequest) => {
  const userId = await requireSignedIn(request);
  const body = (await request.json().catch(() => ({}))) as { professionalTitle?: unknown; professionalLicense?: unknown };
  const data: { professionalTitle?: string | null; professionalLicense?: string | null } = {};
  for (const key of ['professionalTitle', 'professionalLicense'] as const) {
    const raw = body[key];
    if (raw === undefined) continue;
    if (raw !== null && typeof raw !== 'string') return apiError('INVALID_INPUT', `${key} must be text`, 400);
    const value = (raw ?? '').trim();
    if (value.length > MAX_LENGTH) return apiError('INVALID_INPUT', `${key} is too long`, 400);
    data[key] = value || null;
  }
  await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ profile: await profile(userId) });
});
