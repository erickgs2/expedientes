import { getClinicSettings } from '../clinic/clinic-settings';
import { prismaUnscoped } from '../prisma/client';

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  confirmationTemplate: string;
  reminderTemplate: string;
  templateLanguage: string;
}

const DEFAULT_CONFIRMATION_TEMPLATE = 'appointment_confirmation';
const DEFAULT_REMINDER_TEMPLATE = 'appointment_reminder';
const DEFAULT_TEMPLATE_LANGUAGE = 'es_MX';

function fromEnv(name: string): string {
  return process.env[name]?.trim() ?? '';
}

/**
 * Resolves the WhatsApp settings, preferring what is stored in clinic settings and falling back to
 * the environment.
 *
 * The database wins because that is what the clinic can change without a redeploy; the environment
 * remains supported so an existing deployment configured through `.env` keeps working untouched,
 * and so a token can still be injected by a secret manager rather than typed into a form.
 *
 * Returns `null` when the two required values — the token and the sender's phone number id — are
 * not both present from either source. Callers treat that as "notifications are off".
 */
export async function resolveWhatsAppConfig(): Promise<WhatsAppConfig | null> {
  const settings = await getClinicSettings();

  // The environment is one server-wide WhatsApp account. With several clinics it would make every
  // clinic that has not configured its own send from that account, under that clinic's name, so the
  // fallback only applies while the server holds a single clinic.
  const envAllowed = (await prismaUnscoped.clinic.count()) <= 1;
  const env = (name: string) => (envAllowed ? fromEnv(name) : '');

  const accessToken = settings?.whatsappAccessToken?.trim() || env('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId =
    settings?.whatsappPhoneNumberId?.trim() || env('WHATSAPP_PHONE_NUMBER_ID');

  if (!accessToken || !phoneNumberId) return null;

  return {
    accessToken,
    phoneNumberId,
    confirmationTemplate:
      settings?.whatsappConfirmationTemplate?.trim() ||
      fromEnv('WHATSAPP_CONFIRMATION_TEMPLATE') ||
      DEFAULT_CONFIRMATION_TEMPLATE,
    reminderTemplate:
      settings?.whatsappReminderTemplate?.trim() ||
      fromEnv('WHATSAPP_REMINDER_TEMPLATE') ||
      DEFAULT_REMINDER_TEMPLATE,
    templateLanguage:
      settings?.whatsappTemplateLanguage?.trim() ||
      fromEnv('WHATSAPP_TEMPLATE_LANGUAGE') ||
      DEFAULT_TEMPLATE_LANGUAGE,
  };
}
