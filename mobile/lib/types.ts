export type UserRole = 'patient' | 'caregiver';

export type BPCategory =
  | 'low'
  | 'normal'
  | 'elevated'
  | 'stage_1'
  | 'stage_2'
  | 'crisis';

export type BPTrend = 'improving' | 'worsening' | 'stable' | 'not_enough_data';

export type RiskLevel = 'no_data' | 'low' | 'moderate' | 'high' | 'critical';

export type Arm = 'left' | 'right';
export type Position = 'sitting' | 'standing' | 'lying';

export interface PatientProfile {
  id: number;
  diagnosis: string | null;
  medical_history: string | null;
  allergies: string | null;
  medications: string | null;
  target_systolic: number | null;
  target_diastolic: number | null;
  measurements_per_day: number | null;
  measurement_times: string[];
  timezone: string;
}

export interface LinkedPatient {
  patient_id: number;
  patient_user_id: number;
  first_name: string;
  last_name: string;
  priority: number;
  notify_after_minutes: number;
  is_primary_contact: boolean;
  diagnosis: string | null;
  medical_history: string | null;
  allergies: string | null;
  medications: string | null;
  target_systolic: number | null;
  target_diastolic: number | null;
  measurement_times: string[];
  timezone: string;
}

export interface CaregiverProfile {
  id: number;
  relationship: string;
  phone: string | null;
  notes: string | null;
  status: string;
  claimed_at: string | null;
  patients: LinkedPatient[];
}

export interface User {
  id: number;
  email: string | null;
  first_name: string;
  last_name: string;
  age: number | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  patient_profile: PatientProfile | null;
  caregiver_profile: CaregiverProfile | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

export interface Reading {
  id: number;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  measured_at: string;
  device_id: number | null;
  notes: string | null;
  symptoms: string[];
  source: string;
  arm: Arm | null;
  position: Position | null;
  resting_minutes: number | null;
  client_reading_id: string | null;
  category: BPCategory;
  pulse_pressure: number;
  mean_arterial_pressure: number;
}

export interface DailyReadingStats {
  date: string;
  reading_count: number;
  average_systolic: number;
  average_diastolic: number;
  average_pulse: number | null;
  min_systolic: number;
  max_systolic: number;
  readings_above_target: number;
}

export interface PeriodComparison {
  period_days: number;
  reading_count: number;
  average_systolic: number;
  average_diastolic: number;
  average_pulse: number | null;
  delta_systolic: number;
  delta_diastolic: number;
  direction: 'better' | 'worse' | 'stable';
}

export interface ReadingAnalysis {
  period_days: number;
  reading_count: number;
  average_systolic: number | null;
  average_diastolic: number | null;
  average_pulse: number | null;
  min_systolic: number | null;
  max_systolic: number | null;
  min_diastolic: number | null;
  max_diastolic: number | null;
  latest_reading: Reading | null;
  category_counts: Record<string, number>;
  daily: DailyReadingStats[];
  previous_period: PeriodComparison | null;
  target_systolic: number | null;
  target_diastolic: number | null;
  readings_above_target: number;
  in_target_percent: number | null;
  trend: BPTrend;
  alerts: string[];
}

export interface ReminderSchedule {
  id: number;
  patient_id: number;
  timezone: string;
  times: string[];
  days_of_week: number[];
  grace_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type WindowStatus =
  | 'pending'
  | 'completed'
  | 'missed'
  | 'escalated'
  | 'acknowledged'
  | 'unresolved';

export interface MeasurementWindow {
  id: number;
  patient_id: number;
  due_at: string;
  status: WindowStatus;
  escalation_level: number;
  next_escalation_at: string | null;
  reminded_at: string | null;
  missed_at: string | null;
  escalated_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface AdherenceSummary {
  period_days: number;
  expected: number;
  completed: number;
  missed: number;
  escalated: number;
  unresolved: number;
  adherence_percent: number | null;
  last_completed_at: string | null;
}

export interface DailyAssessment {
  generated_at: string;
  risk_level: RiskLevel;
  headline: string;
  summary: string;
  reasons: string[];
  actions: string[];
  readings_last_24h: number;
  average_systolic: number | null;
  average_diastolic: number | null;
  latest_reading: Reading | null;
  missed_last_7_days: number;
  adherence_percent_7_days: number | null;
  trend_7_days: BPTrend;
}

export interface FutureProjection {
  horizon_days: number;
  projected_systolic: number | null;
  projected_diastolic: number | null;
  projected_category: string | null;
  confidence: 'high' | 'moderate' | 'low' | 'insufficient_data';
}

export interface RiskAssessment {
  generated_at: string;
  risk_level: RiskLevel;
  risk_score: number;
  classification: string;
  reasons: string[];
  recommendations: string[];
  model_version: string;
  assessed_reading_id: number | null;
  readings_used: number;
  disclaimer: string;
}

export interface RiskHistoryItem {
  id: number;
  generated_at: string;
  risk_level: RiskLevel;
  risk_score: number;
  classification: string;
  direction: string | null;
  readings_used: number;
  reasons: string[];
}

export interface RiskPrediction {
  generated_at: string;
  current: RiskAssessment;
  direction: 'rising' | 'stable' | 'falling';
  slope_systolic_per_day: number | null;
  slope_diastolic_per_day: number | null;
  variability_systolic: number | null;
  projections: FutureProjection[];
  days_until_target_breach: number | null;
  days_until_stage_2: number | null;
  days_until_crisis: number | null;
  probability_of_missing_next_measurement: number | null;
  future_risk_level: RiskLevel;
  future_reasons: string[];
  disclaimer: string;
}

export interface PeriodReport {
  period_days: number;
  generated_at: string;
  risk_level: RiskLevel;
  headline: string;
  narrative: string;
  highlights: string[];
  recommendations: string[];
  analysis: ReadingAnalysis;
  adherence: AdherenceSummary;
}

export interface AssistantAnswer {
  intent: string;
  answer: string;
  data: Record<string, unknown>;
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: string;
  window_id: number | null;
  created_at: string;
  sent_at: string | null;
  read_at: string | null;
  acknowledged_at: string | null;
}

export interface NotificationList {
  items: NotificationItem[];
  total: number;
  unread: number;
}

export interface PatientCaregiver {
  caregiver_id: number;
  caregiver_user_id: number;
  first_name: string;
  last_name: string;
  relationship: string;
  phone: string | null;
  notes: string | null;
  priority: number;
  notify_after_minutes: number;
  status: string;
  claimed_at: string | null;
}

export interface CaregiverCode {
  caregiver_id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  relationship: string;
  priority: number;
  notify_after_minutes: number;
  code: string;
}

export interface CaregiverCodePreview {
  patient_first_name: string;
  patient_last_name: string;
  caregiver_first_name: string;
  caregiver_last_name: string;
  relationship: string;
  claimed: boolean;
}

export interface PushDevice {
  id: number;
  token: string;
  platform: string;
  is_active: boolean;
  created_at: string;
  last_seen_at: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  age: number;
  diagnosis?: string | null;
  medical_history?: string | null;
  allergies?: string | null;
  medications?: string | null;
  target_systolic?: number | null;
  target_diastolic?: number | null;
  measurements_per_day?: number | null;
  measurement_times?: string[];
  timezone: string;
}

export interface ReadingCreatePayload {
  systolic: number;
  diastolic: number;
  pulse?: number | null;
  measured_at?: string;
  notes?: string | null;
  symptoms?: string[];
  arm?: Arm | null;
  position?: Position | null;
  resting_minutes?: number | null;
  client_reading_id?: string;
}

export interface ReadingUpdatePayload {
  systolic?: number;
  diastolic?: number;
  pulse?: number | null;
  measured_at?: string;
  notes?: string | null;
  symptoms?: string[] | null;
  arm?: Arm | null;
  position?: Position | null;
  resting_minutes?: number | null;
}

export interface ReminderSchedulePayload {
  timezone: string;
  times: string[];
  days_of_week: number[];
  grace_minutes: number;
  is_active: boolean;
}

export interface PatientProfilePayload {
  diagnosis?: string | null;
  medical_history?: string | null;
  allergies?: string | null;
  medications?: string | null;
  target_systolic?: number | null;
  target_diastolic?: number | null;
}

export interface CaregiverCreatePayload {
  first_name: string;
  last_name: string;
  relationship: string;
  phone?: string | null;
  notes?: string | null;
  priority?: number;
  notify_after_minutes?: number;
}

export interface CaregiverUpdatePayload {
  first_name?: string;
  last_name?: string;
  relationship?: string;
  phone?: string | null;
  notes?: string | null;
  priority?: number;
  notify_after_minutes?: number;
}

export interface CaregiverSelfUpdatePayload {
  first_name?: string;
  last_name?: string;
  relationship?: string;
  phone?: string | null;
  notes?: string | null;
}
