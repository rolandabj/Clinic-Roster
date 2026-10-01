/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Hours & Equity Workbook Sheet (Phase 9)
 */

import React, { useState, useMemo } from 'react';
import {
  Scale,
  Clock,
  Download,
  Search,
  Filter,
  Users,
  Eye,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Sun,
  Moon,
} from 'lucide-react';
import {
  Schedule,
  Assignment,
  Nurse,
  DutyWindow,
  LeaveEntry,
  LeaveType,
  SeniorityLevel,
  Doctor,
  ClinicalRole,
  Specialty,
  NurseHoursQuota,
} from '../../types';
import {
  calculateNurseHoursAccounting,
  calculateClinicHoursMetrics,
  NurseHoursAccounting,
  HoursAccountingStatus,
} from '../../services/reports/hoursAccounting';
import { NurseTimesheetModal } from '../modals/NurseTimesheetModal';

interface HoursAccountingSheetProps {
  schedule: Schedule;
  assignments: Assignment[];
  nurses: Nurse[];
  dutyWindows: DutyWindow[];
  leaveEntries: LeaveEntry[];
  leaveTypes: LeaveType[];
  seniorityLevels: SeniorityLevel[];
  doctors: Doctor[];
  roles: ClinicalRole[];
  specialties: Specialty[];
  quotas: NurseHoursQuota[];
  onGoToReports?: () => void;
}

export const HoursAccountingSheet: React.FC<HoursAccountingSheetProps> = ({
  schedule,
  assignments,
  nurses,
  dutyWindows,
  leaveEntries,
  leaveTypes,
  seniorityLevels,
  doctors,
  roles,
  specialties,
  quotas,
  onGoToReports,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | HoursAccountingStatus>('ALL');
  const [selectedNurse, setSelectedNurse] = useState<NurseHoursAccounting | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Compute accounting rows
  const nurseRows: NurseHoursAccounting[] = useMemo(() => {
    return nurses.map((nurse) =>
      calculateNurseHoursAccounting(
        nurse,
        schedule,
        assignments,
        dutyWindows,
        leaveEntries,
        leaveTypes,
        seniorityLevels,
        doctors,
        roles,
        specialties,
        quotas
      )
    );
  }, [
    schedule,
    assignments,
    nurses,
    dutyWindows,
    leaveEntries,
    leaveTypes,
    seniorityLevels,
    doctors,
    roles,
    specialties,
    quotas,
  ]);

  const metrics = useMemo(() => {
    return calculateClinicHoursMetrics(nurseRows, dutyWindows, seniorityLevels);
  }, [nurseRows, dutyWindows, seniorityLevels]);

  const filteredRows = useMemo(() => {
    return nurseRows.filter((r) => {
      const matchSearch =
        r.nurse.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.nurse.employeeCode.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [nurseRows, searchQuery, statusFilter]);

  const handleOpenTimesheet = (row: NurseHoursAccounting) => {
    setSelectedNurse(row);
    setIsModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 select-none overflow-hidden text-xs">
      {/* Top Sheet Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Scale className="w-4 h-4 text-indigo-600" />
            <span className="font-bold text-slate-800">
              Hours Accounting &amp; Equity Audit ({schedule.name})
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Quick Metrics Badges */}
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
              Target: <strong className="text-slate-900">{metrics.totalContractedTargetHours}h</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
              Duties: <strong>{metrics.totalDutyHoursWorked}h</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700">
              Leave: <strong>{metrics.totalLeaveHoursCredited}h</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
              Fulfillment: <strong>{metrics.clinicFulfillmentPercent}%</strong>
            </span>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search nurse..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-2.5 py-1 border border-slate-200 rounded text-xs w-44 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
          >
            <option value="ALL">All Statuses ({nurseRows.length})</option>
            <option value="OPTIMAL">On Target</option>
            <option value="UNDER">Deficit</option>
            <option value="CRITICAL_UNDER">Severe Deficit</option>
            <option value="OVER">Overtime</option>
            <option value="CRITICAL_OVER">Excess Overtime</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-auto bg-white p-3">
        <div className="border border-slate-200 rounded overflow-hidden shadow-2xs">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-medium font-mono">
              <tr>
                <th className="py-2 px-3">Nurse Staff</th>
                <th className="py-2 px-3 text-center">Contract</th>
                <th className="py-2 px-3">Target</th>
                <th className="py-2 px-3">Clinical Duty</th>
                <th className="py-2 px-3">Leave Credit</th>
                <th className="py-2 px-3">Total Earned</th>
                <th className="py-2 px-3">Variance</th>
                <th className="py-2 px-3 text-center">Weekends</th>
                <th className="py-2 px-3 text-center">Late Shifts</th>
                <th className="py-2 px-3 w-36">Pace Fulfillment</th>
                <th className="py-2 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredRows.map((r) => {
                const isUnder = r.status === 'UNDER' || r.status === 'CRITICAL_UNDER';
                return (
                  <tr
                    key={r.nurse.id}
                    onClick={() => handleOpenTimesheet(r)}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3">
                      <span className="font-semibold text-slate-900 block font-sans">
                        {r.nurse.fullName}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {r.nurse.employeeCode} · {r.seniority?.name || 'Staff'}
                      </span>
                    </td>

                    <td className="py-2 px-3 text-center font-bold text-slate-700">
                      {r.contractPercent}%
                    </td>

                    <td className="py-2 px-3 font-bold text-slate-800">
                      {r.targetHours}h
                    </td>

                    <td className="py-2 px-3 text-indigo-700 font-semibold">
                      {r.dutyHours}h
                    </td>

                    <td className="py-2 px-3 text-amber-700 font-semibold">
                      {r.leaveHours}h
                    </td>

                    <td className="py-2 px-3 font-bold text-slate-900">
                      {r.totalEarnedHours}h
                    </td>

                    <td className="py-2 px-3">
                      <span
                        className={`font-bold ${
                          r.varianceHours > 0
                            ? 'text-emerald-600'
                            : r.varianceHours < 0
                            ? 'text-rose-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {r.varianceHours > 0 ? `+${r.varianceHours}h` : `${r.varianceHours}h`}
                      </span>
                    </td>

                    <td className="py-2 px-3 text-center">
                      <span className="font-bold text-slate-700">{r.weekendShiftsCount}</span>
                    </td>

                    <td className="py-2 px-3 text-center text-slate-700">
                      {r.lateDutiesCount}
                    </td>

                    <td className="py-2 px-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold text-slate-800">{r.pacePercent}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full ${
                              r.status === 'OPTIMAL'
                                ? 'bg-emerald-500'
                                : isUnder
                                ? 'bg-amber-500'
                                : 'bg-indigo-500'
                            }`}
                            style={{ width: `${Math.min(100, r.pacePercent)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="py-2 px-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.status === 'OPTIMAL'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : r.status === 'CRITICAL_UNDER'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : r.status === 'UNDER'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}
                      >
                        {r.status === 'OPTIMAL' && 'ON TARGET ✓'}
                        {r.status === 'UNDER' && 'BELOW TARGET'}
                        {r.status === 'CRITICAL_UNDER' && 'DEFICIT ALERT'}
                        {r.status === 'OVER' && 'OVERTIME'}
                        {r.status === 'CRITICAL_OVER' && 'EXCESS HOURS'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <NurseTimesheetModal
        schedule={schedule}
        accounting={selectedNurse}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
