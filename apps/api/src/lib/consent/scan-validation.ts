import { isJpeg, isPng } from '../storage/image-signature';

export const MAX_SCAN_PAGES = 20;
export const MAX_SCAN_PAGE_BYTES = 10 * 1024 * 1024;
export const MIN_SCAN_PAGE_BYTES = 1024;

export type ScanPage = { buffer: Buffer; extension: 'jpg' | 'png' };

/** The authoritative check: runs on bytes actually read, never on a client-declared type or size. */
export function validateScanPages(
  buffers: Buffer[]
): { ok: true; pages: ScanPage[] } | { ok: false; message: string } {
  if (buffers.length === 0) return { ok: false, message: 'At least one scan page is required' };
  if (buffers.length > MAX_SCAN_PAGES) {
    return { ok: false, message: `A scan can have at most ${MAX_SCAN_PAGES} pages` };
  }
  const pages: ScanPage[] = [];
  for (const buffer of buffers) {
    if (buffer.length < MIN_SCAN_PAGE_BYTES || buffer.length > MAX_SCAN_PAGE_BYTES) {
      return { ok: false, message: 'A scan page is too large or too small' };
    }
    if (isJpeg(buffer)) pages.push({ buffer, extension: 'jpg' });
    else if (isPng(buffer)) pages.push({ buffer, extension: 'png' });
    else return { ok: false, message: 'Every scan page must be a JPEG or PNG image' };
  }
  return { ok: true, pages };
}

/** `today` is the clinic-local `YYYY-MM-DD` (`localSigningDate()`); ISO dates compare as strings. */
export function validateSignedDate(value: string, today: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'signedDate must be YYYY-MM-DD';
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
    return 'signedDate is not a real calendar date';
  }
  if (value > today) return 'signedDate cannot be in the future';
  return null;
}

export function validateScanItemIds(
  requested: string[],
  treatmentItemIds: string[],
  signedItemIds: string[]
):
  | { ok: true }
  | { ok: false; code: 'INVALID_INPUT' | 'NOT_IN_TREATMENT' | 'ALREADY_SIGNED'; message: string } {
  if (requested.length === 0) {
    return { ok: false, code: 'INVALID_INPUT', message: 'At least one consent is required' };
  }
  if (new Set(requested).size !== requested.length) {
    return { ok: false, code: 'INVALID_INPUT', message: 'itemIds must not repeat' };
  }
  const inTreatment = new Set(treatmentItemIds);
  if (requested.some((id) => !inTreatment.has(id))) {
    return {
      ok: false,
      code: 'NOT_IN_TREATMENT',
      message: 'Every consent must belong to this treatment visit',
    };
  }
  const signed = new Set(signedItemIds);
  if (requested.some((id) => signed.has(id))) {
    return { ok: false, code: 'ALREADY_SIGNED', message: 'A selected consent is already signed' };
  }
  return { ok: true };
}
