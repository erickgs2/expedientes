import { createHash, randomBytes } from 'crypto';
import type {
  AcceptInvitationRequest,
  InvitationPreview,
  PendingInvitation,
} from '@expedientes/shared-types';
import { prisma, prismaUnscoped } from '../prisma/client';
import { runAsClinic } from '../tenancy/context';
import { assertInClinic } from '../tenancy/assert';
import { ApiProblem } from '../http/api-problem';
import { assertCanAddOne } from '../plan/limits';
import { hashPassword, verifyPassword } from '../auth/password';
import { isAcceptablePassword, looksLikeEmail, normalizeEmail } from '../auth/email-code';
import { sendEmail } from '../email/send-email';
import { appBaseUrl, invitationEmail } from '../email/templates';
import { areCurrentLegalIds, recordLegalAcceptances } from '../legal/legal-documents';

export const INVITATION_DAYS = 7;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Invites someone to the current clinic with a role. Counts against the plan's user limit like an
 * active user, so Free (owner only) cannot invite. The link carries a random token; only its hash
 * is stored.
 */
export async function createInvitation(
  rawEmail: unknown,
  roleId: unknown,
  inviterUserId: string,
  now = new Date()
): Promise<PendingInvitation> {
  const email = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : '';
  if (!looksLikeEmail(email)) {
    throw new ApiProblem('INVALID_INPUT', 'A valid email is required', 400, { field: 'email' });
  }
  if (typeof roleId !== 'string' || !roleId) {
    throw new ApiProblem('INVALID_INPUT', 'roleId is required', 400, { field: 'roleId' });
  }
  await assertInClinic('role', [roleId]);

  const alreadyMember = await prisma.membership.count({
    where: { user: { email: { equals: email, mode: 'insensitive' } } },
  });
  if (alreadyMember) {
    throw new ApiProblem('ALREADY_MEMBER', 'This person already belongs to the clinic', 409);
  }
  // A pending invitation holds a seat, so a clinic cannot hand out more invitations than its plan
  // has users. Re-inviting the same email replaces its earlier invitation, so that one is not counted.
  const reserved = await prisma.invitation.count({
    where: { email: { not: email }, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
  });
  await assertCanAddOne('users', reserved);

  // Inviting the same email again replaces the earlier invitation: only the newest link works.
  await prisma.invitation.updateMany({
    where: { email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  const token = randomBytes(32).toString('base64url');
  const invitation = await prisma.invitation.create({
    data: {
      email,
      roleId,
      invitedById: inviterUserId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + INVITATION_DAYS * 86_400_000),
    },
    include: { role: true, invitedBy: true, clinic: true },
  });
  await sendEmail(
    invitationEmail(email, {
      clinicName: invitation.clinic.name,
      inviterName: invitation.invitedBy.fullName,
      url: `${appBaseUrl()}/invitacion/${token}`,
      days: INVITATION_DAYS,
    })
  );
  return toPending(invitation);
}

function toPending(invitation: {
  id: string;
  email: string;
  roleId: string;
  role: { name: string };
  invitedBy: { fullName: string };
  createdAt: Date;
  expiresAt: Date;
}): PendingInvitation {
  return {
    id: invitation.id,
    email: invitation.email,
    roleId: invitation.roleId,
    roleName: invitation.role.name,
    invitedByName: invitation.invitedBy.fullName,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

/** The current clinic's invitations still waiting for an answer. */
export async function listPendingInvitations(now = new Date()): Promise<PendingInvitation[]> {
  const rows = await prisma.invitation.findMany({
    where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    include: { role: true, invitedBy: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toPending);
}

export async function revokeInvitation(id: string, now = new Date()): Promise<void> {
  const result = await prisma.invitation.updateMany({
    where: { id, acceptedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  if (result.count === 0) throw new ApiProblem('NOT_FOUND', 'Invitation not found', 404);
}

/**
 * The invitation a link points to, if it can still be accepted. Looked up by token across clinics:
 * whoever holds the link is not signed in to the clinic yet.
 */
async function findUsableInvitation(token: string, now: Date) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const invitation = await prismaUnscoped.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { clinic: true, role: true, invitedBy: true },
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt <= now ||
    invitation.clinic.status !== 'ACTIVE'
  ) {
    return null;
  }
  return invitation;
}

const INVITATION_GONE = () =>
  new ApiProblem('INVITATION_INVALID', 'This invitation expired or was already used', 410);

export async function previewInvitation(token: string, now = new Date()): Promise<InvitationPreview> {
  const invitation = await findUsableInvitation(token, now);
  if (!invitation) throw INVITATION_GONE();
  const account = await prismaUnscoped.user.findFirst({
    where: { email: { equals: invitation.email, mode: 'insensitive' } },
    select: { id: true },
  });
  return {
    clinicName: invitation.clinic.name,
    email: invitation.email,
    roleName: invitation.role.name,
    inviterName: invitation.invitedBy.fullName,
    accountExists: Boolean(account),
  };
}

/**
 * Accepts an invitation. A new person sets their name and password; someone who already has an
 * account proves it with their password and gains a membership in one more clinic. Either way the
 * current legal versions are accepted and the plan's user limit is checked again, as the clinic.
 */
export async function acceptInvitation(
  token: string,
  body: Partial<AcceptInvitationRequest>,
  context: { ip: string; userAgent: string | null },
  now = new Date()
): Promise<{ userId: string; email: string; clinicId: string }> {
  const invitation = await findUsableInvitation(token, now);
  if (!invitation) throw INVITATION_GONE();
  if (!(await areCurrentLegalIds(body.privacyDocumentId, body.termsDocumentId))) {
    throw new ApiProblem('LEGAL_OUTDATED', 'The privacy notice or terms changed; review them again', 409);
  }
  const existing = await prismaUnscoped.user.findFirst({
    where: { email: { equals: invitation.email, mode: 'insensitive' } },
  });

  let passwordHash: string | null = null;
  let fullName = '';
  if (existing) {
    if (!existing.active) throw new ApiProblem('ACCOUNT_INACTIVE', 'This account is inactive', 403);
    if (typeof body.password !== 'string' || !(await verifyPassword(body.password, existing.passwordHash))) {
      throw new ApiProblem('INVALID_CREDENTIALS', 'The password is not correct', 401);
    }
  } else {
    fullName = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';
    if (!fullName || fullName.length > 120) {
      throw new ApiProblem('INVALID_INPUT', 'Your name is required', 400, { field: 'fullName' });
    }
    if (!isAcceptablePassword(body.password)) {
      throw new ApiProblem('INVALID_INPUT', 'The password must have at least 10 characters', 400, {
        field: 'password',
      });
    }
    passwordHash = await hashPassword(body.password);
  }

  // The seat check runs as the clinic, the same way it runs when the owner invites.
  await runAsClinic(invitation.clinicId, () => assertCanAddOne('users'));

  return prismaUnscoped.$transaction(async (tx) => {
    const user =
      existing ??
      (await tx.user.create({
        data: { email: invitation.email, passwordHash: passwordHash as string, fullName, language: 'es' },
      }));
    await tx.membership.upsert({
      where: { userId_clinicId: { userId: user.id, clinicId: invitation.clinicId } },
      update: { active: true, roleId: invitation.roleId },
      create: { userId: user.id, clinicId: invitation.clinicId, roleId: invitation.roleId },
    });
    await recordLegalAcceptances(
      tx,
      user.id,
      [body.privacyDocumentId as string, body.termsDocumentId as string],
      { ip: context.ip, userAgent: context.userAgent, marketingConsent: body.marketingConsent === true }
    );
    const accepted = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: now },
    });
    // Two tabs accepting the same link: only the first one counts.
    if (accepted.count === 0) throw INVITATION_GONE();
    return { userId: user.id, email: user.email, clinicId: invitation.clinicId };
  });
}
