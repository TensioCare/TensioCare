import { API_BASE_URL } from './config';
import type {
  AdherenceSummary,
  AssistantAnswer,
  AuthResponse,
  CaregiverCode,
  CaregiverCodePreview,
  CaregiverCreatePayload,
  CaregiverSelfUpdatePayload,
  CaregiverUpdatePayload,
  DailyAssessment,
  LinkedPatient,
  MeasurementWindow,
  NotificationItem,
  NotificationList,
  PatientCaregiver,
  PatientProfile,
  PeriodReport,
  PushDevice,
  RiskPrediction,
  RiskHistoryItem,
  Reading,
  ReadingAnalysis,
  ReadingCreatePayload,
  ReadingUpdatePayload,
  RegisterPayload,
  ReminderSchedule,
  ReminderSchedulePayload,
  User,
} from './types';

let accessToken: string | null = null;
let refreshHandler: (() => Promise<string | null>) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setRefreshHandler(handler: (() => Promise<string | null>) | null): void {
  refreshHandler = handler;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function detailMessage(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return String(item);
      })
      .join(', ');
  }
  if (detail && typeof detail === 'object' && 'detail' in detail) {
    return detailMessage((detail as { detail: unknown }).detail);
  }
  return 'Something went wrong. Please try again.';
}

interface RequestOptions extends RequestInit {
  skipAuthRetry?: boolean;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { skipAuthRetry = false, headers: providedHeaders, ...init } = options;
  const headers = new Headers(providedHeaders ?? {});

  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (response.status === 401 && !skipAuthRetry && refreshHandler) {
    const refreshed = await refreshHandler().catch(() => null);
    if (refreshed) {
      return apiRequest<T>(path, { ...options, skipAuthRetry: true });
    }
  }

  if (!response.ok) {
    const body = await parseBody(response);
    const message =
      body && typeof body === 'object' && 'detail' in body
        ? detailMessage((body as { detail: unknown }).detail)
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await parseBody(response)) as T;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (email: string, password: string) =>
    apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  caregiverLogin: (code: string) =>
    apiRequest<AuthResponse>('/auth/caregiver/login', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  caregiverPreview: (code: string) =>
    apiRequest<CaregiverCodePreview>(
      `/auth/caregiver-codes/${encodeURIComponent(code)}`,
    ),

  refresh: (refreshToken: string) =>
    apiRequest<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
      skipAuthRetry: true,
    }),

  logout: (refreshToken: string) =>
    apiRequest<void>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
      skipAuthRetry: true,
    }),

  me: () => apiRequest<User>('/auth/me'),
};

export const patientsApi = {
  profile: () => apiRequest<PatientProfile>('/patients/me'),

  updateProfile: (payload: PatientProfileUpdatePayload) =>
    apiRequest<PatientProfile>('/patients/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  caregivers: () => apiRequest<PatientCaregiver[]>('/patients/me/caregivers'),

  addCaregiver: (payload: CaregiverCreatePayload) =>
    apiRequest<CaregiverCode>('/patients/me/caregivers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  regenerateCode: (caregiverId: number) =>
    apiRequest<CaregiverCode>(`/patients/me/caregivers/${caregiverId}/code`, {
      method: 'POST',
    }),

  updateCaregiver: (caregiverId: number, payload: CaregiverUpdatePayload) =>
    apiRequest<PatientCaregiver>(`/patients/me/caregivers/${caregiverId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  removeCaregiver: (caregiverId: number) =>
    apiRequest<void>(`/patients/me/caregivers/${caregiverId}`, {
      method: 'DELETE',
    }),
};

export const remindersApi = {
  schedule: () => apiRequest<ReminderSchedule | null>('/patients/me/reminders'),

  upsertSchedule: (payload: ReminderSchedulePayload) =>
    apiRequest<ReminderSchedule>('/patients/me/reminders', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteSchedule: () =>
    apiRequest<void>('/patients/me/reminders', { method: 'DELETE' }),

  windows: (days = 14) =>
    apiRequest<MeasurementWindow[]>(`/patients/me/reminders/windows${query({ days })}`),

  snooze: (windowId: number, minutes = 15) =>
    apiRequest<MeasurementWindow>(
      `/patients/me/reminders/windows/${windowId}/snooze`,
      {
        method: 'POST',
        body: JSON.stringify({ minutes }),
      },
    ),

  adherence: (days = 30) =>
    apiRequest<AdherenceSummary>(`/patients/me/adherence${query({ days })}`),
};

export const readingsApi = {
  list: (limit = 100, offset = 0) =>
    apiRequest<Reading[]>(`/patients/me/readings${query({ limit, offset })}`),

  latest: () => apiRequest<Reading>('/patients/me/readings/latest'),

  analysis: (days = 7) =>
    apiRequest<ReadingAnalysis>(`/patients/me/readings/analysis${query({ days })}`),

  create: (payload: ReadingCreatePayload) =>
    apiRequest<Reading>('/patients/me/readings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  update: (readingId: number, payload: ReadingUpdatePayload) =>
    apiRequest<Reading>(`/patients/me/readings/${readingId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  remove: (readingId: number) =>
    apiRequest<void>(`/patients/me/readings/${readingId}`, {
      method: 'DELETE',
    }),
};

export const insightsApi = {
  assessment: () => apiRequest<DailyAssessment>('/patients/me/assessment'),

  risk: () => apiRequest<RiskPrediction>('/patients/me/risk'),

  riskHistory: (limit = 10) =>
    apiRequest<RiskHistoryItem[]>(`/patients/me/risk/history${query({ limit })}`),

  anomalies: () =>
    apiRequest<{
      count: number;
      findings: { reading_id: number; kind: string; message: string }[];
      disclaimer: string;
    }>('/patients/me/anomalies'),

  report: (days = 15) =>
    apiRequest<PeriodReport>(`/patients/me/reports/15-day${query({ days })}`),

  ask: (question: string) =>
    apiRequest<AssistantAnswer>('/patients/me/assistant', {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),

  /** RAG chat over the patient's own dataset (NVIDIA NIM, fallback built in). */
  askChat: (messages: ChatMessage[]) =>
    apiRequest<AssistantAnswer>('/patients/me/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    }),
};

export const notificationsApi = {
  list: (options: { unreadOnly?: boolean; type?: string; limit?: number } = {}) =>
    apiRequest<NotificationList>(
      `/notifications${query({
        unread_only: options.unreadOnly,
        type: options.type,
        limit: options.limit ?? 50,
      })}`,
    ),

  unreadCount: () => apiRequest<{ unread: number }>('/notifications/unread-count'),

  markRead: (notificationId: number) =>
    apiRequest<NotificationItem>(`/notifications/${notificationId}/read`, {
      method: 'POST',
    }),

  markAllRead: () =>
    apiRequest<{ updated: number }>('/notifications/read-all', { method: 'POST' }),

  acknowledge: (notificationId: number) =>
    apiRequest<NotificationItem>(`/notifications/${notificationId}/ack`, {
      method: 'POST',
    }),

  registerDevice: (token: string, platform: 'ios' | 'android' | 'web') =>
    apiRequest<PushDevice>('/notifications/devices', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    }),

  devices: () => apiRequest<PushDevice[]>('/notifications/devices'),

  removeDevice: (deviceId: number) =>
    apiRequest<void>(`/notifications/devices/${deviceId}`, { method: 'DELETE' }),
};

export const caregiversApi = {
  patients: () => apiRequest<LinkedPatient[]>('/caregivers/me/patients'),

  updateMe: (payload: CaregiverSelfUpdatePayload) =>
    apiRequest<User>('/caregivers/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  updateLink: (
    patientId: number,
    payload: { priority?: number; notify_after_minutes?: number },
  ) =>
    apiRequest<LinkedPatient>(`/caregivers/me/patients/${patientId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  leave: (patientId: number) =>
    apiRequest<void>(`/caregivers/me/patients/${patientId}`, { method: 'DELETE' }),

  /** Timing only: due times and completion status, never readings. */
  windows: (patientId: number, days = 7) =>
    apiRequest<MeasurementWindow[]>(
      `/caregivers/me/patients/${patientId}/windows${query({ days })}`,
    ),

  /** Completion counts only — no readings are exposed to caregivers. */
  adherence: (patientId: number, days = 30) =>
    apiRequest<AdherenceSummary>(
      `/caregivers/me/patients/${patientId}/adherence${query({ days })}`,
    ),

  /** Derived risk summary (level + score + trajectory) — no raw readings. */
  risk: (patientId: number) =>
    apiRequest<RiskPrediction>(
      `/caregivers/me/patients/${patientId}/risk`,
    ),

  /** Derived anomaly summary — no raw readings. */
  anomalies: (patientId: number) =>
    apiRequest<{
      count: number;
      findings: { reading_id: number; kind: string; message: string }[];
      disclaimer: string;
    }>(`/caregivers/me/patients/${patientId}/anomalies`),

  /** RAG chat over the patient's dataset (NVIDIA NIM, rule-based fallback). */
  askChat: (patientId: number, messages: ChatMessage[]) =>
    apiRequest<AssistantAnswer>(`/caregivers/me/patients/${patientId}/assistant/chat`, {
      method: 'POST',
      body: JSON.stringify({ messages }),
    }),
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PatientProfileUpdatePayload {
  diagnosis?: string | null;
  medical_history?: string | null;
  allergies?: string | null;
  medications?: string | null;
  target_systolic?: number | null;
  target_diastolic?: number | null;
}
