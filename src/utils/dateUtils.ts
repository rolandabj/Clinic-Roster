/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Date Utility Module
 * Enforces standardized DD-MM-YYYY date format across the application UI.
 */

/**
 * Formats any date input (YYYY-MM-DD string, ISO timestamp, Date object, or timestamp number)
 * into DD-MM-YYYY format.
 *
 * Examples:
 *   formatDate('2026-10-01') => '01-10-2026'
 *   formatDate('2026-05-09T14:30:00Z') => '09-05-2026'
 *   formatDate(new Date('2026-10-15T00:00:00Z')) => '15-10-2026'
 */
export function formatDate(input: string | Date | number | null | undefined): string {
  if (!input) return '';

  if (typeof input === 'string') {
    const trimmed = input.trim();
    // If already in DD-MM-YYYY format, return directly
    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
      return trimmed;
    }

    // Fast-path for pure YYYY-MM-DD date string
    const match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      return `${day}-${month}-${year}`;
    }
  }

  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return String(input);

  // Use local date for timestamps
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  return `${day}-${month}-${year}`;
}

/**
 * Formats a date range into DD-MM-YYYY to DD-MM-YYYY
 */
export function formatDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
  separator: string = ' to '
): string {
  if (!start && !end) return '';
  if (!start) return formatDate(end);
  if (!end) return formatDate(start);
  return `${formatDate(start)}${separator}${formatDate(end)}`;
}

/**
 * Formats a date with time into DD-MM-YYYY HH:mm (or HH:mm:ss if includeSeconds is true)
 */
export function formatDateTime(
  input: string | Date | number | null | undefined,
  includeSeconds: boolean = false
): string {
  if (!input) return '';

  if (typeof input === 'string') {
    // If it's a date-only string like YYYY-MM-DD, just format the date
    if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
      return formatDate(input);
    }
  }

  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return formatDate(input);

  const dateStr = formatDate(d);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  if (includeSeconds) {
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${dateStr} ${hours}:${minutes}:${seconds}`;
  }
  return `${dateStr} ${hours}:${minutes}`;
}
