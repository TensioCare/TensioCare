export function dateToHHMM(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function hhmmToDate(value: string): Date {
  const [hourText, minuteText] = value.split(':');
  const date = new Date();
  const hour = Number(hourText);
  const minute = Number(minuteText);
  date.setHours(
    Number.isFinite(hour) ? hour : 8,
    Number.isFinite(minute) ? minute : 0,
    0,
    0,
  );
  return date;
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function sortTimes(times: string[]): string[] {
  return [...new Set(times)].sort();
}
