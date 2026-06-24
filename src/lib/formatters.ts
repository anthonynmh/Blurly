/**
 * Format a numeric value as a currency string.
 * Uses Intl.NumberFormat — no external deps.
 */
export function formatCurrency(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a 0..1 ratio as a percentage string, e.g. 0.286 → "28.6%"
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format an ISO date string or date-only string (YYYY-MM-DD) to a readable date.
 */
export function formatDate(dateStr: string): string {
  // Parse as UTC-noon to avoid timezone-offset rendering issues
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Format a plain number with thousand-separators and fixed decimals.
 */
export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Today's date as a YYYY-MM-DD string (local timezone).
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
