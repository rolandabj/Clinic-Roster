/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standard Date Formatting Utilities
 * Standardizes all date displays across the entire clinic application to 'dd-mm-yyyy' format.
 */

/**
 * Formats any date string (ISO 'YYYY-MM-DD', timestamp, or Date object) into 'dd-mm-yyyy'.
 * Example: '2026-10-01' -> '01-10-2026'
 * Example: Date object -> '01-10-2026'
 */
export function formatDate(input: string | Date | number | null | undefined): string {
  if (!input) return '';

  // Direct regex match for ISO date formats (e.g. '2026-10-01' or '2026-10-01T...')
  // This avoids any unwanted browser timezone shifting.
  if (typeof input === 'string') {
    const trimmed = input.trim();
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      return `${d}-${m}-${y}`;
    }
  }

  const dObj = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
  if (isNaN(dObj.getTime())) {
    return String(input);
  }

  const day = String(dObj.getDate()).padStart(2, '0');
  const month = String(dObj.getMonth() + 1).padStart(2, '0');
  const year = dObj.getFullYear();

  return `${day}-${month}-${year}`;
}

/**
 * Formats a date range into 'dd-mm-yyyy to dd-mm-yyyy'
 */
export function formatDateRange(
  startDate?: string | Date | null,
  endDate?: string | Date | null
): string {
  if (!startDate && !endDate) return '';
  if (startDate && !endDate) return formatDate(startDate);
  if (!startDate && endDate) return formatDate(endDate);
  return `${formatDate(startDate)} to ${formatDate(endDate)}`;
}

/**
 * Formats a timestamp or date into 'dd-mm-yyyy HH:MM'
 */
export function formatDateTime(input: string | Date | number | null | undefined): string {
  if (!input) return '';

  const dObj = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
  if (isNaN(dObj.getTime())) {
    return formatDate(input);
  }

  const day = String(dObj.getDate()).padStart(2, '0');
  const month = String(dObj.getMonth() + 1).padStart(2, '0');
  const year = dObj.getFullYear();
  const hours = String(dObj.getHours()).padStart(2, '0');
  const minutes = String(dObj.getMinutes()).padStart(2, '0');

  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

/**
 * Formats a date with weekday: e.g. 'Mon, 01-10-2026'
 */
export function formatDateWithWeekday(input: string | Date | null | undefined): string {
  if (!input) return '';
  const dObj = typeof input === 'string' ? new Date(input.includes('T') ? input : input + 'T00:00:00Z') : input;
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = weekdays[dObj.getUTCDay()] || '';
  return `${weekday}, ${formatDate(input)}`;
}

/**
 * Converts 'dd-mm-yyyy' back to 'YYYY-MM-DD' if needed for machine processing.
 */
export function parseDdMmYyyyToIso(ddMmYyyy: string): string {
  if (!ddMmYyyy) return '';
  const match = ddMmYyyy.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return `${y}-${m}-${d}`;
  }
  return ddMmYyyy;
}
