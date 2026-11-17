/**
 * Transactional email through Resend's HTTP API (https://resend.com/docs/api-reference/emails).
 *
 * Without RESEND_API_KEY nothing is sent: the message is written to the log instead, so development
 * and a server not yet configured keep working. Codes in the log expire in minutes, but the log of a
 * production server should not be where they live for long: set the key.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function emailFrom(): string {
  return process.env.MAIL_FROM?.trim() || 'MedCloud <no-reply@intech-erp.com>';
}

export async function sendEmail(email: OutgoingEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(`[email not sent: RESEND_API_KEY is not set] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: emailFrom(),
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (!response.ok) {
    // The body names the problem (unverified domain, bad key) and never echoes the key.
    const detail = await response.text().catch(() => '');
    throw new EmailDeliveryError(`Resend answered ${response.status}: ${detail.slice(0, 300)}`);
  }
}
