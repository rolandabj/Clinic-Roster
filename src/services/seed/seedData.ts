/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Clinic Taxonomy & Production Baseline Data
 * Al Shifa Outpatient Clinic
 */

import {
  ClinicProfile,
  DutyWindow,
  LeaveType,
  SeniorityLevel,
  ClinicalRole,
  Specialty,
  Nurse,
  Doctor,
  LeaveEntry,
  LockEntry,
  Rule,
  PublicHoliday,
  Schedule,
  RosterTemplate,
  SwapRequest,
  AuditEvent,
  UserAccessRecord,
  AvailabilityRequest,
  WorkingHoursPeriod,
} from '../../types';

export const SEED_CLINIC_PROFILE: ClinicProfile = {
  id: 'clinic-al-shifa',
  name: 'American Hospital Nad Al Sheba OutPatient clinic',
  address: 'Nad Al Sheba, Dubai, UAE',
  phone: '+971 4 300 0000',
  timezone: 'Asia/Dubai',
  workingDays: [true, true, true, true, true, true, true], // Sun-Sat (all 7 days)
  openTime: '09:00',
  closeTime: '21:00',
  defaultBlockWeeks: 2,
  updatedAt: new Date().toISOString(),
};

export const SEED_DUTY_WINDOWS: DutyWindow[] = [
  {
    id: 'duty-full-day',
    name: 'Full Day',
    acronym: 'D',
    startTime: '09:00',
    endTime: '21:00',
    color: '#3b82f6', // blue-500
    active: true,
    isPriority: true,
    priorityRank: 100,
  },
  {
    id: 'duty-late',
    name: 'Late',
    acronym: 'L',
    startTime: '11:00',
    endTime: '21:00',
    color: '#8b5cf6', // purple-500
    active: true,
    isPriority: false,
    priorityRank: 50,
  },
  {
    id: 'duty-early',
    name: 'Early',
    acronym: 'E',
    startTime: '08:00',
    endTime: '16:00',
    color: '#10b981', // emerald-500
    active: true,
    isPriority: false,
    priorityRank: 50,
  },
];

export const SEED_LEAVE_TYPES: LeaveType[] = [
  {
    id: 'leave-ro',
    name: 'Request Off',
    acronym: 'RO',
    creditedHours: 0,
    countsTowardHoursTarget: false,
    color: '#94a3b8', // slate-400
    active: true,
  },
  {
    id: 'leave-do',
    name: 'Day Off',
    acronym: 'DO',
    creditedHours: 0,
    countsTowardHoursTarget: false,
    color: '#cbd5e1', // slate-300
    active: true,
  },
  {
    id: 'leave-bl',
    name: 'Birthday Leave',
    acronym: 'BL',
    creditedHours: 8,
    countsTowardHoursTarget: true,
    color: '#f43f5e', // rose-500
    active: true,
  },
  {
    id: 'leave-al',
    name: 'Annual Leave',
    acronym: 'AL',
    creditedHours: 8,
    countsTowardHoursTarget: true,
    color: '#f59e0b', // amber-500
    active: true,
  },
  {
    id: 'leave-ph',
    name: 'Public Holiday',
    acronym: 'PH',
    creditedHours: 8,
    countsTowardHoursTarget: true,
    color: '#06b6d4', // cyan-500
    active: true,
  },
  {
    id: 'leave-sl',
    name: 'Sick Leave',
    acronym: 'SL',
    creditedHours: 8,
    countsTowardHoursTarget: true,
    color: '#ec4899', // pink-500
    active: true,
  },
];

export const SEED_SENIORITY_LEVELS: SeniorityLevel[] = [
  {
    id: 'seniority-charge',
    name: 'Charge Nurse',
    rank: 1,
    isSenior: true,
    color: '#4f46e5', // indigo-600
  },
  {
    id: 'seniority-senior',
    name: 'Senior Nurse',
    rank: 2,
    isSenior: true,
    color: '#6366f1', // indigo-500
  },
  {
    id: 'seniority-staff',
    name: 'Staff Nurse',
    rank: 3,
    isSenior: false,
    color: '#0ea5e9', // sky-500
  },
  {
    id: 'seniority-junior',
    name: 'Junior Nurse',
    rank: 4,
    isSenior: false,
    color: '#14b8a6', // teal-500
  },
  {
    id: 'seniority-intern',
    name: 'Intern',
    rank: 5,
    isSenior: false,
    color: '#64748b', // slate-500
  },
];

export const SEED_CLINICAL_ROLES: ClinicalRole[] = [
  {
    id: 'role-phl',
    name: 'Blood Collection & IV',
    acronym: 'PHL',
    description: 'Phlebotomist / IV insertion clinical support nurse',
    defaultDailyQuota: 1,
    defaultStartTime: '09:00',
    defaultEndTime: '13:00',
  },
  {
    id: 'role-nurse-clinic',
    name: 'Nurse Clinic',
    acronym: 'NC',
    description: 'Dedicated nurse-led clinic (triage, dressings, vitals & injections) — independent of doctor sessions',
    defaultDailyQuota: 1,
    defaultStartTime: '09:00',
    defaultEndTime: '17:00',
  },
];

export const SEED_SPECIALTIES: Specialty[] = [
  { id: 'spec-card', name: 'Cardiology', code: 'CARD' },
  { id: 'spec-ped', name: 'Pediatrics', code: 'PED' },
  { id: 'spec-derm', name: 'Dermatology', code: 'DERM' },
];

// Production Clean Baseline: Empty Personnel & Clinical Records
export const SEED_DOCTORS: Doctor[] = [];

export const SEED_NURSES: Nurse[] = [];

export const SEED_RULES: Rule[] = [
  // HARD Rules (never violate)
  {
    id: 'rule-h1',
    name: 'At least one senior nurse on each duty',
    templateKey: 'SENIOR_ON_DUTY',
    scope: 'PER_DUTY_WINDOW',
    metric: 'CONSECUTIVE_DUTIES_ENDING_AT_OR_AFTER',
    operator: 'MIN',
    value: 1,
    severity: 'HARD',
    enabled: true,
  },
  {
    id: 'rule-h2',
    name: 'Max consecutive working days per nurse = 6',
    templateKey: 'MAX_CONSECUTIVE_DAYS',
    scope: 'PER_NURSE',
    metric: 'CONSECUTIVE_WORKING_DAYS',
    operator: 'MAX',
    value: 6,
    severity: 'HARD',
    enabled: true,
  },
  {
    id: 'rule-h3',
    name: 'Minimum rest between duties = 11h',
    templateKey: 'MIN_REST_HOURS',
    scope: 'PER_NURSE',
    metric: 'TOTAL_HOURS_IN_WINDOW',
    operator: 'MIN',
    value: 11,
    severity: 'HARD',
    enabled: true,
  },
  {
    id: 'rule-h4',
    name: 'Max 1 duty per nurse per day',
    templateKey: 'MAX_DUTIES_PER_DAY',
    scope: 'PER_NURSE',
    metric: 'DUTIES_WITH_END_TIME_X_COUNT',
    operator: 'MAX',
    value: 1,
    severity: 'HARD',
    enabled: true,
  },
  {
    id: 'rule-nurse-clinic',
    name: 'Dedicated nurse clinic coverage (not assigned to doctor)',
    templateKey: 'DEDICATED_NURSE_CLINIC',
    scope: 'PER_DAY',
    metric: 'DUTIES_WITH_END_TIME_X_COUNT',
    operator: 'MIN',
    value: 1,
    severity: 'HARD',
    enabled: true,
  },
  {
    id: 'rule-nurse-plus-one',
    name: 'At least one additional nurse above doctors during clinic operating hours',
    templateKey: 'MIN_ADDITIONAL_NURSE_OVER_DOCTORS',
    scope: 'PER_DUTY_WINDOW',
    metric: 'DUTIES_WITH_END_TIME_X_COUNT',
    operator: 'MIN',
    value: 1,
    severity: 'HARD',
    enabled: true,
  },
  {
    id: 'rule-h7-max-hours',
    name: 'Maximum working hours limit per schedule period (no overwork)',
    templateKey: 'MAX_WORKING_HOURS_PER_PERIOD',
    scope: 'PER_NURSE',
    metric: 'MAX_PERIOD_HOURS',
    operator: 'MAX',
    value: 105,
    severity: 'HARD',
    enabled: true,
  },
  {
    id: 'rule-h8-strict-allocation',
    name: 'Strict Nurse Allocation: Only pair with doctors or specialties in nurse profile',
    templateKey: 'STRICT_PROFILE_ALLOCATION',
    scope: 'PER_NURSE',
    metric: 'DUTIES_WITH_END_TIME_X_COUNT',
    operator: 'MAX',
    value: 0,
    severity: 'HARD',
    enabled: true,
  },
  // SOFT Rules
  {
    id: 'rule-s1',
    name: 'No more than 3 consecutive duties ending at 21:00',
    templateKey: 'MAX_CONSECUTIVE_LATE_DUTIES',
    scope: 'PER_NURSE',
    metric: 'CONSECUTIVE_DUTIES_ENDING_AT_OR_AFTER',
    params: { thresholdTime: '21:00' },
    operator: 'MAX',
    value: 3,
    severity: 'HARD',
    enabled: true,
  },
];

export const SEED_PUBLIC_HOLIDAYS: PublicHoliday[] = [
  { id: 'hol-1', date: '2026-01-01', name: "New Year's Day", country: 'AE' },
  { id: 'hol-2', date: '2026-03-20', name: 'Eid Al Fitr (Start)', country: 'AE', hijriNote: 'Shawwal 1 (expected, confirm each year)' },
  { id: 'hol-3', date: '2026-03-21', name: 'Eid Al Fitr Day 2', country: 'AE', hijriNote: 'Shawwal 2' },
  { id: 'hol-4', date: '2026-05-26', name: 'Arafat Day', country: 'AE', hijriNote: 'Dhu Al-Hijjah 9 (expected, confirm each year)' },
  { id: 'hol-5', date: '2026-05-27', name: 'Eid Al Adha', country: 'AE', hijriNote: 'Dhu Al-Hijjah 10 (expected, confirm each year)' },
  { id: 'hol-6', date: '2026-06-16', name: 'Islamic New Year', country: 'AE', hijriNote: 'Muharram 1' },
  { id: 'hol-7', date: '2026-08-26', name: "Prophet's Birthday", country: 'AE', hijriNote: 'Rabi Al-Awwal 12' },
  { id: 'hol-8', date: '2026-10-29', name: 'UAE Public Holiday Observance', country: 'AE', hijriNote: 'Special observance holiday' },
  { id: 'hol-9', date: '2026-12-01', name: 'Commemoration Day', country: 'AE' },
  { id: 'hol-10', date: '2026-12-02', name: 'UAE National Day (Day 1)', country: 'AE' },
  { id: 'hol-11', date: '2026-12-03', name: 'UAE National Day (Day 2)', country: 'AE' },
];

export const SEED_SCHEDULE: Schedule = {
  id: 'sched-baseline',
  name: 'Clinical Schedule Period',
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  blockWeeks: 2,
  hoursTargetFullTime: 168,
  status: 'DRAFT',
  activeVersionNumber: 1,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

export const SEED_LEAVE_ENTRIES: LeaveEntry[] = [];

export const SEED_LOCKS: LockEntry[] = [];

export const SEED_TEMPLATES: RosterTemplate[] = [];

export const SEED_SWAPS: SwapRequest[] = [];

export const SEED_AUDIT_EVENTS: AuditEvent[] = [];

export const SEED_USER_ACCESS_RECORDS: UserAccessRecord[] = [
  {
    id: 'usr-access-roland',
    email: 'rolandabj@gmail.com',
    name: 'Dr. Roland / Clinical Director',
    status: 'APPROVED',
    appRole: 'EDITOR',
    isManager: true,
    approvedBy: 'rolandabj@gmail.com',
    approvedAt: '2026-09-20T08:00:00Z',
    createdAt: '2026-09-20T08:00:00Z',
  },
];

export const SEED_AVAILABILITY_REQUESTS: AvailabilityRequest[] = [];

// 2025-2026 Dedicated Time Periods & Standard Full-Time Working Hours (exact cycles from clinic roster policy)
export const SEED_WORKING_HOURS_PERIODS: WorkingHoursPeriod[] = [
  {
    id: 'whp-2025-2026-dec19-jan18',
    year: '2025-2026',
    name: 'Dec19-Jan18',
    startDate: '2025-12-19',
    endDate: '2026-01-18',
    workingHours: 210,
    note: 'December 19 to January 18 cycle (210 hours full-time target)',
    createdAt: '2025-12-01T00:00:00Z',
    updatedAt: '2025-12-01T00:00:00Z',
  },
  {
    id: 'whp-2026-jan19-feb18',
    year: '2026',
    name: 'Jan19-Feb18',
    startDate: '2026-01-19',
    endDate: '2026-02-18',
    workingHours: 227,
    note: 'January 19 to February 18 cycle (227 hours full-time target)',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'whp-2026-feb19-mar18',
    year: '2026',
    name: 'Feb19-Mar18',
    startDate: '2026-02-19',
    endDate: '2026-03-18',
    workingHours: 145,
    note: 'February 19 to March 18 cycle (145 hours full-time target)',
    createdAt: '2026-02-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'whp-2026-mar19-apr18',
    year: '2026',
    name: 'Mar19-Apr18',
    startDate: '2026-03-19',
    endDate: '2026-04-18',
    workingHours: 207,
    note: 'March 19 to April 18 cycle (207 hours full-time target)',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  },
  {
    id: 'whp-2026-apr19-may18',
    year: '2026',
    name: 'Apr19-May18',
    startDate: '2026-04-19',
    endDate: '2026-05-18',
    workingHours: 220,
    note: 'April 19 to May 18 cycle (220 hours full-time target)',
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  },
  {
    id: 'whp-2026-may19-jun18',
    year: '2026',
    name: 'May19-Jun18',
    startDate: '2026-05-19',
    endDate: '2026-06-18',
    workingHours: 230,
    note: 'May 19 to June 18 cycle (230 hours full-time target)',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'whp-2026-jun19-jul18',
    year: '2026',
    name: 'Jun19-Jul18',
    startDate: '2026-06-19',
    endDate: '2026-07-18',
    workingHours: 200,
    note: 'June 19 to July 18 cycle (200 hours full-time target)',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
  },
  {
    id: 'whp-2026-jul19-aug18',
    year: '2026',
    name: 'Jul19-Aug18',
    startDate: '2026-07-19',
    endDate: '2026-08-18',
    workingHours: 230,
    note: 'July 19 to August 18 cycle (230 hours full-time target)',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  },
  {
    id: 'whp-2026-aug19-sep18',
    year: '2026',
    name: 'Aug19-Sep18',
    startDate: '2026-08-19',
    endDate: '2026-09-18',
    workingHours: 220,
    note: 'August 19 to September 18 cycle (220 hours full-time target)',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
  },
  {
    id: 'whp-2026-sep19-oct18',
    year: '2026',
    name: 'Sep19-Oct18',
    startDate: '2026-09-19',
    endDate: '2026-10-18',
    workingHours: 210,
    note: 'September 19 to October 18 cycle (210 hours full-time target)',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'whp-2026-oct19-nov18',
    year: '2026',
    name: 'Oct19-Nov18',
    startDate: '2026-10-19',
    endDate: '2026-11-18',
    workingHours: 230,
    note: 'October 19 to November 18 cycle (230 hours full-time target)',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'whp-2026-nov19-dec18',
    year: '2026',
    name: 'Nov19-Dec18',
    startDate: '2026-11-19',
    endDate: '2026-12-18',
    workingHours: 210,
    note: 'November 19 to December 18 cycle (210 hours full-time target)',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  },
];
