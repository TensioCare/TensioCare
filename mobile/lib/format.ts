import { categoryColors, riskLabels, trendLabels } from '@/constants/theme';

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const shortTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return dateFormatter.format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return timeFormatter.format(date);
}

export function formatShortTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return shortTimeFormatter.format(date);
}

export function formatClockTime(hhmm: string): string {
  const [hourText, minuteText] = hhmm.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return hhmm;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return timeFormatter.format(date);
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value)}%`;
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export function categoryLabel(category: string): string {
  return categoryColors[category]?.label ?? category.replace('_', ' ');
}

export function riskLabel(risk: string): string {
  return riskLabels[risk] ?? risk;
}

export function trendLabel(trend: string): string {
  return trendLabels[trend] ?? trend.replace(/_/g, ' ');
}

export function windowStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Upcoming';
    case 'completed':
      return 'Completed';
    case 'missed':
      return 'Missed';
    case 'escalated':
      return 'Escalated';
    case 'acknowledged':
      return 'Acknowledged';
    case 'unresolved':
      return 'Unresolved';
    default:
      return status;
  }
}

export function daysLabel(days: number[]): string {
  if (days.length === 7) return 'Every day';
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((day) => names[day] ?? String(day))
    .join(', ');
}
