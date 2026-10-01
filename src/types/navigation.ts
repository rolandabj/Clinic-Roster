import { UserRole } from './index';

export type AppRoute =
  | 'dashboard'
  | 'schedules'
  | 'availability'
  | 'nurses'
  | 'doctors'
  | 'history'
  | 'publish'
  | 'reports'
  | 'audit'
  | 'settings'
  | 'published';

export interface NavItem {
  id: AppRoute;
  label: string;
  iconName: string;
  badge?: number | string;
}

export interface ClinicContextState {
  clinicName: string;
  timezone: string;
  activeScheduleName: string;
  activeSchedulePeriod: string;
  activeScheduleId: string | null;
  warningCount: number;
  isLocalMode: boolean;
  currentUser: {
    name: string;
    email: string;
    role: UserRole;
    isLocal: boolean;
  } | null;
}
