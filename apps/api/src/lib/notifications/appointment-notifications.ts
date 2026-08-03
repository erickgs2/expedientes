import { prisma } from '../prisma/client';
import { writeAuditLogSafe } from '../audit/audit-log';
import { sendTemplateMessage } from './whatsapp-client';
import { toWhatsAppNumber } from './phone';

const REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

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

/**
 * Fetches the appointment + patient fresh (rather than trusting a caller-supplied object), builds
 * the shared three-parameter template payload (patient name, date, time), and sends it. Always
 * writes an audit log entry, success or failure. Returns whether the send succeeded, so
 * `runReminderSweep` knows whether to mark `reminderSentAt`.
 */
async function sendAppointmentMessage(
  appointmentId: string,
  templateName: string,
  kind: NotificationKind
): Promise<boolean> {
  let appointment;
  try {
    appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: true },
    });
  } catch (error) {
    console.error(`Failed to look up appointment ${appointmentId} for WhatsApp ${kind}`, error);
    return false;
  }
  if (!appointment) return false;

  const to = toWhatsAppNumber(appointment.patient.phone);
  if (!to) {
    await writeAuditLogSafe({
      userId: 'system',
      action: 'create',
      entity: 'AppointmentNotification',
      entityId: appointment.id,
      patientId: appointment.patientId,
      metadata: { kind, success: false, reason: 'invalid_phone' },
    });
    return false;
  }

  try {
    await sendTemplateMessage(to, templateName, [
      appointment.patient.fullName,
      formatDate(appointment.startTime),
      formatTime(appointment.startTime),
    ]);
    await writeAuditLogSafe({
      userId: 'system',
      action: 'create',
      entity: 'AppointmentNotification',
      entityId: appointment.id,
      patientId: appointment.patientId,
      metadata: { kind, success: true },
    });
    return true;
  } catch (error) {
    console.error(`Failed to send WhatsApp ${kind} for appointment ${appointment.id}`, error);
    await writeAuditLogSafe({
      userId: 'system',
      action: 'create',
      entity: 'AppointmentNotification',
      entityId: appointment.id,
      patientId: appointment.patientId,
      metadata: { kind, success: false, reason: 'send_failed' },
    });
    return false;
  }
}

/**
 * Sends the booking-confirmation message for a just-created appointment. Best-effort: never
 * throws, so a WhatsApp failure can never fail the appointment-creation request that calls this.
 */
export async function sendConfirmation(appointmentId: string): Promise<void> {
  const templateName = process.env['WHATSAPP_CONFIRMATION_TEMPLATE'] || 'appointment_confirmation';
  await sendAppointmentMessage(appointmentId, templateName, 'confirmation');
}

/**
 * Finds every not-yet-reminded, non-cancelled appointment whose `startTime` falls within the next
 * 2 hours, sends each its reminder, and marks `reminderSentAt` only on a successful send. A failed
 * send is retried on the next sweep; once `startTime` passes, the appointment falls out of this
 * query's `gt: now` bound and is never retried again — the entire retry mechanism, no backoff or
 * retry-count field needed.
 */
export async function runReminderSweep(): Promise<void> {
  const templateName = process.env['WHATSAPP_REMINDER_TEMPLATE'] || 'appointment_reminder';
  const now = new Date();
  const due = await prisma.appointment.findMany({
    where: {
      reminderSentAt: null,
      status: { not: 'CANCELLED' },
      startTime: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
    },
  });

  for (const appointment of due) {
    const sent = await sendAppointmentMessage(appointment.id, templateName, 'reminder');
    if (sent) {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { reminderSentAt: new Date() },
      });
    }
  }
}
