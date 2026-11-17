/** Pesos from centavos, without decimals when the amount is whole: "$150", "$1,530.50". */
export function formatMxn(cents: number, lang: string): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** "350 MB", "1.2 GB". */
export function formatBytes(bytes: number, lang: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1;
  return `${value.toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: digits })} ${units[unit]}`;
}

/** Share of a limit used, 0–100, for a meter. Unlimited quotas read as 0. */
export function usagePercent(used: number, max: number | null): number {
  if (max === null || max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}
