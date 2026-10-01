/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * CreateScheduleModal — Interactive Schedule Date Range & Configuration Modal
 * Allows clinical administrators to choose start & end dates, block divisions,
 * contract hours targets, and immediate generation options.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calendar,
  CalendarRange,
  Clock,
  Sparkles,
  Info,
  AlertTriangle,
  CheckCircle2,
  Layers,
  ArrowRight,
  RefreshCw,
  PlusCircle,
  Stethoscope,
} from 'lucide-react';
import { Schedule, BlockWeeks, WorkingHoursPeriod, Doctor } from '../../types';
import { getRepository } from '../../services/repository';
import {
  calculateWorkingHoursForDateRange,
  WorkingHoursCalculationResult,
} from '../../services/periods/workingHoursPeriodService';
import {
  generateDoctorSessionsForDateRange,
  populateRecurringDoctorSessionsForSchedule,
} from '../../services/schedule/doctorScheduleService';

interface CreateScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduleCreated: (createdSchedule: Schedule, generateImmediately: boolean) => void;
  clinicName?: string;
  existingSchedules?: Schedule[];
}

export const CreateScheduleModal: React.FC<CreateScheduleModalProps> = ({
  isOpen,
  onClose,
  onScheduleCreated,
  clinicName = (typeof window !== 'undefined' ? localStorage.getItem('clinic_roster_clinic_name') : null) || 'American Hospital Nad Al Sheba OutPatient clinic',
  existingSchedules = [],
}) => {
  // Current date reference for smart defaults (defaulting to next month from seed Oct 2026 -> Nov 2026)
  const defaultStartDate = '2026-11-01';
  const defaultEndDate = '2026-11-30';

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [scheduleName, setScheduleName] = useState(() => `November 2026 — ${clinicName}`);
  const [isNameManuallyEdited, setIsNameManuallyEdited] = useState(false);
  const [blockWeeks, setBlockWeeks] = useState<BlockWeeks>(2);
  const [hoursTarget, setHoursTarget] = useState<string | number>('');
  const [generateImmediately, setGenerateImmediately] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dedicated Roster Periods
  const [workingHoursPeriods, setWorkingHoursPeriods] = useState<WorkingHoursPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');

  // Active Doctors & Recurring Schedule Auto-Fill
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [autoFillDoctorSchedules, setAutoFillDoctorSchedules] = useState<boolean>(true);

  useEffect(() => {
    const repo = getRepository();
    repo.list('workingHoursPeriods').then((list) => {
      const sorted = [...list].sort((a, b) => a.startDate.localeCompare(b.startDate));
      setWorkingHoursPeriods(sorted);
    }).catch((err) => {
      console.error('Failed to load working hours periods:', err);
    });

    repo.list('doctors').then((docList) => {
      setDoctors(docList);
    }).catch((err) => {
      console.error('Failed to load doctors in CreateScheduleModal:', err);
    });
  }, []);

  // Compute duration metrics
  const getDurationMetrics = (startStr: string, endStr: string, blocks: number) => {
    if (!startStr || !endStr) {
      return { totalDays: 0, weeks: 0, numBlocks: 0, isValid: false, suggestedHours: 160 };
    }
    const start = new Date(startStr + 'T00:00:00Z');
    const end = new Date(endStr + 'T00:00:00Z');

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { totalDays: 0, weeks: 0, numBlocks: 0, isValid: false, suggestedHours: 160 };
    }

    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) {
      return { totalDays: 0, weeks: 0, numBlocks: 0, isValid: false, suggestedHours: 160 };
    }

    const totalDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
    const weeks = parseFloat((totalDays / 7).toFixed(1));
    const blockSizeDays = blocks * 7;
    const numBlocks = Math.ceil(totalDays / blockSizeDays);

    // Standard clinical outpatient target: ~40h/week (8h/day x 5 working days per 7 calendar days)
    const suggestedHours = Math.max(24, Math.round((totalDays * 8 * 5) / 7));

    return {
      totalDays,
      weeks,
      numBlocks,
      isValid: true,
      suggestedHours,
      startFormatted: start.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      endFormatted: end.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    };
  };

  const metrics = getDurationMetrics(startDate, endDate, blockWeeks);

  // Real-time calculation triggers calculateWorkingHoursForDateRange
  const periodCalculation: WorkingHoursCalculationResult | null = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return null;
    return calculateWorkingHoursForDateRange(startDate, endDate, workingHoursPeriods);
  }, [startDate, endDate, workingHoursPeriods]);

  // Live estimate of recurring doctor sessions across the chosen date span
  const estimatedDoctorSessionsCount: number = useMemo(() => {
    if (!metrics.isValid || !startDate || !endDate || doctors.length === 0) return 0;
    return generateDoctorSessionsForDateRange(startDate, endDate, doctors).length;
  }, [metrics.isValid, startDate, endDate, doctors]);

  // Helper to construct automatic schedule name
  const generateSuggestedName = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return `Schedule — ${clinicName.split(' ')[0]}`;
    const start = new Date(startStr + 'T00:00:00Z');
    const end = new Date(endStr + 'T00:00:00Z');
    if (start > end || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return `Schedule — ${clinicName.split(' ')[0]}`;
    }

    const startMonth = start.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
    const startYear = start.getUTCFullYear();
    const endYear = end.getUTCFullYear();
    const startDay = start.getUTCDate();

    // Check if it's a full calendar month (e.g., 1st to end of month)
    const nextMonthFirst = new Date(Date.UTC(startYear, start.getUTCMonth() + 1, 1));
    const lastDayOfMonth = new Date(nextMonthFirst.getTime() - 86400000).getUTCDate();

    const shortClinic = clinicName.replace(' Outpatient Clinic', '').replace(' Clinic', '');

    if (startDay === 1 && end.getUTCDate() === lastDayOfMonth && startMonth === endMonth) {
      return `${startMonth} ${startYear} — ${shortClinic}`;
    }

    if (startMonth === endMonth && startYear === endYear) {
      return `${startMonth} ${startDay}–${end.getUTCDate()}, ${startYear} — ${shortClinic}`;
    }

    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}, ${endYear} — ${shortClinic}`;
  };

  // Sync schedule name and suggested/prorated hours when dates change
  useEffect(() => {
    if (metrics.isValid) {
      if (!isNameManuallyEdited) {
        setScheduleName(generateSuggestedName(startDate, endDate));
      }
      if (periodCalculation) {
        setHoursTarget(periodCalculation.targetHours);
        if (periodCalculation.isExactMatch && periodCalculation.matchedPeriod) {
          setSelectedPeriodId(periodCalculation.matchedPeriod.id);
        } else {
          setSelectedPeriodId('');
        }
      } else {
        setHoursTarget(metrics.suggestedHours);
      }
    }
  }, [startDate, endDate, periodCalculation?.targetHours]);

  // Apply Quick Dedicated Period Preset
  const handleSelectDedicatedPeriodPreset = (periodId: string) => {
    setSelectedPeriodId(periodId);
    if (!periodId) return;
    const p = workingHoursPeriods.find((item) => item.id === periodId);
    if (!p) return;
    setStartDate(p.startDate);
    setEndDate(p.endDate);
    setHoursTarget(p.workingHours);
    setIsNameManuallyEdited(false);
    const shortClinic = clinicName.replace(' Outpatient Clinic', '').replace(' Clinic', '');
    setScheduleName(`${p.year} ${p.name} — ${shortClinic}`);
  };

  // Check for date range overlap with existing schedules
  const overlappingSchedule = existingSchedules.find((s) => {
    return (
      (startDate >= s.startDate && startDate <= s.endDate) ||
      (endDate >= s.startDate && endDate <= s.endDate) ||
      (startDate <= s.startDate && endDate >= s.endDate)
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!startDate || !endDate) {
      setErrorMessage('Please select both a Start Date and an End Date.');
      return;
    }

    if (startDate > endDate) {
      setErrorMessage('The Start Date cannot be after the End Date.');
      return;
    }

    if (!scheduleName.trim()) {
      setErrorMessage('Please provide a name for this schedule.');
      return;
    }

    if (metrics.totalDays < 3) {
      setErrorMessage('A schedule must span at least 3 days.');
      return;
    }

    const parsedTargetHours = parseFloat(String(hoursTarget).trim());
    if (isNaN(parsedTargetHours) || parsedTargetHours < 0) {
      setErrorMessage('Please enter a valid target hours value (e.g. 160, 176, 227).');
      return;
    }

    setIsSubmitting(true);

    try {
      const repo = getRepository();

      const newSchedule = await repo.create('schedules', {
        name: scheduleName.trim(),
        startDate,
        endDate,
        blockWeeks,
        hoursTargetFullTime: Math.round(parsedTargetHours),
        workingHoursPeriodId: periodCalculation?.isExactMatch ? periodCalculation.matchedPeriod?.id : undefined,
        periodName: periodCalculation?.isExactMatch
          ? periodCalculation.matchedPeriod?.name
          : periodCalculation?.isProrated
          ? `${metrics.totalDays}d Prorated · ${Math.round(parsedTargetHours)}h`
          : undefined,
        status: 'DRAFT',
        activeVersionNumber: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Initialize checkpoint v1
      await repo.create('versions', {
        scheduleId: newSchedule.id,
        number: 1,
        timestamp: new Date().toISOString(),
        author: 'Clinical Administrator',
        note: `Initial schedule creation (${startDate} to ${endDate})`,
        snapshot: {
          schedule: newSchedule,
          assignments: [],
          leaveEntries: [],
          locks: [],
          rulesSnapshot: [],
        },
        isPublished: false,
      });

      // Auto-fill recurring doctor clinic sessions for schedule duration
      let populatedDoctorSessionsCount = 0;
      if (autoFillDoctorSchedules && doctors.length > 0) {
        try {
          const docFillResult = await populateRecurringDoctorSessionsForSchedule({
            repo,
            startDate,
            endDate,
            doctors,
          });
          populatedDoctorSessionsCount = docFillResult.createdCount;
        } catch (docErr) {
          console.error('Failed to auto-populate doctor sessions:', docErr);
        }
      }

      // Log audit trail
      await repo.create('audit', {
        actor: 'Clinical Administrator',
        action: 'CREATE',
        entity: 'Schedule',
        entityId: newSchedule.id,
        note: `Created schedule "${newSchedule.name}" covering ${startDate} to ${endDate} (${metrics.totalDays} days, ${blockWeeks}w blocks, ${parsedTargetHours}h target${
          autoFillDoctorSchedules
            ? `, ${populatedDoctorSessionsCount} recurring doctor sessions auto-populated`
            : ', doctor auto-fill disabled'
        }).`,
        timestamp: new Date().toISOString(),
      });

      onScheduleCreated(newSchedule, generateImmediately);
      onClose();
    } catch (err: any) {
      setErrorMessage(`Failed to create schedule: ${err.message || 'Unknown database error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden text-xs flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-600 text-white shadow-xs">
              <CalendarRange className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Create New Schedule Period</h3>
              <p className="text-[11px] text-slate-500">
                Choose start and end dates, block partitioning, and nurse work hour targets.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-xs flex items-center gap-2 animate-in fade-in duration-150">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-semibold">{errorMessage}</span>
            </div>
          )}

          {/* Quick Dedicated Period Preset Selector */}
          <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="dedicated-period-select" className="flex items-center gap-1.5 text-indigo-950 font-bold text-xs">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>Quick Dedicated Period Preset:</span>
              </label>
              <span className="text-[10px] text-indigo-600 font-medium">Auto-populates dates &amp; FT contract hours</span>
            </div>

            <select
              id="dedicated-period-select"
              value={selectedPeriodId}
              onChange={(e) => handleSelectDedicatedPeriodPreset(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
            >
              <option value="">Select Dedicated Period (e.g. 2026 Jan19-Feb18 [227h])...</option>
              {workingHoursPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.year} {p.name} ({p.startDate} → {p.endDate}) · {p.workingHours}h FT Target
                </option>
              ))}
            </select>
          </div>

          {/* Primary Date Selectors: Start Date & End Date */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center gap-1.5 text-indigo-900 font-bold text-xs">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Choose Start and End Date:</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Start Date <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer shadow-2xs"
                  />
                </div>
                {metrics.isValid && metrics.startFormatted && (
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    {metrics.startFormatted}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  End Date <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    min={startDate}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer shadow-2xs"
                  />
                </div>
                {metrics.isValid && metrics.endFormatted && (
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    {metrics.endFormatted}
                  </span>
                )}
              </div>
            </div>

            {/* Informative Dedicated Period / Prorating Banner */}
            {periodCalculation && metrics.isValid && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                  periodCalculation.isExactMatch
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-indigo-50 border-indigo-200 text-indigo-950'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2
                    className={`w-4 h-4 shrink-0 ${
                      periodCalculation.isExactMatch ? 'text-emerald-600' : 'text-indigo-600'
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="font-bold block truncate">
                      {periodCalculation.isExactMatch ? (
                        <>✓ Dedicated Period: {periodCalculation.matchedPeriod?.name} ({periodCalculation.targetHours}h full-time contracted target)</>
                      ) : (
                        <>✓ Prorated from {periodCalculation.description}</>
                      )}
                    </span>
                    <span className="text-[11px] text-slate-600 block mt-0.5">
                      {periodCalculation.isExactMatch
                        ? `${periodCalculation.totalScheduleDays} calendar days matching full dedicated roster cycle`
                        : `${periodCalculation.totalScheduleDays} days = ${periodCalculation.targetHours} working hours`}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-white border border-slate-200 shadow-2xs">
                    {periodCalculation.targetHours}h FT
                  </span>
                  {periodCalculation.isProrated && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded">
                      Prorated
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Live Duration Readout & Calculated Metrics Card */}
            {metrics.isValid ? (
              <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 px-2 py-0.5 bg-white border border-slate-200 rounded font-mono">
                    {metrics.totalDays} Days
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="font-semibold text-slate-700">
                    {metrics.weeks} Weeks
                  </span>
                  <span className="text-slate-500">→</span>
                  <span className="font-semibold text-indigo-700">
                    {metrics.numBlocks} Block{metrics.numBlocks === 1 ? '' : 's'} ({blockWeeks}w each)
                  </span>
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-200 text-rose-600 font-semibold text-[11px] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Invalid period: End Date must be after or equal to Start Date.</span>
              </div>
            )}

            {/* Overlap notice */}
            {overlappingSchedule && (
              <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-900 text-[10px] flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Note: Dates overlap with existing schedule{' '}
                  <strong>"{overlappingSchedule.name}"</strong> ({overlappingSchedule.startDate} to {overlappingSchedule.endDate}). You can still create this roster (e.g. for alternate scenarios or draft versions).
                </span>
              </div>
            )}
          </div>

          {/* Schedule Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-slate-700 font-semibold">
                Schedule Title / Label <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setIsNameManuallyEdited(false);
                  setScheduleName(generateSuggestedName(startDate, endDate));
                }}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline flex items-center gap-1"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Reset to standard naming</span>
              </button>
            </div>
            <input
              type="text"
              required
              value={scheduleName}
              onChange={(e) => {
                setScheduleName(e.target.value);
                setIsNameManuallyEdited(true);
              }}
              placeholder={`e.g. November 2026 — ${clinicName}`}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs"
            />
          </div>

          {/* Grid Settings: Block Weeks & Contract Hours */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Block Partition (Workbook Paging)
              </label>
              <select
                value={blockWeeks}
                onChange={(e) => setBlockWeeks(Number(e.target.value) as BlockWeeks)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
              >
                <option value={1}>1 Week (7 Days / Block)</option>
                <option value={2}>2 Weeks (14 Days / Block) — Recommended</option>
                <option value={3}>3 Weeks (21 Days / Block)</option>
                <option value={4}>4 Weeks (28 Days / Block)</option>
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Splits dense roster view into comfortable paging tabs.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-700 font-semibold">
                  Full-Time Target Hours (100% Staff)
                </label>
                <span className="text-[10px] text-slate-400 font-medium">Any value accepted</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={hoursTarget}
                  onChange={(e) => setHoursTarget(e.target.value)}
                  placeholder="e.g. 160, 176, 37.5, 80"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs transition-colors"
                />
                <span className="font-mono text-slate-500 shrink-0 font-medium">hrs</span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                <span>
                  {String(hoursTarget).trim() !== '' && !isNaN(parseFloat(String(hoursTarget)))
                    ? `Part-time staff (50%) target: ${(parseFloat(String(hoursTarget)) * 0.5).toFixed(1).replace(/\.0$/, '')}h`
                    : 'Enter custom contract hours target'}
                </span>
              </div>
            </div>
          </div>

          {/* Recurring Doctor Schedules Auto-Fill Option */}
          <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoFillDoctorSchedules}
                  onChange={(e) => setAutoFillDoctorSchedules(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                  <Stethoscope className="w-4 h-4 text-emerald-600" />
                  <span>Auto-fill Recurring Doctor Schedules</span>
                </div>
              </label>

              {autoFillDoctorSchedules && metrics.isValid && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold border border-emerald-300">
                  ~{estimatedDoctorSessionsCount} sessions
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-600 pl-6 leading-relaxed">
              Automatically populates all active physicians' weekly clinic patterns for the entire schedule period ({metrics.totalDays > 0 ? `${metrics.totalDays} days` : 'range'}) so doctor clinic demand and nurse coverage assignments are pre-filled.
            </p>
          </div>

          {/* Generator Execution Strategy */}
          <div className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-xl space-y-2">
            <span className="text-slate-800 font-semibold text-xs block">
              Initial Roster State:
            </span>
            <div className="space-y-1.5">
              <label className="flex items-start gap-2.5 p-2 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 cursor-pointer transition-colors shadow-2xs">
                <input
                  type="radio"
                  name="generation_mode"
                  checked={generateImmediately}
                  onChange={() => setGenerateImmediately(true)}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Run Deterministic Scheduling Engine</span>
                    <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.2 rounded">
                      RECOMMENDED
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                    Automatically fills shifts according to doctor sessions, clinical phlebotomy quotas, hard rest rules, and seniority balance.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 cursor-pointer transition-colors shadow-2xs">
                <input
                  type="radio"
                  name="generation_mode"
                  checked={!generateImmediately}
                  onChange={() => setGenerateImmediately(false)}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <div className="font-bold text-slate-900">
                    Create Blank Schedule
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                    Initialize an empty roster matrix for manual shift placement or applying a saved template.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !metrics.isValid}
              className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating Schedule...</span>
                </>
              ) : generateImmediately ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Create &amp; Generate Roster</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Create Blank Schedule</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
