import React, { useState, useEffect } from 'react';
import {
  CalendarRange,
  Users,
  Stethoscope,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Building2,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { AppRoute, ClinicContextState } from '../../types/navigation';
import { repositoryManager } from '../../services/repository';

interface DashboardViewProps {
  context: ClinicContextState;
  onNavigate: (route: AppRoute) => void;
  onOpenAcceptance?: () => void;
  onOpenCreateSchedule?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  context,
  onNavigate,
  onOpenAcceptance,
  onOpenCreateSchedule,
}) => {
  const [counts, setCounts] = useState<{
    nurses: number;
    doctors: number;
    schedules: number;
    roles: number;
    isLoaded: boolean;
  }>({ nurses: 0, doctors: 0, schedules: 0, roles: 0, isLoaded: false });

  useEffect(() => {
    let isMounted = true;
    async function loadCounts() {
      try {
        const repo = repositoryManager.getRepo();
        const [n, d, s, r] = await Promise.all([
          repo.list('nurses'),
          repo.list('doctors'),
          repo.list('schedules'),
          repo.list('clinicalRoles'),
        ]);
        if (isMounted) {
          setCounts({
            nurses: n.length,
            doctors: d.length,
            schedules: s.length,
            roles: r.length,
            isLoaded: true,
          });
        }
      } catch {
        if (isMounted) {
          setCounts((prev) => ({ ...prev, isLoaded: true }));
        }
      }
    }
    loadCounts();

    const handleDataChange = () => loadCounts();
    window.addEventListener('clinic-roster-cleared', handleDataChange);
    window.addEventListener('clinic-roster-reseeded', handleDataChange);
    return () => {
      isMounted = false;
      window.removeEventListener('clinic-roster-cleared', handleDataChange);
      window.removeEventListener('clinic-roster-reseeded', handleDataChange);
    };
  }, []);

  const isDatabaseEmpty = counts.isLoaded && counts.schedules === 0 && counts.nurses === 0 && counts.doctors === 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Clinic Roster Overview</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Active clinic shift planning for {context.clinicName} ({context.timezone})
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenAcceptance && (
            <button
              onClick={onOpenAcceptance}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Acceptance Verification</span>
            </button>
          )}
          <button
            onClick={onOpenCreateSchedule || (() => onNavigate('schedules'))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold transition-colors shadow-xs cursor-pointer"
            title="Create a new schedule with custom date range"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Schedule</span>
          </button>
          <button
            onClick={() => onNavigate('schedules')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium transition-colors cursor-pointer"
          >
            <CalendarRange className="w-3.5 h-3.5 text-indigo-600" />
            <span>Open Schedule Workbook</span>
          </button>
        </div>
      </div>

      {/* Empty Database / Clean State Onboarding Banner */}
      {isDatabaseEmpty ? (
        <div className="rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-white to-slate-50 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-600 text-white shrink-0 mt-0.5 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Clinic Roster — Production Environment
              </h2>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                Welcome to Clinic Roster. Configure your clinical staff, register physicians, and create custom schedule periods to get started.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigate('nurses')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>Add Nurses</span>
            </button>
            <button
              onClick={onOpenCreateSchedule || (() => onNavigate('schedules'))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Schedule</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Primary Status Card */}
      <div className="bg-white border border-slate-200 rounded p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
              <span>Current Working Schedule</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                counts.schedules > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-slate-600 bg-slate-100'
              }`}>
                {counts.schedules > 0 ? 'Active' : 'Empty'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">{context.activeScheduleName || 'No Active Schedule'}</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1 font-mono text-slate-700">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {context.activeSchedulePeriod || 'No Period Configured'}
              </span>
              <span>·</span>
              <span>Roster target per full-time nurse</span>
              <span>·</span>
              <span>2-week block views</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenCreateSchedule || (() => onNavigate('schedules'))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded text-xs font-semibold transition-colors cursor-pointer"
              title="Create a new schedule period"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Period</span>
            </button>
            <button
              onClick={() => onNavigate('schedules')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 rounded text-xs font-medium transition-colors cursor-pointer"
            >
              <span>View Roster Grid</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Dynamic Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-100">
          <div className="space-y-1">
            <span className="text-xs text-slate-500">Active Nurses</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-slate-900">{counts.nurses}</span>
              <span className="text-[11px] text-slate-500">staff members</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {counts.nurses > 0 ? 'Registered in staff directory' : 'Directory is empty'}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-slate-500">Doctor Sessions</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-slate-900">{counts.doctors}</span>
              <span className="text-[11px] text-slate-500">clinic doctors</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {counts.doctors > 0 ? 'Configured recurring patterns' : 'No physicians registered'}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-slate-500">Clinical Roles</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-slate-900">{counts.roles}</span>
              <span className="text-[11px] text-slate-500">active roles</span>
            </div>
            <p className="text-[11px] text-slate-400">Blood Collection &amp; Nurse Clinics</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-slate-500">Active Warnings</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold font-mono text-amber-600">
                {context.warningCount}
              </span>
              <span className="text-[11px] text-amber-700">notices</span>
            </div>
            <p className="text-[11px] text-slate-400">Evening coverage &amp; rest rules</p>
          </div>
        </div>
      </div>

      {/* Navigation Quick Access Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigate('availability')}
          className="bg-white border border-slate-200 hover:border-indigo-300 rounded p-4 transition-colors cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded bg-indigo-50 text-indigo-700">
              <CalendarRange className="w-4 h-4" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
            Availability &amp; Locks
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Manage leave entries (Annual, Sick, Birthday, Public Holidays) and pinned non-changeable locks.
          </p>
        </div>

        <div
          onClick={() => onNavigate('nurses')}
          className="bg-white border border-slate-200 hover:border-indigo-300 rounded p-4 transition-colors cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded bg-indigo-50 text-indigo-700">
              <Users className="w-4 h-4" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
            Nurse Staff &amp; Preferences
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Configure senior status, contract percentages, phlebotomy capabilities, and doctor pairing rankings.
          </p>
        </div>

        <div
          onClick={() => onNavigate('doctors')}
          className="bg-white border border-slate-200 hover:border-indigo-300 rounded p-4 transition-colors cursor-pointer group shadow-2xs"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 rounded bg-indigo-50 text-indigo-700">
              <Stethoscope className="w-4 h-4" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
            Doctors' Clinic Schedule
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Weekly session patterns and ad-hoc doctor room bookings for shift nurse demand matching.
          </p>
        </div>
      </div>

      {/* Rules & Architecture Principles */}
      <div className="bg-slate-100/70 border border-slate-200 rounded p-4">
        <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider font-mono mb-2">
          Clinical Scheduling Engine Rules
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-600">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Hard Rule H1:</strong> At least one senior nurse on every duty window with active assignments.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Hard Rule H2 &amp; H3:</strong> Max 6 consecutive working days, minimum 11h rest between shifts.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Soft Rule S1:</strong> No more than 3 consecutive late duties ending at 21:00.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span><strong>Deterministic Engine:</strong> Pinned locks and approved leave are never overwritten by generator.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
