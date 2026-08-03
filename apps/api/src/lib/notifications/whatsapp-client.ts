const WHATSAPP_API_VERSION = 'v21.0';

/**
 * Sends a WhatsApp template message via Meta's Cloud API. No SDK dependency — a plain `fetch`
 * call, matching how the rest of this app handles simple external HTTP integrations.
 *
 * Silently no-ops (does not call the API, does not throw) when `WHATSAPP_ACCESS_TOKEN` or
 * `WHATSAPP_PHONE_NUMBER_ID` is unset, logging a single warning the first time this happens per
 * server process — this lets local development run without real Meta credentials configured.
 *
 * Throws on any non-2xx response or network error when credentials ARE configured; callers are
 * responsible for catching and treating a failed send as best-effort, non-blocking.
 */
let warnedMissingCredentials = false;

export function isWhatsAppConfigured(): boolean {
  return !!(process.env['WHATSAPP_ACCESS_TOKEN'] && process.env['WHATSAPP_PHONE_NUMBER_ID']);
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  parameters: string[]
): Promise<void> {
  const accessToken = process.env['WHATSAPP_ACCESS_TOKEN'];
  const phoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
  const languageCode = process.env['WHATSAPP_TEMPLATE_LANGUAGE'] || 'es_MX';

  if (!accessToken || !phoneNumberId) {
    if (!warnedMissingCredentials) {
      console.warn(
        'WhatsApp notifications disabled: WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not set'
      );
      warnedMissingCredentials = true;
    }
    return;
  }

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
