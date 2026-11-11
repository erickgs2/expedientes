/** The clinic's wall-clock zone; the same one the WhatsApp messages format dates in. */
export const CLINIC_TIME_ZONE = 'America/Mexico_City';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds the zone is ahead of UTC at `instant` (negative west of Greenwich). */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The UTC instant of local midnight starting `YYYY-MM-DD` in `timeZone`. */
function zonedMidnight(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let instant = guess - zoneOffsetMs(guess, timeZone);
  // A second pass settles the rare case where the offset differs between the guess and the result
  // (a DST change on that date).
  instant = guess - zoneOffsetMs(instant, timeZone);
  return new Date(instant);
}

/** `YYYY-MM-DD` of `now` on the clinic's wall clock. */
export function clinicDateOf(now: Date, timeZone = CLINIC_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Adds whole days to a `YYYY-MM-DD` string. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** `[start, end)` of a clinic-local day, as UTC instants. */
export function clinicDayRange(date: string, timeZone = CLINIC_TIME_ZONE): { start: Date; end: Date } {
  return { start: zonedMidnight(date, timeZone), end: zonedMidnight(addDays(date, 1), timeZone) };
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}
