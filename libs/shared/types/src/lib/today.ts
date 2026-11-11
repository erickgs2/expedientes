import type { AppointmentStatus } from './appointment.js';
import type { RecentPatient } from './patient.js';

/**
 * Where an appointment stands right now, from the front desk's point of view. Computed by the
 * server from the status, `arrivedAt` and the current time, so every screen agrees on it.
 */
export type TodayPhase =
  | 'upcoming'
  | 'arrived'
  | 'in_consult'
  | 'done'
  | 'no_show'
  | 'cancelled';

/**
 * Per-appointment warnings. Each is `null` when the caller lacks the permission that reveals it,
 * so the desk shows nothing rather than a misleading "no".
 */
export interface TodayAppointmentFlags {
  /** At least one allergy is on file. Only the fact — never the allergy itself. */
  hasAllergies: boolean | null;
  /** The patient has no historia clínica yet. */
  noHistoria: boolean | null;
  /** A treatment item dated today has no consent attached. */
  consentPending: boolean | null;
}

export interface TodayAppointment {
  id: string;
  patientId: string;
  patientName: string;
  startTime: string;
  durationMinutes: number;
  status: AppointmentStatus;
  treatmentTypeNames: string[];
  reminderSentAt: string | null;
  confirmationSentAt: string | null;
  arrivedAt: string | null;
  phase: TodayPhase;
  /** Unconfirmed and still ahead, or missing a consent or historia clínica. */
  needsAction: boolean;
  flags: TodayAppointmentFlags;
}

export interface TodayKpis {
  /** Non-cancelled appointments today. */
  total: number;
  done: number;
  inConsult: number;
  /** Confirmed, arrived or done, out of `total`. */
  confirmed: number;
  /** Appointments needing a front-desk action; each appointment counts once. */
  needsAction: number;
  unconfirmedUpcoming: number;
  consentPending: number;
  noHistoria: number;
  tomorrowTotal: number;
  tomorrowUnconfirmed: number;
}

export interface TodayPending {
  /** Treatment items from the last 30 days with a "before" photo but no "after" one. */
  afterPhotosMissing: number | null;
  noShowsThisWeek: number;
}

export type TodayRecentPatient = RecentPatient;

export interface TodayDesk {
  /** The clinic-local day this describes, `YYYY-MM-DD`. */
  date: string;
  /** Server time the phases were computed against. */
  generatedAt: string;
  /** Whether messages to real patients are switched on in clinic settings. */
  whatsappEnabled: boolean;
  kpis: TodayKpis;
  appointments: TodayAppointment[];
  pending: TodayPending;
  /** `null` without `patients:view`. */
  recentPatients: TodayRecentPatient[] | null;
}

/** Outcome of a WhatsApp send, as returned by the manual-reminder and test endpoints. */
export type WhatsAppSendResult =
  | 'sent'
  | 'disabled'
  | 'not_configured'
  | 'invalid_phone'
  | 'send_failed'
  | 'too_soon';

export interface WhatsAppSendResponse {
  result: WhatsAppSendResult;
  /** Meta's error text for `send_failed`, so a misconfigured template can be diagnosed. */
  detail?: string;
}

export type WhatsAppTestKind = 'confirmation' | 'reminder';

export interface WhatsAppTestInput {
  kind: WhatsAppTestKind;
  phone: string;
}
