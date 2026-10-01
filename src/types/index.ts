/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ClinicRoster Core Domain Models & Strict Types (Phase 1)
 */

export type IsoDateString = string; // 'YYYY-MM-DD'
export type TimeString = string;    // 'HH:mm' 24-hour format

export type BlockWeeks = 1 | 2 | 3 | 4;

export type ScheduleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type AssignmentKind = 'DOCTOR' | 'SPECIALTY' | 'CLINICAL_ROLE';
export type AssignmentSource = 'GENERATED' | 'MANUAL' | 'LOCK';

export type LockMode = 'ASSIGNMENT' | 'OFF';

export type DoctorSessionSource = 'PATTERN' | 'MANUAL';

export type RuleScope = 'PER_NURSE' | 'PER_DAY' | 'PER_DUTY_WINDOW' | 'PER_PERIOD';
export type RuleMetric =
  | 'CONSECUTIVE_DUTIES_ENDING_AT_OR_AFTER'
  | 'CONSECUTIVE_WORKING_DAYS'
  | 'TOTAL_HOURS_IN_WINDOW'
  | 'WEEKENDS_OFF_COUNT'
  | 'HOLIDAYS_WORKED_COUNT'
  | 'DUTIES_WITH_END_TIME_X_COUNT'
  | 'MAX_PERIOD_HOURS'
  | 'UNALLOCATED_PAIRING_COUNT';
export type RuleOperator = 'MAX' | 'MIN';
export type RuleSeverity = 'HARD' | 'SOFT';
export type RuleTemplateKey =
  | 'SENIOR_ON_DUTY'
  | 'MAX_CONSECUTIVE_DAYS'
  | 'MIN_REST_HOURS'
  | 'MAX_DUTIES_PER_DAY'
  | 'DEDICATED_NURSE_CLINIC'
  | 'MIN_ADDITIONAL_NURSE_OVER_DOCTORS'
  | 'MAX_CONSECUTIVE_LATE_DUTIES'
  | 'MAX_WORKING_HOURS_PER_PERIOD'
  | 'STRICT_PROFILE_ALLOCATION';

export type UserRole = 'OWNER' | 'PLANNER' | 'EDITOR' | 'STAFF' | 'VIEWER';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED';

export type UserAccessStatus = 'APPROVED' | 'PENDING' | 'REVOKED';
export type UserAccessRole = 'VIEWER' | 'EDITOR';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// Whitelist & In-App User Access Record (Phase 1)
export interface UserAccessRecord {
  id: string;
  email: string; // normalized lowercase
  name?: string;
  status: UserAccessStatus; // 'APPROVED' | 'PENDING' | 'REVOKED'
  appRole: UserAccessRole;   // 'VIEWER' | 'EDITOR'
  isManager: boolean;       // determines if user can approve nurse leave & availability
  linkedNurseId?: string;   // optional link to nurse staff directory
  approvedBy: string;       // e.g. 'rolandabj@gmail.com'
  approvedAt?: string;      // ISO timestamp
  createdAt: string;
  updatedAt?: string;
}

// Nurse Availability Request Model (Phase 1)
export interface AvailabilityRequest {
  id: string;
  nurseId: string;
  date: IsoDateString;
  available: boolean; // true = available / preferred duty, false = unavailable / requested day off
  preferredDutyWindowId?: string;
  note?: string;
  status: ApprovalStatus; // 'PENDING' | 'APPROVED' | 'REJECTED'
  submittedByNurseId: string;
  submittedAt: string;
  reviewedByUserId?: string;
  reviewedByUserName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export type EmailLogKind = 'PUBLISH' | 'CHANGE' | 'TEST';
export type EmailLogStatus = 'MOCK_SENT' | 'SENT' | 'FAILED';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'RESTORE'
  | 'LOCK'
  | 'OVERRIDE_LOCK'
  | 'PUBLISH'
  | 'SWAP'
  | 'TEMPLATE_APPLY'
  | 'REBALANCE';

// Roster Template for Phase 14
export interface TemplateSlotPattern {
  nurseId: string;
  weekday: number; // 0 = Sun ... 6 = Sat
  dutyWindowId: string;
  kind: AssignmentKind;
  targetRefId?: string; // doctorId, specialtyId, or clinicalRoleId
}

export interface RosterTemplate {
  id: string;
  name: string;
  description?: string;
  patterns: TemplateSlotPattern[];
  sourceScheduleId?: string;
  createdAt: string;
}

// Shift Swap Request for Phase 14
export interface SwapRequest {
  id: string;
  scheduleId: string;
  nurseAId: string;
  dateA: IsoDateString;
  assignmentAId: string;
  dutyWindowAId: string;
  nurseBId: string;
  dateB: IsoDateString;
  assignmentBId: string;
  dutyWindowBId: string;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: string;
  createdAt: string;
  resolvedAt?: string;
}

// Webhooks & ChatOps Configuration
export type WebhookPlatform = 'SLACK' | 'TEAMS' | 'DISCORD' | 'GENERIC';

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  platform: WebhookPlatform;
  enabled: boolean;
  events: {
    rosterPublished: boolean;
    shiftSwapFinalized: boolean;
    severeViolationDetected: boolean;
  };
}

export interface WebhookConfig {
  enabled: boolean;
  endpoints: WebhookEndpoint[];
}

// 1. ClinicProfile
export interface ClinicProfile {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  timezone: string; // default 'Asia/Dubai'
  workingDays: boolean[]; // index 0 = Sun, 1 = Mon ... 6 = Sat (default all true)
  openTime: TimeString; // '09:00'
  closeTime: TimeString; // '21:00'
  defaultBlockWeeks: BlockWeeks; // default 2
  updatedAt: string;
  webhookConfig?: WebhookConfig;
}

// 2. DutyWindow ("acceptable duty")
export interface DutyWindow {
  id: string;
  name: string; // e.g. "Full Day", "Late", "Early"
  acronym: string; // max 5 chars: "D", "L", "E"
  startTime: TimeString; // '09:00'
  endTime: TimeString; // '21:00'
  color: string; // hex or tailwind token
  active: boolean;
  isPriority?: boolean; // When true, schedule generator attempts this duty first
  priorityRank?: number; // Optional tie-breaker (higher = higher priority, default 100)
}

// 3. LeaveType
export interface LeaveType {
  id: string;
  name: string;
  acronym: string; // max 3 chars, e.g. "RO", "DO", "BL", "AL", "PH", "SL"
  creditedHours: number | 'match_duty'; // 0, 8, or 'match_duty'
  countsTowardHoursTarget: boolean; // default ON for BL/AL/PH/SL, OFF for RO/DO
  color: string;
  active: boolean;
}

// 4. SeniorityLevel
export interface SeniorityLevel {
  id: string;
  name: string; // Charge Nurse, Senior Nurse, Staff Nurse, Junior Nurse, Intern
  rank: number; // 1 = highest
  isSenior: boolean; // drives Hard Rule H1 ("senior on duty")
  color: string;
}

// 5. ClinicalRole (clinical support assignment)
export interface ClinicalRole {
  id: string;
  name: string; // "Blood Collection & IV"
  acronym: string; // "PHL"
  description: string;
  defaultDailyQuota: number; // default 1/day
  defaultStartTime?: TimeString; // '09:00'
  defaultEndTime?: TimeString; // '13:00'
}

// 6. Specialty
export interface Specialty {
  id: string;
  name: string; // Cardiology, Pediatrics, Dermatology
  code: string; // CARD, PED, DERM (3-5 chars)
}

// 7. Nurse
export interface NursePreference {
  kind: 'DOCTOR' | 'SPECIALTY' | 'CLINICAL_ROLE';
  refId: string; // doctorId, specialtyId, or clinicalRoleId
  rank: number; // 1 = 1st choice, 2 = 2nd choice ...
}

export interface Nurse {
  id: string;
  fullName: string;
  gmail: string; // required for notifications; validate format
  employeeCode: string;
  seniorityLevelId: string;
  contractPercent: number; // 100 for full-time, 50 for half-time
  dateOfBirth: IsoDateString; // YYYY-MM-DD drives Birthday Leave
  capabilityIds: string[]; // ClinicalRole ids (e.g. PHL)
  isClinicNurse: boolean; // default capability flag
  preferences: NursePreference[];
  leaveQuotas?: Record<string, number>; // leaveTypeId -> annualQuotaDays (annual allowed days per calendar year)
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// 8. Doctor
export interface WeeklyPatternSlot {
  weekday: number; // 0 = Sun, 1 = Mon ... 6 = Sat
  startTime: TimeString;
  endTime: TimeString;
  room?: string;
}

export interface Doctor {
  id: string;
  fullName: string;
  gmail?: string;
  specialtyIds: string[];
  weeklyPattern: WeeklyPatternSlot[];
  notes?: string;
  active: boolean;
}

// 9. DoctorSession (entered concrete session, never engine-generated)
export interface DoctorSession {
  id: string;
  doctorId: string;
  date: IsoDateString;
  startTime: TimeString;
  endTime: TimeString;
  specialtyId: string;
  room?: string;
  source: DoctorSessionSource;
  cancelled: boolean;
}

// 10. LeaveEntry
export interface LeaveEntry {
  id: string;
  nurseId: string;
  leaveTypeId: string;
  startDate: IsoDateString;
  endDate: IsoDateString;
  note?: string;
  approved: boolean;
  hoursCredited: number; // computed snapshot
  status?: ApprovalStatus; // 'PENDING' | 'APPROVED' | 'REJECTED'
  submittedByNurseId?: string;
  submittedAt?: string;
  reviewedByUserId?: string; // Manager user ID who decided
  reviewedByUserName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

// 11. LockEntry ("non-changeable day")
export interface LockEntry {
  id: string;
  nurseId: string;
  date: IsoDateString;
  mode: LockMode; // ASSIGNMENT or OFF
  dutyWindowId?: string; // required if mode === 'ASSIGNMENT'
  assignmentKind?: AssignmentKind;
  targetRefId?: string; // doctorId, specialtyId, or clinicalRoleId
  note?: string;
  createdAt: string;
}

// 12. Rule
export interface Rule {
  id: string;
  name: string;
  templateKey?: RuleTemplateKey | string;
  scope: RuleScope;
  metric: RuleMetric;
  params?: Record<string, any>; // e.g. { thresholdTime: '21:00' }
  operator: RuleOperator;
  value: number; // e.g. 3, 6, 11
  windowDays?: number;
  severity: RuleSeverity; // HARD or SOFT
  enabled: boolean;
}

// 13. Schedule
export interface Schedule {
  id: string;
  name: string; // e.g. "October 2026 — Al Shifa"
  startDate: IsoDateString;
  endDate: IsoDateString;
  blockWeeks: BlockWeeks;
  hoursTargetFullTime: number; // custom contract hours target set per roster
  workingHoursPeriodId?: string;
  periodName?: string;
  status: ScheduleStatus;
  createdFromTemplateId?: string;
  activeVersionNumber: number;
  createdAt: string;
  updatedAt: string;
}

// 14. Assignment (a filled roster cell)
export interface Assignment {
  id: string;
  scheduleId: string;
  nurseId: string;
  date: IsoDateString;
  dutyWindowId: string;
  kind: AssignmentKind;
  doctorId?: string;
  specialtyId?: string;
  clinicalRoleId?: string;
  locked: boolean;
  source: AssignmentSource;
  note?: string;
}

// 15. ScheduleVersion
export interface ScheduleVersion {
  id: string;
  scheduleId: string;
  number: number;
  timestamp: string;
  author: string;
  note: string;
  snapshot: {
    schedule: Schedule;
    assignments: Assignment[];
    leaveEntries: LeaveEntry[];
    locks: LockEntry[];
    rulesSnapshot: Rule[];
  };
  isPublished: boolean;
  publishedAt?: string;
}

// 16. ShareLink
export interface ShareLink {
  id: string;
  scheduleId: string;
  token: string;
  role: 'VIEWER';
  public: boolean;
  allowedEmails: string[];
  createdAt: string;
  revoked: boolean;
  pointsToVersionId: string;
}

// 17. Invitation
export interface Invitation {
  id: string;
  scheduleId: string;
  email: string;
  role: 'EDITOR' | 'VIEWER';
  status: InvitationStatus;
  createdAt: string;
}

// 18. PublishLog / EmailLog
export interface EmailRecipientLog {
  email: string;
  nurseId: string;
  nurseName: string;
  subject: string;
  bodyPreview: string;
  fullBodyHtml: string;
  status: EmailLogStatus;
  errorMessage?: string;
}

export interface PublishLog {
  id: string;
  scheduleId: string;
  versionId: string;
  kind: EmailLogKind;
  recipients: EmailRecipientLog[];
  providerMessageId?: string;
  status: EmailLogStatus;
  sentAt: string;
}

// 19. Acknowledgment
export interface Acknowledgment {
  id: string;
  scheduleId: string;
  nurseId: string;
  versionId: string;
  token: string;
  ackAt?: string;
  sentAt: string;
}

// 20. PublicHoliday
export interface PublicHoliday {
  id: string;
  date: IsoDateString;
  name: string;
  country: string; // default 'AE'
  hijriNote?: string;
}

// 21. NurseHoursQuota
export interface NurseHoursQuota {
  id: string;
  nurseId: string;
  leaveTypeId: string;
  annualQuotaDays?: number;
  annualQuotaHours: number;
  usedDays?: number;
  usedHours: number;
}

// 22. AuditEvent
export interface AuditEvent {
  id: string;
  scheduleId?: string;
  actor: string;
  action: AuditAction;
  entity: string; // e.g. 'Assignment', 'LockEntry', 'Schedule'
  entityId: string;
  before?: any;
  after?: any;
  note?: string;
  timestamp: string;
}

// 23. SystemMetadata (Initialization & Persistent Tombstone State)
export interface SystemMetadata {
  id: string; // e.g. 'initialization_state'
  status: 'CLEARED' | 'INITIALIZED';
  clearedAt?: string;
  clearedBy?: string;
  initializedAt?: string;
  note?: string;
}

// 24. WorkingHoursPeriod (Dedicated Roster Cycle & Contract Working Hours)
export interface WorkingHoursPeriod {
  id: string;
  year: string;               // e.g. "2025-2026" or "2026"
  name: string;               // e.g. "Dec19-Jan18", "Jan19-Feb18"
  startDate: IsoDateString;   // e.g. "2025-12-19"
  endDate: IsoDateString;     // e.g. "2026-01-18"
  workingHours: number;       // e.g. 210, 227, 145, 207, 220, 230, etc.
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Repository Collection Key Map
export type CollectionName =
  | 'clinics'
  | 'dutyWindows'
  | 'leaveTypes'
  | 'seniorityLevels'
  | 'clinicalRoles'
  | 'specialties'
  | 'nurses'
  | 'doctors'
  | 'doctorSessions'
  | 'leaveEntries'
  | 'locks'
  | 'rules'
  | 'schedules'
  | 'assignments'
  | 'versions'
  | 'shareLinks'
  | 'invitations'
  | 'emailLog'
  | 'acknowledgments'
  | 'holidays'
  | 'quotas'
  | 'audit'
  | 'templates'
  | 'swaps'
  | 'userAccess'
  | 'availabilityRequests'
  | 'systemMetadata'
  | 'workingHoursPeriods';

// Type lookup helper for generic repository access
export type EntityForCollection<T extends CollectionName> =
  T extends 'clinics' ? ClinicProfile :
  T extends 'dutyWindows' ? DutyWindow :
  T extends 'leaveTypes' ? LeaveType :
  T extends 'seniorityLevels' ? SeniorityLevel :
  T extends 'clinicalRoles' ? ClinicalRole :
  T extends 'specialties' ? Specialty :
  T extends 'nurses' ? Nurse :
  T extends 'doctors' ? Doctor :
  T extends 'doctorSessions' ? DoctorSession :
  T extends 'leaveEntries' ? LeaveEntry :
  T extends 'locks' ? LockEntry :
  T extends 'rules' ? Rule :
  T extends 'schedules' ? Schedule :
  T extends 'assignments' ? Assignment :
  T extends 'versions' ? ScheduleVersion :
  T extends 'shareLinks' ? ShareLink :
  T extends 'invitations' ? Invitation :
  T extends 'emailLog' ? PublishLog :
  T extends 'acknowledgments' ? Acknowledgment :
  T extends 'holidays' ? PublicHoliday :
  T extends 'quotas' ? NurseHoursQuota :
  T extends 'audit' ? AuditEvent :
  T extends 'templates' ? RosterTemplate :
  T extends 'swaps' ? SwapRequest :
  T extends 'userAccess' ? UserAccessRecord :
  T extends 'availabilityRequests' ? AvailabilityRequest :
  T extends 'systemMetadata' ? SystemMetadata :
  T extends 'workingHoursPeriods' ? WorkingHoursPeriod :
  any;
