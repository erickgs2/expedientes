import { prismaUnscoped } from '../prisma/client';
import { loadClinicPlan } from '../plan/clinic-plan';
import { sendEmail } from '../email/send-email';
import { premiumEndingEmail } from '../email/templates';

const NOTICE_DAYS = 7;

/**
 * Tells each owner, once, that their manual Premium ends within 7 days. Skipped (and marked) when
 * something else keeps the clinic on Premium past that date, such as a queued grant or a paid plan.
 */
export async function sendGrantEndingNotices(now = new Date()): Promise<void> {
  const soon = new Date(now.getTime() + NOTICE_DAYS * 86_400_000);
  const grants = await prismaUnscoped.planGrant.findMany({
    where: { revokedAt: null, endingNoticeSentAt: null, endsAt: { gt: now, lte: soon } },
    include: {
      clinic: {
        select: {
          name: true,
          timeZone: true,
          status: true,
          memberships: { where: { isOwner: true }, select: { user: { select: { email: true } } } },
        },
      },
    },
  });
  for (const grant of grants) {
    try {
      const plan = await loadClinicPlan(grant.clinicId, now);
      const coveredLater =
        plan.premiumUntil && new Date(plan.premiumUntil).getTime() > grant.endsAt.getTime() + 60_000;
      const owner = grant.clinic.memberships[0]?.user.email;
      if (!coveredLater && owner && grant.clinic.status === 'ACTIVE') {
        await sendEmail(
          premiumEndingEmail(owner, {
            clinicName: grant.clinic.name,
            endsAt: grant.endsAt,
            timeZone: grant.clinic.timeZone,
          })
        );
      }
      await prismaUnscoped.planGrant.update({ where: { id: grant.id }, data: { endingNoticeSentAt: now } });
    } catch (error) {
      console.error(`Could not send the ending notice for grant ${grant.id}`, error);
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Checks hourly. */
export function startGrantNotices(): void {
  if (timer) return;
  const run = () => void sendGrantEndingNotices().catch((error) => console.error('Grant notices failed', error));
  setTimeout(run, 60_000).unref?.();
  timer = setInterval(run, 3_600_000);
  timer.unref?.();
}
