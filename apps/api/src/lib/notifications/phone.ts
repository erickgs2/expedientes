/**
 * Normalizes a free-text `Patient.phone` value into the bare-digits format Meta's WhatsApp Cloud API
 * requires for the `to` field (e.g. "525512345678", no leading "+"). This app collects phone numbers
 * as a plain string with no format enforced at entry, so numbers may already include a country code,
 * include punctuation/spaces, or be missing a country code entirely.
 *
 * Returns `null` when what's left after stripping non-digits is too short to plausibly be a real
 * phone number — callers must skip the send rather than call the API with garbage input.
 */
export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  // 11+ digits already looks like it carries a country code (Mexican numbers are 10 digits
  // locally); anything shorter gets Mexico's +52 prepended. Meta's Cloud API requires the `to`
  // field as bare digits — country code + number, no leading "+", no leading zeros, no
  // punctuation.
  return digits.length >= 11 ? digits : `52${digits}`;
}
