/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Unified Export Dialog & Print Preview (Phase 11)
 * Supports Multi-Sheet Excel, CSV Matrix/Long, A3 Landscape Roster Print, and Per-Nurse Packets.
 */

import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  Layers,
  Users,
  CheckCircle2,
  FileText,
  Clock,
  Sparkles,
  Info,
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
  DoctorSession,
  ClinicalRole,
  Specialty,
  Rule,
} from '../../types';
import {
  exportRosterToExcel,
  exportRosterToCsvMatrix,
  exportRosterToCsvLong,
  getScheduleDates,
} from '../../services/export/rosterExportService';
import {
  calculateNurseHoursAccounting,
  calculateDutyDurationHours,
  NurseHoursAccounting,
} from '../../services/reports/hoursAccounting';

interface ExportModalProps {
  clinicName: string;
  schedule: Schedule;
  assignments: Assignment[];
  nurses: Nurse[];
  dutyWindows: DutyWindow[];
  leaveEntries: LeaveEntry[];
  leaveTypes: LeaveType[];
  seniorityLevels: SeniorityLevel[];
  doctors: Doctor[];
  sessions: DoctorSession[];
  roles: ClinicalRole[];
  specialties: Specialty[];
  rules?: Rule[];
  currentBlockIndex?: number;
  blockDates?: string[];
  versionNumber?: number;
  isOpen: boolean;
  onClose: () => void;
}

type ExportTab = 'excel' | 'csv' | 'print_roster' | 'print_packets';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const ExportModal: React.FC<ExportModalProps> = ({
  clinicName,
  schedule,
  assignments,
  nurses,
  dutyWindows,
  leaveEntries,
  leaveTypes,
  seniorityLevels,
  doctors,
  sessions,
  roles,
  specialties,
  rules = [],
  currentBlockIndex = 0,
  blockDates = [],
  versionNumber = schedule.activeVersionNumber || 1,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<ExportTab>('excel');
  const [excelScope, setExcelScope] = useState<'ALL' | 'ACTIVE_BLOCK'>('ALL');
  const [selectedNurseId, setSelectedNurseId] = useState<string>('ALL');

  if (!isOpen) return null;

  const dutyMap = new Map(dutyWindows.map((d) => [d.id, d]));
  const nurseMap = new Map(nurses.map((n) => [n.id, n]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const specialtyMap = new Map(specialties.map((s) => [s.id, s]));
  const seniorityMap = new Map(seniorityLevels.map((s) => [s.id, s]));
  const leaveTypeMap = new Map(leaveTypes.map((l) => [l.id, l]));

  const allDates = getScheduleDates(schedule.startDate, schedule.endDate);
  const activeDates = excelScope === 'ACTIVE_BLOCK' && blockDates.length > 0 ? blockDates : allDates;

  // 1. Download Excel
  const handleDownloadExcel = () => {
    exportRosterToExcel({
      clinicName,
      schedule,
      assignments,
      nurses,
      dutyWindows,
      leaveEntries,
      leaveTypes,
      seniorityLevels,
      doctors,
      sessions,
      roles,
      specialties,
      rules,
      versionNumber,
      blockDates: excelScope === 'ACTIVE_BLOCK' ? blockDates : undefined,
    });
  };

  // 2. Download CSV Matrix
  const handleDownloadCsvMatrix = () => {
    exportRosterToCsvMatrix({
      clinicName,
      schedule,
      assignments,
      nurses,
      dutyWindows,
      leaveEntries,
      leaveTypes,
      seniorityLevels,
      doctors,
      sessions,
      roles,
      specialties,
      versionNumber,
      blockDates: excelScope === 'ACTIVE_BLOCK' ? blockDates : undefined,
    });
  };

  // 3. Download CSV Long
  const handleDownloadCsvLong = () => {
    exportRosterToCsvLong({
      clinicName,
      schedule,
      assignments,
      nurses,
      dutyWindows,
      leaveEntries,
      leaveTypes,
      seniorityLevels,
      doctors,
      sessions,
      roles,
      specialties,
      versionNumber,
    });
  };

  // 4. Trigger Native Print
  const handleTriggerPrint = () => {
    window.print();
  };

  // Compute per-nurse accounting for printable packets
  const nurseAccountingList: NurseHoursAccounting[] = nurses.map((nurse) =>
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
      specialties
    )
  );

  const displayNursesForPackets =
    selectedNurseId === 'ALL'
      ? nurseAccountingList
      : nurseAccountingList.filter((n) => n.nurse.id === selectedNurseId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none animate-in fade-in duration-150 print:static print:p-0 print:bg-white">
      {/* Modal Container (Hidden during native print, print section rendered below) */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs print:hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Export &amp; Print Center</h2>
              </div>
              <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                {schedule.name} · Version v{versionNumber} ({schedule.startDate} to {schedule.endDate})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 flex items-center gap-6 bg-white text-xs">
          <button
            onClick={() => setActiveTab('excel')}
            className={`py-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'excel'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Excel (.xlsx via SheetJS)</span>
          </button>

          <button
            onClick={() => setActiveTab('csv')}
            className={`py-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'csv'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4 text-blue-600" />
            <span>CSV (Matrix &amp; Long)</span>
          </button>

          <button
            onClick={() => setActiveTab('print_roster')}
            className={`py-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'print_roster'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Printer className="w-4 h-4 text-indigo-600" />
            <span>A3 Landscape Roster Print</span>
          </button>

          <button
            onClick={() => setActiveTab('print_packets')}
            className={`py-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'print_packets'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4 text-purple-600" />
            <span>Per-Nurse Packets</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* TAB 1: Excel */}
          {activeTab === 'excel' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                  <h3 className="text-sm font-bold text-emerald-950">
                    Comprehensive Multi-Sheet Workbook (.xlsx)
                  </h3>
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed font-sans">
                  Exports a structured workbook generated with SheetJS (`xlsx`) formatted with frozen headers, duty acronyms, doctor pairings, and color fills.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] font-mono text-emerald-900">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 1. `Roster` Grid
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 2. `Legend` Acronyms &amp; Rules
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 3. `Long` Assignment Rows
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 4. `Hours` Accounting Ledger
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 5. `Doctors` Clinic Sessions
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Filename: <code>{clinicName.toLowerCase().replace(/\s+/g, '_')}_{schedule.startDate}_v{versionNumber}.xlsx</code>
                  </span>
                </div>
              </div>

              {/* Scope Radio */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                <span className="font-semibold text-slate-800 text-xs block">Export Scope:</span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="excelScope"
                      checked={excelScope === 'ALL'}
                      onChange={() => setExcelScope('ALL')}
                      className="text-indigo-600"
                    />
                    <span>All Blocks (Full Period: {allDates.length} Days)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="excelScope"
                      checked={excelScope === 'ACTIVE_BLOCK'}
                      onChange={() => setExcelScope('ACTIVE_BLOCK')}
                      className="text-indigo-600"
                    />
                    <span>Active Block Only ({blockDates.length} Days)</span>
                  </label>
                </div>
              </div>

              <button
                onClick={handleDownloadExcel}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Download Multi-Sheet Excel (.xlsx)</span>
              </button>
            </div>
          )}

          {/* TAB 2: CSV */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Flavor 1: Matrix CSV */}
                <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-bold text-slate-900">Matrix Format CSV</h3>
                  </div>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    Formatted exactly like the workbook grid: staff rows on the left with dates across the header columns, filled with duty acronyms and pairings.
                  </p>
                  <button
                    onClick={handleDownloadCsvMatrix}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Matrix CSV</span>
                  </button>
                </div>

                {/* Flavor 2: Long Format CSV */}
                <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-slate-900">Long Format CSV (Relational)</h3>
                  </div>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    One row per clinical assignment including date, employee code, hours, duty times, doctor pairing, lock status, and source. Best for SQL/BI imports.
                  </p>
                  <button
                    onClick={handleDownloadCsvLong}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Long CSV</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: A3 Print */}
          {activeTab === 'print_roster' && (
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-bold text-indigo-950">A3 Landscape Roster Print / PDF</h3>
                </div>
                <p className="text-xs text-indigo-900 leading-relaxed font-sans">
                  Optimized for physical clinic noticeboards and PDF archiving. Includes repeating headers, clinic metadata banner, date columns, and complete bottom legend.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1 font-mono text-[11px] text-slate-600">
                <p>• Paper Size: A3 Landscape (configured in print stylesheet)</p>
                <p>• Header: Clinic Name, Schedule Period, Active Version v{versionNumber}, Printed Timestamp</p>
                <p>• Legend: Duty window times &amp; leave acronyms attached automatically</p>
              </div>

              <button
                onClick={handleTriggerPrint}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Open Print Dialog (A3 Landscape)</span>
              </button>
            </div>
          )}

          {/* TAB 4: Per-Nurse Packets */}
          {activeTab === 'print_packets' && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  <h3 className="text-sm font-bold text-purple-950">Individual Staff Packets</h3>
                </div>
                <p className="text-xs text-purple-900 leading-relaxed font-sans">
                  Produces clean, single-page printed shift schedules for each nurse across the whole period, including contract target, duty hours, leave credits, and chronological shifts.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 p-3 rounded border border-slate-200">
                <span className="font-semibold text-slate-700 text-xs">Print Selection:</span>
                <select
                  value={selectedNurseId}
                  onChange={(e) => setSelectedNurseId(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded font-medium bg-white text-slate-800"
                >
                  <option value="ALL">All Active Nurses ({nurses.length} individual packets)</option>
                  {nurses.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.fullName} ({n.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleTriggerPrint}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Print Individual Staff Packet{selectedNurseId === 'ALL' ? 's' : ''}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            Exporting Version: v{versionNumber} · {clinicName}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* NATIVE PRINT CONTAINER (Visible ONLY when window.print() is called)      */}
      {/* ========================================================================= */}
      <div className="hidden print:block w-full bg-white text-black p-4 text-[10px]">
        {/* Render Mode A: Standard Roster Print */}
        {(activeTab === 'print_roster' || activeTab === 'excel' || activeTab === 'csv') && (
          <div className="space-y-4">
            {/* Clinic & Schedule Print Header */}
            <div className="border-b-2 border-black pb-2 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-tight uppercase">{clinicName}</h1>
                <p className="text-xs text-slate-700 mt-0.5">
                  NURSING SHIFT ROSTER · {schedule.name} ({schedule.startDate} to {schedule.endDate})
                </p>
              </div>
              <div className="text-right font-mono text-[10px]">
                <p className="font-bold">VERSION: v{versionNumber}</p>
                <p className="text-slate-600">Printed: {new Date().toLocaleString()}</p>
                <p className="text-slate-600">Hours Target: {schedule.hoursTargetFullTime}h FT</p>
              </div>
            </div>

            {/* Roster Table */}
            <table className="w-full border-collapse border border-black text-[9px] font-mono">
              <thead>
                <tr className="bg-slate-100 text-black border-b border-black">
                  <th className="border border-black p-1 text-left">Staff Name</th>
                  <th className="border border-black p-1 text-center w-10">FTE %</th>
                  <th className="border border-black p-1 text-center w-12">Total</th>
                  {activeDates.map((d) => {
                    const dayObj = new Date(d);
                    const weekday = WEEKDAY_NAMES[dayObj.getUTCDay()];
                    const dayNum = d.split('-')[2];
                    return (
                      <th key={d} className="border border-black p-0.5 text-center min-w-[26px]">
                        <div>{weekday}</div>
                        <div className="font-bold">{dayNum}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {nurses.map((nurse) => {
                  const seniority = seniorityMap.get(nurse.seniorityLevelId);
                  const acct = nurseAccountingList.find((n) => n.nurse.id === nurse.id);

                  return (
                    <tr key={nurse.id} className="border-b border-black">
                      <td className="border border-black p-1 font-sans font-semibold">
                        <div>{nurse.fullName}</div>
                        <div className="text-[8px] text-slate-500 font-mono">
                          {nurse.employeeCode} · {seniority?.name || 'Staff'}
                        </div>
                      </td>
                      <td className="border border-black p-1 text-center font-bold">
                        {nurse.contractPercent}%
                      </td>
                      <td className="border border-black p-1 text-center font-bold">
                        {acct?.totalEarnedHours || 0}h
                      </td>
                      {activeDates.map((dateStr) => {
                        const asgn = assignments.find((a) => a.nurseId === nurse.id && a.date === dateStr);
                        const leave = leaveEntries.find(
                          (le) => le.nurseId === nurse.id && le.approved && dateStr >= le.startDate && dateStr <= le.endDate
                        );

                        if (leave) {
                          const lt = leaveTypeMap.get(leave.leaveTypeId);
                          return (
                            <td key={dateStr} className="border border-black p-0.5 text-center font-bold bg-amber-100">
                              {lt?.acronym || 'L'}
                            </td>
                          );
                        } else if (asgn) {
                          const duty = dutyMap.get(asgn.dutyWindowId);
                          let targetCode = '';
                          if (asgn.doctorId) {
                            targetCode = doctorMap.get(asgn.doctorId)?.fullName.split(' ')[1] || 'Dr';
                          } else if (asgn.clinicalRoleId) {
                            targetCode = roleMap.get(asgn.clinicalRoleId)?.acronym || 'PHL';
                          }
                          return (
                            <td key={dateStr} className="border border-black p-0.5 text-center">
                              <div className="font-bold">{duty?.acronym || 'D'}</div>
                              {targetCode && <div className="text-[7px] text-slate-600 truncate max-w-[28px]">{targetCode}</div>}
                            </td>
                          );
                        } else {
                          return (
                            <td key={dateStr} className="border border-black p-0.5 text-center text-slate-300">
                              —
                            </td>
                          );
                        }
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Print Legend */}
            <div className="border border-black p-2 mt-4 text-[9px] flex items-start justify-between gap-6 print-avoid-break">
              <div>
                <span className="font-bold block uppercase mb-1">Duties:</span>
                <div className="flex flex-wrap gap-3">
                  {dutyWindows.map((dw) => (
                    <span key={dw.id}>
                      <strong>[{dw.acronym}]</strong> {dw.name} ({dw.startTime}–{dw.endTime})
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="font-bold block uppercase mb-1">Leave Codes:</span>
                <div className="flex flex-wrap gap-3">
                  {leaveTypes.map((lt) => (
                    <span key={lt.id}>
                      <strong>[{lt.acronym}]</strong> {lt.name} ({typeof lt.creditedHours === 'number' ? `${lt.creditedHours}h` : 'match'})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Render Mode B: Per-Nurse Packets */}
        {activeTab === 'print_packets' && (
          <div>
            {displayNursesForPackets.map((item, index) => (
              <div
                key={item.nurse.id}
                className={`p-6 border border-black ${
                  index < displayNursesForPackets.length - 1 ? 'print-page-break' : ''
                }`}
              >
                {/* Nurse Packet Header */}
                <div className="border-b-2 border-black pb-3 flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-bold uppercase">{clinicName}</h1>
                    <h2 className="text-base font-bold text-slate-900 mt-1">
                      Individual Staff Schedule: {item.nurse.fullName}
                    </h2>
                    <p className="text-xs text-slate-600 font-mono mt-0.5">
                      Employee Code: {item.nurse.employeeCode} · {item.seniority?.name || 'Staff Nurse'} · {item.contractPercent}% FTE
                    </p>
                  </div>
                  <div className="text-right font-mono text-[10px]">
                    <p className="font-bold">{schedule.name}</p>
                    <p>{schedule.startDate} to {schedule.endDate}</p>
                    <p className="text-slate-600">Printed: {new Date().toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Nurse Hours Summary KPI Grid */}
                <div className="grid grid-cols-5 gap-3 my-4 p-3 border border-black font-mono text-[10px]">
                  <div>
                    <span className="text-slate-500 block">Contract Target</span>
                    <span className="font-bold text-sm">{item.targetHours}h</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Duties Worked</span>
                    <span className="font-bold text-sm">{item.dutyHours}h</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Leave Credited</span>
                    <span className="font-bold text-sm">{item.leaveHours}h</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Total Earned</span>
                    <span className="font-bold text-sm">{item.totalEarnedHours}h</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Net Variance</span>
                    <span className="font-bold text-sm">
                      {item.varianceHours > 0 ? `+${item.varianceHours}h` : `${item.varianceHours}h`}
                    </span>
                  </div>
                </div>

                {/* Day-by-Day Chronological Shift Log */}
                <table className="w-full border-collapse border border-black text-[9px] font-mono">
                  <thead>
                    <tr className="bg-slate-100 border-b border-black">
                      <th className="border border-black p-1 text-left">Date</th>
                      <th className="border border-black p-1 text-left">Weekday</th>
                      <th className="border border-black p-1 text-left">Shift / Leave Type</th>
                      <th className="border border-black p-1 text-left">Duty Window Times</th>
                      <th className="border border-black p-1 text-left">Assigned Doctor / Clinical Role</th>
                      <th className="border border-black p-1 text-right">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.timeline.map((entry) => (
                      <tr key={entry.date} className="border-b border-slate-300">
                        <td className="border border-black p-1 font-bold">{entry.date}</td>
                        <td className="border border-black p-1">{entry.weekdayName}</td>
                        <td className="border border-black p-1">
                          {entry.dutyWindow
                            ? `${entry.dutyWindow.name} (${entry.dutyWindow.acronym})`
                            : entry.leaveType
                            ? `${entry.leaveType.name} (${entry.leaveType.acronym})`
                            : 'OFF / REST'}
                        </td>
                        <td className="border border-black p-1">
                          {entry.dutyWindow ? `${entry.dutyWindow.startTime}–${entry.dutyWindow.endTime}` : '—'}
                        </td>
                        <td className="border border-black p-1 font-sans">
                          {entry.doctor
                            ? entry.doctor.fullName
                            : entry.clinicalRole
                            ? entry.clinicalRole.name
                            : entry.specialty
                            ? `${entry.specialty.name} Pool`
                            : '—'}
                        </td>
                        <td className="border border-black p-1 text-right font-bold">
                          {entry.hoursEarned > 0 ? `${entry.hoursEarned}h` : '0h'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Signature / Footer */}
                <div className="mt-8 pt-4 border-t border-black flex items-center justify-between text-[9px] font-mono">
                  <div>
                    <span>Nurse Signature: _______________________</span>
                  </div>
                  <div>
                    <span>Supervisor / Charge Nurse: _______________________</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
