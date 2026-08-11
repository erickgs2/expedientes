import { resolveWhatsAppConfig } from './whatsapp-config';

const WHATSAPP_API_VERSION = 'v21.0';

/**
 * Sends a WhatsApp template message via Meta's Cloud API. No SDK dependency — a plain `fetch`
 * call, matching how the rest of this app handles simple external HTTP integrations.
 *
 * Silently no-ops (does not call the API, does not throw) when the access token or the sender's
 * phone number id is unconfigured, logging a single warning the first time this happens per server
 * process — this lets local development run without real Meta credentials.
 *
 * Throws on any non-2xx response or network error when credentials ARE configured; callers are
 * responsible for catching and treating a failed send as best-effort, non-blocking.
 */
let warnedMissingCredentials = false;

export async function isWhatsAppConfigured(): Promise<boolean> {
  return (await resolveWhatsAppConfig()) !== null;
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  parameters: string[]
): Promise<void> {
  const config = await resolveWhatsAppConfig();

  if (!config) {
    if (!warnedMissingCredentials) {
      console.warn(
        'WhatsApp notifications disabled: no access token / phone number id in clinic settings or environment'
      );
      warnedMissingCredentials = true;
    }
    return;
  }

  const { accessToken, phoneNumberId, templateLanguage: languageCode } = config;

  const response = await fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: [
            {
              type: 'body',
              parameters: parameters.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`WhatsApp API request failed (${response.status}): ${body}`);
  }
}
