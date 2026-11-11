import type { WhatsAppSendResponse, WhatsAppTestKind } from '@expedientes/shared-types';
import { prisma } from '../prisma/client';
import { writeAuditLogSafe } from '../audit/audit-log';
import { getClinicSettings } from '../clinic/clinic-settings';
import { sendTemplateMessage } from './whatsapp-client';
import { resolveWhatsAppConfig, type WhatsAppConfig } from './whatsapp-config';
import { toWhatsAppNumber } from './phone';
import { resolveNotificationPhone } from '../patients/notification-contact';

const REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
/** A manual reminder is refused when one already went out this recently — avoids double sends. */
export const MANUAL_REMINDER_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_ERROR_DETAIL_LENGTH = 500;

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Mexico_City',
  }).format(date);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Mexico_City',
  }).format(date);
}

type NotificationKind = 'confirmation' | 'reminder';

function templateFor(config: WhatsAppConfig, kind: NotificationKind): string {
  return kind === 'confirmation' ? config.confirmationTemplate : config.reminderTemplate;
}

/**
 * The master switch in clinic settings. Messages to real patients go out only when it is on; the
 * settings screen's test sends deliberately bypass it, since they go to a number the user typed.
 */
export async function areNotificationsEnabled(): Promise<boolean> {
  const settings = await getClinicSettings();
  return Boolean(settings?.whatsappNotificationsEnabled);
}

/** Calls Meta and turns the outcome into a result value; never throws. */
async function deliver(
  to: string,
  templateName: string,
  parameters: string[]
): Promise<WhatsAppSendResponse> {
  try {
    await sendTemplateMessage(to, templateName, parameters);
    return { result: 'sent' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: 'send_failed', detail: message.slice(0, MAX_ERROR_DETAIL_LENGTH) };
  }
}

interface SendOptions {
  /** Who triggered it: a user id for manual sends, `system` for automatic ones. */
  actorUserId: string;
  manual: boolean;
}

/**
 * Fetches the appointment + patient fresh (rather than trusting a caller-supplied object), builds
 * the shared three-parameter template payload (patient name, date, time), and sends it. Always
 * writes an audit log entry, success or failure. Never throws.
 */
async function sendAppointmentMessage(
  appointmentId: string,
  kind: NotificationKind,
  { actorUserId, manual }: SendOptions
): Promise<WhatsAppSendResponse> {
  let appointment;
  try {
    appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: { include: { contactPatient: { select: { id: true, phone: true } } } } },
    });
  } catch (error) {
    console.error(`Failed to look up appointment ${appointmentId} for WhatsApp ${kind}`, error);
    return { result: 'send_failed' };
  }
  if (!appointment) return { result: 'send_failed' };

  const audit = (outcome: WhatsAppSendResponse) =>
    writeAuditLogSafe({
      userId: actorUserId,
      action: 'create',
      entity: 'AppointmentNotification',
      entityId: appointment.id,
      patientId: appointment.patientId,
      metadata: {
        kind,
        manual,
        success: outcome.result === 'sent',
        ...(outcome.result === 'sent' ? {} : { reason: outcome.result }),
        // Which companion's phone it went to, when not the patient's own.
        ...(appointment.patient.contactPatient ? { viaContactPatientId: appointment.patient.contactPatient.id } : {}),
      },
    });

  if (!(await areNotificationsEnabled())) {
    const outcome: WhatsAppSendResponse = { result: 'disabled' };
    await audit(outcome);
    return outcome;
  }

  const config = await resolveWhatsAppConfig();
  if (!config) {
    const outcome: WhatsAppSendResponse = { result: 'not_configured' };
    await audit(outcome);
    return outcome;
  }

  // A patient who comes with a companion is reached on the companion's phone; the message still
  // names the patient whose appointment it is.
  const to = toWhatsAppNumber(resolveNotificationPhone(appointment.patient));
  if (!to) {
    const outcome: WhatsAppSendResponse = { result: 'invalid_phone' };
    await audit(outcome);
    return outcome;
  }

  const outcome = await deliver(to, templateFor(config, kind), [
    appointment.patient.fullName,
    formatDate(appointment.startTime),
    formatTime(appointment.startTime),
  ]);
  if (outcome.result === 'send_failed') {
    console.error(`Failed to send WhatsApp ${kind} for appointment ${appointment.id}`, outcome.detail);
  }
  await audit(outcome);
  return outcome;
}

/**
 * Sends the booking-confirmation message for a just-created appointment and records when it went
 * out. Best-effort: never throws, so a WhatsApp failure can never fail the appointment-creation
 * request that calls this.
 */
export async function sendConfirmation(appointmentId: string): Promise<void> {
  const outcome = await sendAppointmentMessage(appointmentId, 'confirmation', {
    actorUserId: 'system',
    manual: false,
  });
  if (outcome.result === 'sent') {
    await prisma.appointment
      .update({ where: { id: appointmentId }, data: { confirmationSentAt: new Date() } })
      .catch((error) => console.error('Failed to record confirmationSentAt', error));
  }
}

/**
 * Finds every not-yet-reminded, non-cancelled appointment whose `startTime` falls within the next
 * 2 hours, sends each its reminder, and marks `reminderSentAt` only on a successful send. A failed
 * send is retried on the next sweep; once `startTime` passes, the appointment falls out of this
 * query's `gt: now` bound and is never retried again — the entire retry mechanism, no backoff or
 * retry-count field needed.
 *
 * With the master switch off the sweep returns before querying, so it neither sends nor floods the
 * audit log with a "disabled" entry every five minutes.
 */
export async function runReminderSweep(): Promise<void> {
  if (!(await areNotificationsEnabled())) return;
  const now = new Date();
  const due = await prisma.appointment.findMany({
    where: {
      reminderSentAt: null,
      status: { not: 'CANCELLED' },
      startTime: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
    },
  });

  for (const appointment of due) {
    const outcome = await sendAppointmentMessage(appointment.id, 'reminder', {
      actorUserId: 'system',
      manual: false,
    });
    if (outcome.result === 'sent') {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { reminderSentAt: new Date() },
      });
    }
  }
}

/**
 * The front desk's "send reminder now". Refused (`too_soon`) when a reminder went out within the
 * cooldown, which also keeps it from doubling up with the automatic sweep. Marks `reminderSentAt`
 * on success, so the sweep then skips this appointment. Returns `null` for an unknown id.
 */
export async function sendReminderNow(
  appointmentId: string,
  userId: string,
  now: Date = new Date()
): Promise<WhatsAppSendResponse | null> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, reminderSentAt: true },
  });
  if (!appointment) return null;
  if (
    appointment.reminderSentAt &&
    now.getTime() - appointment.reminderSentAt.getTime() < MANUAL_REMINDER_COOLDOWN_MS
  ) {
    return { result: 'too_soon' };
  }

  const outcome = await sendAppointmentMessage(appointmentId, 'reminder', {
    actorUserId: userId,
    manual: true,
  });
  if (outcome.result === 'sent') {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { reminderSentAt: new Date() },
    });
  }
  return outcome;
}

/**
 * Sends the confirmation or reminder template to a number the user typed, with sample values, so
 * the clinic can check the stored credentials and templates before switching messages on for real
 * patients. Ignores the master switch on purpose and touches no appointment.
 */
export async function sendTestMessage(
  kind: WhatsAppTestKind,
  phone: string,
  userId: string,
  now: Date = new Date()
): Promise<WhatsAppSendResponse> {
  const config = await resolveWhatsAppConfig();
  let outcome: WhatsAppSendResponse;
  const to = toWhatsAppNumber(phone);
  if (!config) {
    outcome = { result: 'not_configured' };
  } else if (!to) {
    outcome = { result: 'invalid_phone' };
  } else {
    // Tomorrow at 10:00 clinic time reads like a real appointment in the message.
    const sample = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    outcome = await deliver(to, templateFor(config, kind), [
      'Paciente de prueba',
      formatDate(sample),
      '10:00',
    ]);
  }

  await writeAuditLogSafe({
    userId,
    action: 'create',
    entity: 'WhatsAppTest',
    entityId: kind,
    // Only the last digits, so the audit trail shows which phone without storing the full number.
    metadata: {
      kind,
      success: outcome.result === 'sent',
      ...(outcome.result === 'sent' ? {} : { reason: outcome.result }),
      toSuffix: to ? to.slice(-4) : null,
    },
  });
  return outcome;
}
