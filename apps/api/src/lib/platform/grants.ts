import type { GrantPremiumRequest, GrantPremiumResult } from '@expedientes/shared-types';
import { prismaUnscoped } from '../prisma/client';
import { ApiProblem } from '../http/api-problem';
import { grantEndDate, isValidGrantMonths } from '../plan/grant-dates';
import { loadClinicPlan } from '../plan/clinic-plan';
import { sendEmail } from '../email/send-email';
import { premiumGrantedEmail } from '../email/templates';

/** Safety cap for one operation. */
export const MAX_CLINICS_PER_GRANT = 100;

/**
 * Gives Premium by hand to one or several clinics for a number of months, all or nothing. Each grant
 * is its own PlanGrant; nothing touches a subscription or Stripe. "afterCurrent" queues it to start
 * when the clinic's current Premium ends, so periods do not overlap.
 */
export async function grantPremium(
  input: Partial<GrantPremiumRequest>,
  adminEmail: string,
  now = new Date()
): Promise<GrantPremiumResult> {
  const clinicIds = [...new Set(Array.isArray(input.clinicIds) ? input.clinicIds : [])].filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  );
  if (clinicIds.length === 0 || clinicIds.length > MAX_CLINICS_PER_GRANT) {
    throw new ApiProblem('INVALID_INPUT', `Choose between 1 and ${MAX_CLINICS_PER_GRANT} clinics`, 400, {
      field: 'clinicIds',
    });
  }
  if (!isValidGrantMonths(input.months)) {
    throw new ApiProblem('INVALID_INPUT', 'Months must be a whole number from 1 to 24', 400, { field: 'months' });
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 3 || reason.length > 200) {
    throw new ApiProblem('INVALID_INPUT', 'A reason is required', 400, { field: 'reason' });
  }
  const months = input.months;
  const afterCurrent = input.start === 'afterCurrent';

  const clinics = await prismaUnscoped.clinic.findMany({
    where: { id: { in: clinicIds } },
    select: {
      id: true,
      name: true,
      timeZone: true,
      memberships: { where: { isOwner: true }, select: { user: { select: { email: true } } } },
    },
  });
  if (clinics.length !== clinicIds.length) {
    throw new ApiProblem('NOT_FOUND', 'Some clinics do not exist', 404);
  }

  const plans = await Promise.all(clinics.map((clinic) => loadClinicPlan(clinic.id, now)));
  const planned = clinics.map((clinic, i) => {
    const currentEnd = plans[i].premiumUntil ? new Date(plans[i].premiumUntil as string) : null;
    const startsAt = afterCurrent && currentEnd && currentEnd > now ? currentEnd : now;
    return { clinic, startsAt, endsAt: grantEndDate(startsAt, months, clinic.timeZone) };
  });

  await prismaUnscoped.$transaction(
    planned.map(({ clinic, startsAt, endsAt }) =>
      prismaUnscoped.planGrant.create({
        data: { clinicId: clinic.id, startsAt, endsAt, months, reason, grantedBy: adminEmail },
      })
    )
  );

  // Owners are told after the grants are stored; a failed email never undoes a grant.
  for (const { clinic, endsAt } of planned) {
    const owner = clinic.memberships[0]?.user.email;
    if (!owner) continue;
    try {
      await sendEmail(premiumGrantedEmail(owner, { clinicName: clinic.name, endsAt, timeZone: clinic.timeZone }));
    } catch (error) {
      console.error(`Could not email the Premium grant to clinic ${clinic.id}`, error);
    }
  }

  return {
    granted: planned.map(({ clinic, startsAt, endsAt }) => ({
      clinicId: clinic.id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    })),
  };
}

/** Ends a grant early. The clinic falls back to Free (keeping its data) unless something else covers it. */
export async function revokeGrant(grantId: string, reasonInput: unknown, adminEmail: string, now = new Date()) {
  const reason = typeof reasonInput === 'string' ? reasonInput.trim() : '';
  if (reason.length < 3) throw new ApiProblem('INVALID_INPUT', 'A reason is required', 400, { field: 'reason' });
  const result = await prismaUnscoped.planGrant.updateMany({
    where: { id: grantId, revokedAt: null },
    data: { revokedAt: now, revokedBy: adminEmail, revokedReason: reason.slice(0, 200) },
  });
  if (result.count === 0) throw new ApiProblem('NOT_FOUND', 'Grant not found or already revoked', 404);
  return prismaUnscoped.planGrant.findUniqueOrThrow({ where: { id: grantId } });
}
