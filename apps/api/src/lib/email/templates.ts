import type { OutgoingEmail } from './send-email';

/** Public address of the app, for links in emails. */
export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL?.trim() || 'https://medcloud.intech-erp.com').replace(/\/+$/, '');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * One plain layout for every message: the brand, a heading, the body, and a quiet footer. Inline
 * styles only, because email clients drop stylesheets. Everything interpolated is escaped.
 */
function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f6f3f1;font-family:Helvetica,Arial,sans-serif;color:#2b2b2e">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e6e0dc;border-radius:12px">
<tr><td style="padding:28px 32px">
<p style="margin:0 0 20px;font-size:15px;font-weight:700;letter-spacing:.2px">MedCloud</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(heading)}</h1>
${bodyHtml}
</td></tr></table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#7a7470;text-align:center">
Recibiste este correo por una acción en tu cuenta de MedCloud. Si no fuiste tú, puedes ignorarlo.</p>
</body></html>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.5">${escapeHtml(text)}</p>`;
}

function codeBlock(code: string): string {
  return `<p style="margin:8px 0 20px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:Menlo,Consolas,monospace">${escapeHtml(code)}</p>`;
}

function button(label: string, url: string): string {
  return `<p style="margin:8px 0 20px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;background:#2b2b2e;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">${escapeHtml(label)}</a></p>`;
}

export function signupCodeEmail(to: string, code: string, minutes: number): OutgoingEmail {
  const intro = 'Escribe este código en MedCloud para confirmar tu correo y crear tu clínica:';
  const expiry = `Vence en ${minutes} minutos.`;
  return {
    to,
    subject: `${code} es tu código de MedCloud`,
    text: `${intro}\n\n${code}\n\n${expiry}`,
    html: layout('Confirma tu correo', paragraph(intro) + codeBlock(code) + paragraph(expiry)),
  };
}

/**
 * Sent instead of a code when someone registers with an email that already has an account. The
 * screen answers the same either way, so the form never reveals which emails are registered; only
 * the inbox's owner learns it.
 */
export function accountExistsEmail(to: string): OutgoingEmail {
  const loginUrl = `${appBaseUrl()}/login`;
  const resetUrl = `${appBaseUrl()}/recuperar`;
  const text1 = 'Alguien intentó crear una cuenta nueva de MedCloud con este correo, pero ya tienes una.';
  const text2 = 'Puedes entrar con tu contraseña o, si no la recuerdas, recuperarla.';
  return {
    to,
    subject: 'Ya tienes una cuenta de MedCloud',
    text: `${text1}\n${text2}\n\nEntrar: ${loginUrl}\nRecuperar contraseña: ${resetUrl}`,
    html: layout(
      'Ya tienes una cuenta',
      paragraph(text1) + paragraph(text2) + button('Entrar', loginUrl) +
        `<p style="margin:0;font-size:14px"><a href="${escapeHtml(resetUrl)}" style="color:#2b2b2e">Recuperar contraseña</a></p>`
    ),
  };
}

export function passwordResetCodeEmail(to: string, code: string, minutes: number): OutgoingEmail {
  const intro = 'Escribe este código en MedCloud para elegir una contraseña nueva:';
  const expiry = `Vence en ${minutes} minutos. Si no lo pediste, tu contraseña sigue igual.`;
  return {
    to,
    subject: `${code} es tu código para recuperar tu contraseña`,
    text: `${intro}\n\n${code}\n\n${expiry}`,
    html: layout('Recupera tu contraseña', paragraph(intro) + codeBlock(code) + paragraph(expiry)),
  };
}

export function invitationEmail(
  to: string,
  params: { clinicName: string; inviterName: string; url: string; days: number }
): OutgoingEmail {
  const intro = `${params.inviterName} te invitó a usar MedCloud en ${params.clinicName}.`;
  const expiry = `La invitación vence en ${params.days} días.`;
  return {
    to,
    subject: `Te invitaron a ${params.clinicName} en MedCloud`,
    text: `${intro}\n\nAcepta aquí: ${params.url}\n\n${expiry}`,
    html: layout(
      `Te invitaron a ${params.clinicName}`,
      paragraph(intro) + button('Aceptar invitación', params.url) + paragraph(expiry)
    ),
  };
}

function formatDate(iso: Date, timeZone = 'America/Mexico_City'): string {
  return iso.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone });
}

export function premiumGrantedEmail(
  to: string,
  params: { clinicName: string; endsAt: Date; timeZone: string }
): OutgoingEmail {
  const until = formatDate(params.endsAt, params.timeZone);
  const intro = `${params.clinicName} tiene MedCloud Premium hasta el ${until}.`;
  const detail =
    'Incluye usuarios y tipos de tratamiento ilimitados, recordatorios por WhatsApp, roles personalizados y 20 GB para fotos.';
  const url = `${appBaseUrl()}/admin/plan`;
  return {
    to,
    subject: `${params.clinicName} ya tiene Premium`,
    text: `${intro}\n${detail}\n\nVer tu plan: ${url}`,
    html: layout('Tu clínica ya tiene Premium', paragraph(intro) + paragraph(detail) + button('Ver mi plan', url)),
  };
}

export function premiumEndingEmail(
  to: string,
  params: { clinicName: string; endsAt: Date; timeZone: string }
): OutgoingEmail {
  const until = formatDate(params.endsAt, params.timeZone);
  const intro = `El Premium de ${params.clinicName} termina el ${until}.`;
  const detail =
    'Después vuelves al plan Gratis y conservas todos tus datos; solo se limita agregar usuarios, tipos de tratamiento y fotos por encima del plan Gratis.';
  const url = `${appBaseUrl()}/admin/plan`;
  return {
    to,
    subject: `Tu Premium termina el ${until}`,
    text: `${intro}\n${detail}\n\nVer tu plan: ${url}`,
    html: layout('Tu Premium está por terminar', paragraph(intro) + paragraph(detail) + button('Ver mi plan', url)),
  };
}

export function legalChangedEmail(
  to: string,
  params: { kind: 'PRIVACY' | 'TERMS'; version: string; changeSummary: string; effectiveFrom: Date; requiresAcceptance: boolean }
): OutgoingEmail {
  const name = params.kind === 'PRIVACY' ? 'Aviso de privacidad' : 'Términos y condiciones';
  const url = `${appBaseUrl()}/${params.kind === 'PRIVACY' ? 'privacidad' : 'terminos'}`;
  const intro = `Actualizamos nuestro ${name} (versión ${params.version}), vigente desde el ${formatDate(params.effectiveFrom)}.`;
  const action = params.requiresAcceptance
    ? 'Te pediremos aceptarlo la próxima vez que entres a MedCloud.'
    : 'No necesitas hacer nada; puedes leerlo completo en el enlace.';
  return {
    to,
    subject: `Actualizamos nuestro ${name}`,
    text: `${intro}\n\nQué cambia:\n${params.changeSummary}\n\n${action}\n\nLeerlo: ${url}`,
    html: layout(
      `Actualizamos nuestro ${name}`,
      paragraph(intro) +
        `<p style="margin:0 0 6px;font-size:15px;font-weight:600">Qué cambia</p>` +
        params.changeSummary.split(/\n+/).map(paragraph).join('') +
        paragraph(action) +
        button('Leer el documento', url)
    ),
  };
}

function pesos(cents: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
}

export function paymentReceivedEmail(
  to: string,
  params: { clinicName: string; amountCents: number | null; paidUntil: Date; timeZone: string; method: 'CARD' | 'OXXO' }
): OutgoingEmail {
  const until = formatDate(params.paidUntil, params.timeZone);
  const amount = params.amountCents ? `${pesos(params.amountCents)} ` : '';
  const intro = `Recibimos tu pago ${amount}de MedCloud Premium para ${params.clinicName}.`;
  const detail =
    params.method === 'CARD'
      ? `Tu plan está vigente hasta el ${until} y se renueva solo con tu tarjeta.`
      : `Tu plan está vigente hasta el ${until}. Como pagaste en OXXO, te avisaremos antes de que termine para que generes la siguiente ficha.`;
  const url = `${appBaseUrl()}/admin/plan`;
  return {
    to,
    subject: 'Recibimos tu pago de MedCloud Premium',
    text: `${intro}\n${detail}\n\nVer tu plan: ${url}`,
    html: layout('Pago recibido', paragraph(intro) + paragraph(detail) + button('Ver mi plan', url)),
  };
}

export function paymentFailedEmail(
  to: string,
  params: { clinicName: string; graceEndsAt: Date; timeZone: string }
): OutgoingEmail {
  const until = formatDate(params.graceEndsAt, params.timeZone);
  const intro = `No pudimos cobrar la renovación de MedCloud Premium de ${params.clinicName} con tu tarjeta.`;
  const detail = `Tu Premium sigue activo hasta el ${until} mientras reintentamos. Actualiza tu tarjeta para no perderlo; si no, volverás al plan Gratis y conservarás todos tus datos.`;
  const url = `${appBaseUrl()}/admin/plan`;
  return {
    to,
    subject: 'No pudimos cobrar tu MedCloud Premium',
    text: `${intro}\n${detail}\n\nActualizar tarjeta: ${url}`,
    html: layout('Revisa tu forma de pago', paragraph(intro) + paragraph(detail) + button('Actualizar tarjeta', url)),
  };
}

export function prepaidEndingEmail(
  to: string,
  params: { clinicName: string; endsAt: Date; timeZone: string; days: number }
): OutgoingEmail {
  const until = formatDate(params.endsAt, params.timeZone);
  const when = params.days <= 1 ? 'mañana' : `en ${params.days} días`;
  const intro = `El periodo de MedCloud Premium que pagaste en OXXO para ${params.clinicName} termina ${when}, el ${until}.`;
  const detail = 'Genera la siguiente ficha OXXO (o cambia a tarjeta) para seguir en Premium. Si no, volverás al plan Gratis y conservarás todos tus datos.';
  const url = `${appBaseUrl()}/admin/plan`;
  return {
    to,
    subject: `Tu Premium termina ${when}`,
    text: `${intro}\n${detail}\n\nRenovar: ${url}`,
    html: layout('Renueva tu Premium', paragraph(intro) + paragraph(detail) + button('Renovar', url)),
  };
}
