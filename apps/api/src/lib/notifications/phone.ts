/**
 * Normalizes a free-text `Patient.phone` value into an E.164-ish number WhatsApp's API accepts
 * (e.g. "+525512345678"). This app collects phone numbers as a plain string with no format
 * enforced at entry, so numbers may already include a country code, include punctuation/spaces,
 * or be missing a country code entirely.
 *
 * Returns `null` when what's left after stripping non-digits is too short to plausibly be a real
 * phone number — callers must skip the send rather than call the API with garbage input.
 */
export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  // 11+ digits already looks like it carries a country code (Mexican numbers are 10 digits
  // locally); anything shorter gets Mexico's +52 prepended.
  const withCountryCode = digits.length >= 11 ? digits : `52${digits}`;
  return `+${withCountryCode}`;
}
