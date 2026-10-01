/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Phase 9 — Hours Accounting, Contract Proportions, Leave Credits & Payroll Ledger
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Clock,
  Download,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Users,
  Search,
  Filter,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  HelpCircle,
  Printer,
  ChevronDown,
  Eye,
  Sliders,
  Scale,
  Award,
  Layers,
  Sparkles,
  RefreshCw,
  Sun,
  Moon,
} from 'lucide-react';
import { ClinicContextState } from '../../types/navigation';
import { getRepository } from '../../services/repository';
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
  NurseHoursAccounting,
  ClinicHoursMetrics,
  calculateNurseHoursAccounting,
  calculateClinicHoursMetrics,
  HoursAccountingStatus,
} from '../../services/reports/hoursAccounting';
import { NurseTimesheetModal } from '../modals/NurseTimesheetModal';

interface ReportsViewProps {
  context: ClinicContextState;
}

type TabMode = 'ledger' | 'equity' | 'quotas';
type SortField =
  | 'name'
  | 'seniority'
  | 'contract'
  | 'target'
  | 'duty'
  | 'leave'
  | 'total'
  | 'variance'
  | 'pace'
  | 'weekend'
  | 'late';

export const ReportsView: React.FC<ReportsViewProps> = ({ context }) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [dutyWindows, setDutyWindows] = useState<DutyWindow[]>([]);
  const [leaveEntries, setLeaveEntries] = useState<LeaveEntry[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [seniorityLevels, setSeniorityLevels] = useState<SeniorityLevel[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [roles, setClinicalRoles] = useState<ClinicalRole[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [quotas, setQuotas] = useState<NurseHoursQuota[]>([]);

  // Navigation & View State
  const [activeTab, setActiveTab] = useState<TabMode>('ledger');
  const [selectedNurseForTimesheet, setSelectedNurseForTimesheet] = useState<NurseHoursAccounting | null>(null);
  const [isTimesheetModalOpen, setIsTimesheetModalOpen] = useState(false);

  // Search, Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | HoursAccountingStatus>('ALL');
  const [seniorityFilter, setSeniorityFilter] = useState<string>('ALL');
  const [contractFilter, setContractFilter] = useState<'ALL' | '100' | 'PART_TIME'>('ALL');
  const [sortField, setSortField] = useState<SortField>('pace');
  const [sortAscending, setSortAscending] = useState(false);

  // Toast
  const [notification, setNotification] = useState<string | null>(null);

  const repo = getRepository();

  const loadData = async () => {
    try {
      const [
        schedList,
        asgnList,
        nList,
        dwList,
        leList,
        ltList,
        sList,
        dList,
        crList,
        spList,
        qList,
      ] = await Promise.all([
        repo.list('schedules'),
        repo.list('assignments'),
        repo.list('nurses'),
        repo.list('dutyWindows'),
        repo.list('leaveEntries'),
        repo.list('leaveTypes'),
        repo.list('seniorityLevels'),
        repo.list('doctors'),
        repo.list('clinicalRoles'),
        repo.list('specialties'),
        repo.list('quotas'),
      ]);

      const uniqueSchedules = Array.from(new Map(schedList.map((s) => [s.id, s])).values());
      setSchedules(uniqueSchedules);
      setDutyWindows(dwList);
      setLeaveEntries(leList);
      setLeaveTypes(ltList);
      setSeniorityLevels(sList);
      setDoctors(dList);
      setClinicalRoles(crList);
      setSpecialties(spList);
      setQuotas(qList);

      const activeNursesList = nList.filter((n) => n.active);
      setNurses(activeNursesList);

      const current =
        schedList.find((s) => s.id === context.activeScheduleId) || schedList[0];
      if (current) {
        setActiveSchedule(current);
        const schedAsgns = asgnList.filter((a) => a.scheduleId === current.id);
        setAssignments(schedAsgns);
      }
    } catch (err) {
      console.error('Error loading reports data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleScheduleChange = (schedId: string) => {
    const found = schedules.find((s) => s.id === schedId);
    if (found) {
      setActiveSchedule(found);
      repo.list('assignments').then((allAsgns) => {
        setAssignments(allAsgns.filter((a) => a.scheduleId === found.id));
      });
    }
  };

  // Compute Nurse Hours Accounting for all nurses
  const nurseAccountingRows: NurseHoursAccounting[] = useMemo(() => {
    if (!activeSchedule) return [];
    return nurses.map((nurse) =>
      calculateNurseHoursAccounting(
        nurse,
        activeSchedule,
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
    activeSchedule,
    nurses,
    assignments,
    dutyWindows,
    leaveEntries,
    leaveTypes,
    seniorityLevels,
    doctors,
    roles,
    specialties,
    quotas,
  ]);

  // Compute high-level clinic metrics & fairness equity indices
  const clinicMetrics: ClinicHoursMetrics = useMemo(() => {
    return calculateClinicHoursMetrics(
      nurseAccountingRows,
      dutyWindows,
      seniorityLevels
    );
  }, [nurseAccountingRows, dutyWindows, seniorityLevels]);

  // Filtering & Sorting
  const filteredRows = useMemo(() => {
    let rows = nurseAccountingRows.filter((r) => {
      const matchesSearch =
        r.nurse.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.nurse.employeeCode.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'ALL' || r.status === statusFilter;

      const matchesSeniority =
        seniorityFilter === 'ALL' || r.nurse.seniorityLevelId === seniorityFilter;

      const matchesContract =
        contractFilter === 'ALL'
          ? true
          : contractFilter === '100'
          ? r.contractPercent === 100
          : r.contractPercent < 100;

      return matchesSearch && matchesStatus && matchesSeniority && matchesContract;
    });

    // Sorting
    rows.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      switch (sortField) {
        case 'name':
          valA = a.nurse.fullName.toLowerCase();
          valB = b.nurse.fullName.toLowerCase();
          break;
        case 'seniority':
          valA = a.seniority?.rank || 99;
          valB = b.seniority?.rank || 99;
          break;
        case 'contract':
          valA = a.contractPercent;
          valB = b.contractPercent;
          break;
        case 'target':
          valA = a.targetHours;
          valB = b.targetHours;
          break;
        case 'duty':
          valA = a.dutyHours;
          valB = b.dutyHours;
          break;
        case 'leave':
          valA = a.leaveHours;
          valB = b.leaveHours;
          break;
        case 'total':
          valA = a.totalEarnedHours;
          valB = b.totalEarnedHours;
          break;
        case 'variance':
          valA = a.varianceHours;
          valB = b.varianceHours;
          break;
        case 'pace':
          valA = a.pacePercent;
          valB = b.pacePercent;
          break;
        case 'weekend':
          valA = a.weekendShiftsCount;
          valB = b.weekendShiftsCount;
          break;
        case 'late':
          valA = a.lateDutiesCount;
          valB = b.lateDutiesCount;
          break;
      }

      if (valA < valB) return sortAscending ? -1 : 1;
      if (valA > valB) return sortAscending ? 1 : -1;
      return 0;
    });

    return rows;
  }, [
    nurseAccountingRows,
    searchQuery,
    statusFilter,
    seniorityFilter,
    contractFilter,
    sortField,
    sortAscending,
  ]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAscending(!sortAscending);
    } else {
      setSortField(field);
      setSortAscending(false);
    }
  };

  // Open Timesheet Modal
  const handleOpenTimesheet = (row: NurseHoursAccounting) => {
    setSelectedNurseForTimesheet(row);
    setIsTimesheetModalOpen(true);
  };

  // Export 1: Comprehensive Payroll Summary CSV
  const handleExportPayrollCsv = () => {
    const headers = [
      'Employee Code',
      'Full Name',
      'Seniority',
      'Contract %',
      'Target Hours (h)',
      'Clinical Duties (h)',
      'Credited Leave (h)',
      'Total Earned (h)',
      'Net Variance (h)',
      'Pace %',
      'Weekend Shifts Count',
      'Late Duties Count (21:00)',
      'Payroll Status',
    ];

    const lines = [headers.join(',')];

    nurseAccountingRows.forEach((r) => {
      lines.push(
        [
          `"${r.nurse.employeeCode}"`,
          `"${r.nurse.fullName}"`,
          `"${r.seniority?.name || 'Staff'}"`,
          `${r.contractPercent}%`,
          r.targetHours,
          r.dutyHours,
          r.leaveHours,
          r.totalEarnedHours,
          r.varianceHours > 0 ? `+${r.varianceHours}` : r.varianceHours,
          `${r.pacePercent}%`,
          r.weekendShiftsCount,
          r.lateDutiesCount,
          r.status,
        ].join(',')
      );
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `payroll-hours-${activeSchedule?.name || 'clinic'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast('Payroll Ledger CSV exported successfully.');
  };

  // Export 2: Detailed Clinic-Wide Shift Timesheets CSV
  const handleExportAllTimesheetsCsv = () => {
    const headers = [
      'Employee Code',
      'Full Name',
      'Date',
      'Weekday',
      'Is Weekend',
      'Type',
      'Duty / Leave Code',
      'Hours Earned',
      'Assigned Doctor / Role',
      'Source',
      'Notes',
    ];

    const lines = [headers.join(',')];

    nurseAccountingRows.forEach((r) => {
      r.timeline.forEach((item) => {
        const doctorOrRole = item.doctor
          ? item.doctor.fullName
          : item.clinicalRole
          ? item.clinicalRole.name
          : item.specialty
          ? `${item.specialty.name} Pool`
          : '';

        lines.push(
          [
            `"${r.nurse.employeeCode}"`,
            `"${r.nurse.fullName}"`,
            item.date,
            item.weekdayName,
            item.isWeekend ? 'YES' : 'NO',
            item.type,
            item.dutyWindow?.acronym || item.leaveType?.acronym || 'OFF',
            item.hoursEarned,
            `"${doctorOrRole}"`,
            `"${item.source || ''}"`,
            `"${item.notes || ''}"`,
          ].join(',')
        );
      });
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `all-shifts-timesheet-${activeSchedule?.name || 'clinic'}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast('All-shift clinical timesheets CSV exported.');
  };

  // Print View
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-none print:p-0 print:max-w-none">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150 print:hidden">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Hours Accounting &amp; Payroll Ledger
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-sans">
            {activeSchedule?.hoursTargetFullTime
              ? `Audit contracted targets (${activeSchedule.hoursTargetFullTime}h full-time / ${Math.round(activeSchedule.hoursTargetFullTime * 0.5)}h half-time), duty shift hours, credited leave hours, and weekend equity.`
              : 'Audit contracted targets for full-time and part-time staff, duty shift hours, credited leave hours, and weekend equity.'}
          </p>
        </div>

        {/* Schedule Selector & Export Controls */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded px-2.5 py-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={activeSchedule?.id || ''}
              onChange={(e) => handleScheduleChange(e.target.value)}
              className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer"
            >
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.startDate} to {s.endDate})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportPayrollCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Payroll CSV</span>
          </button>

          <button
            onClick={handleExportAllTimesheetsCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Timesheets CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded transition-colors cursor-pointer"
            title="Print Ledger Report"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* High-Level Accounting Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* 1. Contracted Demand */}
        <div className="bg-white border border-slate-200 rounded p-3.5 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">Total Contract Demand</span>
          <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
            {clinicMetrics.totalContractedTargetHours}h
          </span>
          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
            Across {clinicMetrics.totalNurses} active staff
          </span>
        </div>

        {/* 2. Clinical Duties */}
        <div className="bg-white border border-slate-200 rounded p-3.5 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">Clinical Duty Shifts</span>
          <span className="text-xl font-bold font-mono text-indigo-600 mt-1 block">
            {clinicMetrics.totalDutyHoursWorked}h
          </span>
          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
            {assignments.length} assigned shifts
          </span>
        </div>

        {/* 3. Leave Credits */}
        <div className="bg-white border border-slate-200 rounded p-3.5 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">Credited Staff Leave</span>
          <span className="text-xl font-bold font-mono text-amber-600 mt-1 block">
            {clinicMetrics.totalLeaveHoursCredited}h
          </span>
          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
            AL, BL, PH &amp; SL hours
          </span>
        </div>

        {/* 4. Target Fulfillment */}
        <div className="bg-white border border-slate-200 rounded p-3.5 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">Clinic Fulfillment</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold font-mono text-slate-900">
              {clinicMetrics.clinicFulfillmentPercent}%
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              ({clinicMetrics.totalEarnedHours}h)
            </span>
          </div>
          <div className="w-full h-1.5 rounded bg-slate-100 overflow-hidden mt-1.5">
            <div
              className={`h-full ${
                clinicMetrics.clinicFulfillmentPercent >= 95
                  ? 'bg-emerald-500'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, clinicMetrics.clinicFulfillmentPercent)}%` }}
            />
          </div>
        </div>

        {/* 5. Net Overtime / Deficit */}
        <div className="bg-white border border-slate-200 rounded p-3.5 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">Net Balance Variance</span>
          <div className="flex items-center gap-1.5 mt-1 font-mono">
            <span className="text-xs text-emerald-600 font-bold">
              +{clinicMetrics.totalOvertimeHours}h OT
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-xs text-rose-600 font-bold">
              -{clinicMetrics.totalDeficitHours}h DEF
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
            {clinicMetrics.nursesInDeficitCount} deficit · {clinicMetrics.nursesOnTrackCount} on track
          </span>
        </div>

        {/* 6. Hours Fairness & Weekend Spread */}
        <div className="bg-white border border-slate-200 rounded p-3.5 shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">Fairness &amp; Weekends</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-bold font-mono text-slate-900">
              {clinicMetrics.hoursFairnessIndex}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">/ 100 equity</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
            Avg {clinicMetrics.averageWeekendShiftsPerNurse} weekends (spread {clinicMetrics.weekendSpread})
          </span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 text-xs print:hidden">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`pb-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'ledger'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Staff Hours &amp; Payroll Ledger</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
              {nurseAccountingRows.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('equity')}
            className={`pb-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'equity'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Equity &amp; Shift Distribution Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab('quotas')}
            className={`pb-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'quotas'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Leave Quotas &amp; Accrual Balances</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Main Staff Hours & Payroll Ledger */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white border border-slate-200 rounded p-3 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
            <div className="flex flex-1 items-center gap-2 min-w-[240px] max-w-md">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search staff by name or employee code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Seniority Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-[11px]">Seniority:</span>
                <select
                  value={seniorityFilter}
                  onChange={(e) => setSeniorityFilter(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                >
                  <option value="ALL">All Levels</option>
                  {seniorityLevels.map((sl) => (
                    <option key={sl.id} value={sl.id}>
                      {sl.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Contract Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-[11px]">Contract:</span>
                <select
                  value={contractFilter}
                  onChange={(e) => setContractFilter(e.target.value as any)}
                  className="px-2 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                >
                  <option value="ALL">All Contracts</option>
                  <option value="100">Full-Time (100%)</option>
                  <option value="PART_TIME">Part-Time (&lt;100%)</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-[11px]">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-2 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                >
                  <option value="ALL">All Statuses ({nurseAccountingRows.length})</option>
                  <option value="OPTIMAL">On Target (90–110%)</option>
                  <option value="UNDER">Deficit (75–89%)</option>
                  <option value="CRITICAL_UNDER">Severe Deficit (&lt;75%)</option>
                  <option value="OVER">Overtime (111–120%)</option>
                  <option value="CRITICAL_OVER">Excess Overtime (&gt;120%)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-2xs">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <span className="font-bold text-xs text-slate-800">
                Staff Hours Ledger ({activeSchedule?.name || context.activeScheduleName})
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Showing {filteredRows.length} of {nurseAccountingRows.length} nurses · Click any row
                for full timesheet audit
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-medium font-mono">
                  <tr>
                    <th
                      onClick={() => handleSort('name')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>Nurse Staff</span>
                        {sortField === 'name' && (
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              sortAscending ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('contract')}
                      className="py-2.5 px-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Contract</span>
                        {sortField === 'contract' && (
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              sortAscending ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('target')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>Target</span>
                        {sortField === 'target' && (
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              sortAscending ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('duty')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>Duties (h)</span>
                        {sortField === 'duty' && (
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              sortAscending ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('leave')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>Leave (h)</span>
                        {sortField === 'leave' && (
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              sortAscending ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('total')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>Total Earned</span>
                        {sortField === 'total' && (
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              sortAscending ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('variance')}
                      className="py-2.5 px-3 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>Variance</span>
                        {sortField === 'variance' && (
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              sortAscending ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('weekend')}
                      className="py-2.5 px-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                      title="Number of Saturday/Sunday shifts"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Weekends</span>
                        {sortField === 'weekend' && (
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              sortAscending ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('late')}
                      className="py-2.5 px-3 text-center cursor-pointer hover:bg-slate-100 transition-colors"
                      title="Number of 21:00 late finishes"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Late Finishes</span>
                        {sortField === 'late' && (
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              sortAscending ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </div>
                    </th>

                    <th
                      onClick={() => handleSort('pace')}
                      className="py-2.5 px-3 w-36 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1">
                        <span>Pace %</span>
                        {sortField === 'pace' && (
                          <ChevronDown
                            className={`w-3 h-3 transition-transform ${
                              sortAscending ? 'rotate-180' : ''
                            }`}
                          />
                        )}
                      </div>
                    </th>

                    <th className="py-2.5 px-3 text-right">Accounting Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredRows.map((r) => {
                    const isUnder =
                      r.status === 'UNDER' || r.status === 'CRITICAL_UNDER';
                    const isOver =
                      r.status === 'OVER' || r.status === 'CRITICAL_OVER';

                    return (
                      <tr
                        key={r.nurse.id}
                        onClick={() => handleOpenTimesheet(r)}
                        className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 block font-sans group-hover:text-indigo-600 transition-colors">
                              {r.nurse.fullName}
                            </span>
                            {r.seniority && (
                              <span
                                className="text-[10px] font-sans px-1.5 py-0.2 rounded"
                                style={{
                                  backgroundColor: `${r.seniority.color}15`,
                                  color: r.seniority.color,
                                }}
                              >
                                {r.seniority.name}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {r.nurse.employeeCode} · {r.totalShiftsCount} shifts
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                          {r.contractPercent}%
                        </td>

                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          {r.targetHours}h
                        </td>

                        <td className="py-2.5 px-3 text-indigo-700 font-semibold">
                          {r.dutyHours}h
                        </td>

                        <td className="py-2.5 px-3 text-amber-700 font-semibold">
                          {r.leaveHours}h
                        </td>

                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {r.totalEarnedHours}h
                        </td>

                        <td className="py-2.5 px-3">
                          <span
                            className={`font-bold ${
                              r.varianceHours > 0
                                ? 'text-emerald-600'
                                : r.varianceHours < 0
                                ? 'text-rose-600'
                                : 'text-slate-500'
                            }`}
                          >
                            {r.varianceHours > 0
                              ? `+${r.varianceHours}h`
                              : `${r.varianceHours}h`}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
                              r.weekendShiftsCount > clinicMetrics.averageWeekendShiftsPerNurse + 1
                                ? 'bg-amber-50 text-amber-800'
                                : 'text-slate-700'
                            }`}
                          >
                            {r.weekendShiftsCount}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-center">
                          <span className="text-slate-700">{r.lateDutiesCount}</span>
                        </td>

                        <td className="py-2.5 px-3">
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

                        <td className="py-2.5 px-3 text-right">
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
        </div>
      )}

      {/* TAB 2: Equity & Shift Distribution Analytics */}
      {activeTab === 'equity' && (
        <div className="space-y-6">
          {/* Weekend Equity & Shift Variety Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Weekend Distribution Card */}
            <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <Sun className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs font-bold text-slate-900">
                    Weekend Duty Equity Distribution
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  Target: ~{clinicMetrics.averageWeekendShiftsPerNurse} shifts/nurse
                </span>
              </div>

              <p className="text-xs text-slate-500">
                Auditing fairness across Saturday and Sunday clinical shifts to prevent burn-out.
                Current weekend spread is {clinicMetrics.weekendSpread} shifts (min{' '}
                {clinicMetrics.minWeekendShifts}, max {clinicMetrics.maxWeekendShifts}).
              </p>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {nurseAccountingRows.map((r) => {
                  const maxPossible = Math.max(5, clinicMetrics.maxWeekendShifts + 1);
                  const pct = Math.round((r.weekendShiftsCount / maxPossible) * 100);

                  return (
                    <div key={r.nurse.id} className="text-xs flex items-center gap-3">
                      <span className="w-36 font-semibold text-slate-800 truncate">
                        {r.nurse.fullName}
                      </span>
                      <div className="flex-1 h-3 rounded bg-slate-100 overflow-hidden relative">
                        <div
                          className="h-full bg-amber-500 rounded"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono font-bold text-slate-800">
                        {r.weekendShiftsCount} w/e
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Late Finish Distribution Card */}
            <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <Moon className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold text-slate-900">
                    Late Duties (21:00 Close) Equity
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-500">
                  Full Day (D) &amp; Late (L)
                </span>
              </div>

              <p className="text-xs text-slate-500">
                Tracks distribution of late-ending shifts to uphold Soft Constraint S1 (minimizing
                consecutive late days) and ensure evening duties are shared fairly.
              </p>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {nurseAccountingRows.map((r) => {
                  const maxLate = Math.max(
                    1,
                    Math.max(...nurseAccountingRows.map((x) => x.lateDutiesCount))
                  );
                  const pct = Math.round((r.lateDutiesCount / maxLate) * 100);

                  return (
                    <div key={r.nurse.id} className="text-xs flex items-center gap-3">
                      <span className="w-36 font-semibold text-slate-800 truncate">
                        {r.nurse.fullName}
                      </span>
                      <div className="flex-1 h-3 rounded bg-slate-100 overflow-hidden relative">
                        <div
                          className="h-full bg-indigo-500 rounded"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono font-bold text-slate-800">
                        {r.lateDutiesCount} late
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Duty Types and Seniority Hours Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Duty Window Breakdown */}
            <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
                Clinical Hours by Duty Window
              </h3>
              <div className="space-y-3">
                {Object.values(clinicMetrics.dutyTypeDistribution).map((d) => (
                  <div key={d.dutyWindow.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-5 h-5 rounded flex items-center justify-center text-white font-bold text-[10px]"
                          style={{ backgroundColor: d.dutyWindow.color }}
                        >
                          {d.dutyWindow.acronym}
                        </span>
                        <span className="font-semibold text-slate-800">
                          {d.dutyWindow.name} ({d.dutyWindow.startTime}–{d.dutyWindow.endTime})
                        </span>
                      </div>
                      <span className="font-mono text-slate-600">
                        {d.shiftsCount} shifts · {d.totalHours}h ({d.percentageOfHours}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded"
                        style={{
                          backgroundColor: d.dutyWindow.color,
                          width: `${d.percentageOfHours}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Seniority Hours Breakdown */}
            <div className="bg-white border border-slate-200 rounded p-4 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
                Fulfillment by Seniority Grade
              </h3>
              <div className="space-y-3">
                {Object.values(clinicMetrics.seniorityDistribution).map((s) => (
                  <div key={s.seniority.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: `${s.seniority.color}15`,
                            color: s.seniority.color,
                          }}
                        >
                          {s.seniority.name}
                        </span>
                        <span className="text-slate-500 font-mono text-[11px]">
                          ({s.nursesCount} staff)
                        </span>
                      </div>
                      <span className="font-mono text-slate-700 font-semibold">
                        {s.earnedHours}h / {s.targetHours}h ({s.fulfillmentPercent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded"
                        style={{
                          backgroundColor: s.seniority.color,
                          width: `${Math.min(100, s.fulfillmentPercent)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Leave Quotas & Accrual Balances */}
      {activeTab === 'quotas' && (
        <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-2xs">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <span className="font-bold text-xs text-slate-800 block">
                Annual Leave Quotas &amp; Accrual Balances (Days)
              </span>
              <span className="text-[11px] text-slate-500">
                Audits annual leave allocations in days (Annual Leave, Public Holidays, Birthday Leave). Sick leave is unbudgeted and has no allowed quota ceiling.
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-medium font-mono">
                <tr>
                  <th className="py-2.5 px-3">Nurse Staff</th>
                  <th className="py-2.5 px-3">Seniority</th>
                  <th className="py-2.5 px-3">Annual Leave (AL) Days</th>
                  <th className="py-2.5 px-3">AL Remaining</th>
                  <th className="py-2.5 px-3">Public Holiday (PH) Days</th>
                  <th className="py-2.5 px-3">Birthday Leave (BL)</th>
                  <th className="py-2.5 px-3">Sick Days Taken</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {nurseAccountingRows.map((r) => {
                  const al = r.quotas.find((q) => q.leaveTypeId === 'leave-al');
                  const ph = r.quotas.find((q) => q.leaveTypeId === 'leave-ph');
                  const bl = r.quotas.find((q) => q.leaveTypeId === 'leave-bl');
                  const slDays = r.leaveBreakdown['leave-sl']?.daysCount || 0;
                  const blDays = r.leaveBreakdown['leave-bl']?.daysCount || 0;

                  return (
                    <tr key={r.nurse.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900 block font-sans">
                          {r.nurse.fullName}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {r.nurse.employeeCode} · DOB: {r.nurse.dateOfBirth}
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="font-sans text-slate-700">
                          {r.seniority?.name || 'Staff'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 font-semibold text-amber-700">
                        {al?.usedDays ?? 0} / {al?.annualQuotaDays ?? 30} days
                      </td>

                      <td className="py-2.5 px-3 font-bold text-slate-800">
                        {al?.remainingDays ?? 30} days
                      </td>

                      <td className="py-2.5 px-3 font-semibold text-cyan-700">
                        {ph?.usedDays ?? 0} / {ph?.annualQuotaDays ?? 10} days
                      </td>

                      <td className="py-2.5 px-3">
                        {blDays > 0 ? (
                          <span className="inline-flex items-center gap-1 text-rose-600 font-bold">
                            🎂 {blDays} / {bl?.annualQuotaDays ?? 1} day
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            0 / {bl?.annualQuotaDays ?? 1} day
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-slate-600">
                        {slDays > 0 ? (
                          <span className="font-semibold text-pink-700">
                            {slDays} day{slDays > 1 ? 's' : ''} (Uncapped)
                          </span>
                        ) : (
                          <span className="text-slate-400">0 days</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleOpenTimesheet(r)}
                          className="px-2.5 py-1 text-xs text-indigo-600 hover:text-indigo-800 font-sans font-medium hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                        >
                          View Timesheet
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Drill-Down Modal */}
      <NurseTimesheetModal
        schedule={activeSchedule || schedules[0]}
        accounting={selectedNurseForTimesheet}
        isOpen={isTimesheetModalOpen}
        onClose={() => setIsTimesheetModalOpen(false)}
      />
    </div>
  );
};
