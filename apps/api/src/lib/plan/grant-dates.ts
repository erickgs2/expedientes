/**
 * Calendar arithmetic for manual Premium grants, in the clinic's own time zone. A grant of N months
 * that starts on the 31st of January ends on the last day of the month N months later when that
 * month is shorter, at 23:59:59 local time.
 */

export const MIN_GRANT_MONTHS = 1;
export const MAX_GRANT_MONTHS = 24;

export function isValidGrantMonths(months: unknown): months is number {
  return (
    typeof months === 'number' &&
    Number.isInteger(months) &&
    months >= MIN_GRANT_MONTHS &&
    months <= MAX_GRANT_MONTHS
  );
}

interface WallClock {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** How far the time zone's wall clock is ahead of UTC at `instant`, in milliseconds. */
function zoneOffset(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant at which the wall clock in `timeZone` shows the given local time. */
export function zonedTime(wall: WallClock, timeZone: string): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  // The offset can differ on either side of a daylight-saving change, so it is taken again at the
  // first estimate. Mexico has had no DST since 2022, but clinics may later pick other zones.
  const first = naive - zoneOffset(new Date(naive), timeZone);
  return new Date(naive - zoneOffset(new Date(first), timeZone));
}

/** When a grant of `months` starting at `start` ends, in the clinic's time zone. */
export function grantEndDate(start: Date, months: number, timeZone: string): Date {
  const local = wallClock(start, timeZone);
  const monthIndex = local.month - 1 + months;
  const year = local.year + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(local.day, lastDayOfMonth);
  return zonedTime({ year, month, day, hour: 23, minute: 59, second: 59 }, timeZone);
}
