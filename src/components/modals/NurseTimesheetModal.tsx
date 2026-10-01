/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Individual Nurse Timesheet & Hours Audit Modal (Phase 9)
 */

import React, { useState } from 'react';
import {
  X,
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Download,
  Lock,
  User,
  Shield,
  Briefcase,
  FileSpreadsheet,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { NurseHoursAccounting } from '../../services/reports/hoursAccounting';
import { Schedule } from '../../types';
import { formatDate } from '../../utils/dateUtils';

interface NurseTimesheetModalProps {
  schedule: Schedule;
  accounting: NurseHoursAccounting | null;
  isOpen: boolean;
  onClose: () => void;
}

export const NurseTimesheetModal: React.FC<NurseTimesheetModalProps> = ({
  schedule,
  accounting,
  isOpen,
  onClose,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'DUTY' | 'LEAVE' | 'WEEKEND'>('ALL');

  if (!isOpen || !accounting) return null;

  const {
    nurse,
    seniority,
    contractPercent,
    targetHours,
    dutyHours,
    leaveHours,
    totalEarnedHours,
    varianceHours,
    pacePercent,
    status,
    totalShiftsCount,
    weekendShiftsCount,
    lateDutiesCount,
    timeline,
    leaveBreakdown,
    quotas,
  } = accounting;

  const filteredTimeline = timeline.filter((entry) => {
    if (filterType === 'DUTY') return entry.type === 'DUTY';
    if (filterType === 'LEAVE') return entry.type === 'LEAVE';
    if (filterType === 'WEEKEND') return entry.isWeekend && entry.type === 'DUTY';
    return true;
  });

  // Export single nurse CSV
  const handleExportNurseCsv = () => {
    const headers = [
      'Date',
      'Day of Week',
      'Is Weekend',
      'Entry Type',
      'Duty Window',
      'Duty Hours',
      'Assigned Doctor / Role',
      'Leave Type',
      'Hours Credited',
      'Source',
      'Notes',
    ];

    const lines = [headers.join(',')];
    timeline.forEach((item) => {
      const doctorOrRole = item.doctor
        ? `"${item.doctor.fullName}"`
        : item.clinicalRole
        ? `"${item.clinicalRole.name}"`
        : item.specialty
        ? `"${item.specialty.name} Pool"`
        : '""';

      lines.push(
        [
          formatDate(item.date),
          item.weekdayName,
          item.isWeekend ? 'YES' : 'NO',
          item.type,
          item.dutyWindow ? `"${item.dutyWindow.name} (${item.dutyWindow.acronym})"` : '""',
          item.dutyWindow ? item.hoursEarned : 0,
          doctorOrRole,
          item.leaveType ? `"${item.leaveType.name} (${item.leaveType.acronym})"` : '""',
          item.hoursEarned,
          `"${item.source || ''}"`,
          `"${item.notes || ''}"`,
        ].join(',')
      );
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `timesheet-${nurse.employeeCode}-${schedule.name}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isUnder = status === 'UNDER' || status === 'CRITICAL_UNDER';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
              {nurse.fullName
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{nurse.fullName}</h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                  {nurse.employeeCode}
                </span>
                {seniority && (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: `${seniority.color}18`,
                      color: seniority.color,
                    }}
                  >
                    {seniority.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-sans">
                {nurse.gmail} · {contractPercent}% Contract Proportion ({targetHours}h contracted in {schedule.name})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportNurseCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-100 rounded text-xs font-medium text-slate-700 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export Timesheet</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Top KPI Cards */}
        <div className="p-6 bg-slate-50/50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-6 gap-3">
          <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-medium text-slate-500 block">Contract Target</span>
            <span className="text-lg font-bold font-mono text-slate-900 mt-0.5 block">
              {targetHours}h
            </span>
            <span className="text-[10px] text-slate-400 font-mono block">
              {contractPercent}% FTE
            </span>
          </div>

          <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-medium text-slate-500 block">Clinical Duties</span>
            <span className="text-lg font-bold font-mono text-indigo-600 mt-0.5 block">
              {dutyHours}h
            </span>
            <span className="text-[10px] text-slate-400 font-mono block">
              {totalShiftsCount} shifts
            </span>
          </div>

          <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-medium text-slate-500 block">Credited Leave</span>
            <span className="text-lg font-bold font-mono text-amber-600 mt-0.5 block">
              {leaveHours}h
            </span>
            <span className="text-[10px] text-slate-400 font-mono block">
              {Object.keys(leaveBreakdown).length} leave types
            </span>
          </div>

          <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-medium text-slate-500 block">Total Earned</span>
            <span className="text-lg font-bold font-mono text-slate-900 mt-0.5 block">
              {totalEarnedHours}h
            </span>
            <span className="text-[10px] text-slate-400 font-mono block">
              Duty + Leave
            </span>
          </div>

          <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-medium text-slate-500 block">Net Variance</span>
            <span
              className={`text-lg font-bold font-mono mt-0.5 block ${
                varianceHours > 0
                  ? 'text-emerald-600'
                  : varianceHours < 0
                  ? 'text-rose-600'
                  : 'text-slate-600'
              }`}
            >
              {varianceHours > 0 ? `+${varianceHours}h` : `${varianceHours}h`}
            </span>
            <span className="text-[10px] text-slate-400 font-mono block">
              {varianceHours > 0 ? 'Overtime' : varianceHours < 0 ? 'Deficit' : 'Balanced'}
            </span>
          </div>

          <div className="bg-white p-3 rounded border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-medium text-slate-500 block">Pace &amp; Status</span>
            <span className="text-lg font-bold font-mono text-slate-900 mt-0.5 block">
              {pacePercent}%
            </span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.2 rounded inline-block ${
                status === 'OPTIMAL'
                  ? 'bg-emerald-50 text-emerald-700'
                  : isUnder
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-indigo-50 text-indigo-700'
              }`}
            >
              {status}
            </span>
          </div>
        </div>

        {/* Additional Equity Context Badges */}
        <div className="px-6 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-slate-600">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Weekend Duties: <strong className="font-mono text-slate-800">{weekendShiftsCount}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>Late Shifts (21:00 finish): <strong className="font-mono text-slate-800">{lateDutiesCount}</strong></span>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded text-[11px]">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                filterType === 'ALL'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Days ({timeline.length})
            </button>
            <button
              onClick={() => setFilterType('DUTY')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                filterType === 'DUTY'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Duties Only ({totalShiftsCount})
            </button>
            <button
              onClick={() => setFilterType('LEAVE')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                filterType === 'LEAVE'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Leaves Only
            </button>
            <button
              onClick={() => setFilterType('WEEKEND')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                filterType === 'WEEKEND'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Weekends ({weekendShiftsCount})
            </button>
          </div>
        </div>

        {/* Scrollable Timeline Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs text-left">
            <thead className="sticky top-0 bg-slate-100 text-slate-600 font-mono text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-2 px-4">Date</th>
                <th className="py-2 px-3">Day</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3">Duty / Leave Window</th>
                <th className="py-2 px-3">Assigned Clinical Context</th>
                <th className="py-2 px-3">Hours</th>
                <th className="py-2 px-3">Source</th>
                <th className="py-2 px-4 text-right">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredTimeline.map((item) => {
                const isDuty = item.type === 'DUTY';
                const isLeave = item.type === 'LEAVE';

                return (
                  <tr
                    key={item.date}
                    className={`hover:bg-slate-50 ${
                      item.isWeekend ? 'bg-slate-50/40' : ''
                    }`}
                  >
                    <td className="py-2 px-4 font-semibold text-slate-900">
                      {formatDate(item.date)}
                    </td>

                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          item.isWeekend
                            ? 'bg-amber-100 text-amber-800'
                            : 'text-slate-600'
                        }`}
                      >
                        {item.weekdayName}
                      </span>
                    </td>

                    <td className="py-2 px-3">
                      {isDuty && (
                        <span className="inline-flex items-center gap-1 text-indigo-700 font-bold text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded">
                          DUTY
                        </span>
                      )}
                      {isLeave && (
                        <span className="inline-flex items-center gap-1 text-amber-800 font-bold text-[10px] bg-amber-50 px-1.5 py-0.5 rounded">
                          LEAVE
                        </span>
                      )}
                      {!isDuty && !isLeave && (
                        <span className="text-slate-400 text-[10px]">REST / OFF</span>
                      )}
                    </td>

                    <td className="py-2 px-3">
                      {item.dutyWindow && (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-5 h-5 rounded flex items-center justify-center text-white font-bold text-[10px] shrink-0"
                            style={{ backgroundColor: item.dutyWindow.color }}
                          >
                            {item.dutyWindow.acronym}
                          </span>
                          <span className="text-slate-800 font-medium">
                            {item.dutyWindow.name} ({item.dutyWindow.startTime}–{item.dutyWindow.endTime})
                          </span>
                        </div>
                      )}
                      {item.leaveType && (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-5 h-5 rounded flex items-center justify-center text-white font-bold text-[10px] shrink-0"
                            style={{ backgroundColor: item.leaveType.color }}
                          >
                            {item.leaveType.acronym}
                          </span>
                          <span className="text-slate-800 font-medium">
                            {item.leaveType.name}
                          </span>
                        </div>
                      )}
                      {!item.dutyWindow && !item.leaveType && (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-2 px-3">
                      {item.doctor && (
                        <span className="text-slate-900 font-sans font-medium">
                          {item.doctor.fullName}
                        </span>
                      )}
                      {item.clinicalRole && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold">
                          🩸 {item.clinicalRole.name}
                        </span>
                      )}
                      {item.specialty && (
                        <span className="text-slate-600 font-sans text-[11px]">
                          {item.specialty.name} Pool
                        </span>
                      )}
                      {!item.doctor && !item.clinicalRole && !item.specialty && (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-2 px-3 font-bold">
                      {item.hoursEarned > 0 ? (
                        <span
                          className={
                            isDuty ? 'text-indigo-600' : 'text-amber-600'
                          }
                        >
                          +{item.hoursEarned}h
                        </span>
                      ) : (
                        <span className="text-slate-300">0h</span>
                      )}
                    </td>

                    <td className="py-2 px-3 text-[10px] text-slate-500">
                      {item.assignment?.locked ? (
                        <span className="inline-flex items-center gap-0.5 text-amber-700 font-bold">
                          <Lock className="w-2.5 h-2.5" /> LOCK
                        </span>
                      ) : (
                        <span>{item.source}</span>
                      )}
                    </td>

                    <td className="py-2 px-4 text-right text-[11px] text-slate-500 font-sans">
                      {item.notes || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer with Quota Balances */}
        {quotas && quotas.length > 0 && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-700">Annual Quota Balances:</span>
              {quotas
                .filter((q) => q.annualQuotaHours > 0)
                .map((q) => (
                  <span
                    key={q.leaveTypeId}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-700"
                  >
                    <span className="font-bold">{q.leaveTypeName}:</span>
                    <span>
                      {q.usedHours}h used / {q.annualQuotaHours}h ({q.remainingHours}h remaining)
                    </span>
                  </span>
                ))}
            </div>

            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-medium transition-colors cursor-pointer"
            >
              Close Timesheet
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
