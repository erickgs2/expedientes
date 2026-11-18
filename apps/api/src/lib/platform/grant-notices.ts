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

/** Checks hourly: grants ending soon and prepaid OXXO periods ending soon. */
export function startGrantNotices(): void {
  if (timer) return;
  const run = () => {
    void sendGrantEndingNotices().catch((error) => console.error('Grant notices failed', error));
    void sendPrepaidRenewalNotices().catch((error) => console.error('OXXO renewal notices failed', error));
  };
  setTimeout(run, 60_000).unref?.();
  timer = setInterval(run, 3_600_000);
  timer.unref?.();
}

/**
 * OXXO periods do not renew by themselves: the owner is reminded 7 days and 1 day before the paid
 * period ends, once each, unless something else (a card subscription, a grant) extends Premium.
 */
export async function sendPrepaidRenewalNotices(now = new Date()): Promise<void> {
  const { prepaidEndingEmail } = await import('../email/templates');
  const in7 = new Date(now.getTime() + 7 * 86_400_000);
  const rows = await prismaUnscoped.subscription.findMany({
    where: { method: 'OXXO', currentPeriodEnd: { gt: now, lte: in7 } },
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
  for (const row of rows) {
    const daysLeft = (row.currentPeriodEnd.getTime() - now.getTime()) / 86_400_000;
    const due = daysLeft <= 1 ? (row.renewalNotice1SentAt ? null : 1) : row.renewalNotice7SentAt ? null : 7;
    if (!due) continue;
    try {
      const plan = await loadClinicPlan(row.clinicId, now);
      const extended = plan.premiumUntil && new Date(plan.premiumUntil).getTime() > row.currentPeriodEnd.getTime() + 60_000;
      const owner = row.clinic.memberships[0]?.user.email;
      if (!extended && owner && row.clinic.status === 'ACTIVE') {
        await sendEmail(
          prepaidEndingEmail(owner, {
            clinicName: row.clinic.name,
            endsAt: row.currentPeriodEnd,
            timeZone: row.clinic.timeZone,
            days: Math.max(1, Math.ceil(daysLeft)),
          })
        );
      }
      await prismaUnscoped.subscription.update({
        where: { id: row.id },
        data: due === 1 ? { renewalNotice1SentAt: now, renewalNotice7SentAt: row.renewalNotice7SentAt ?? now } : { renewalNotice7SentAt: now },
      });
    } catch (error) {
      console.error(`Could not send the OXXO renewal notice for clinic ${row.clinicId}`, error);
    }
  }
}
