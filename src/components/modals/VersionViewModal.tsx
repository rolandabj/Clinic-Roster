/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Version Snapshot Read-Only Viewer Modal (Phase 10 & 16)
 * High-elegance dual-view (Roster Matrix & Shifts List) inspection studio with deletion and restore controls.
 */

import React, { useState } from 'react';
import {
  X,
  Eye,
  RotateCcw,
  Calendar,
  User,
  Clock,
  Lock,
  Search,
  Download,
  Shield,
  Layers,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Trash2,
} from 'lucide-react';
import {
  Schedule,
  ScheduleVersion,
  Assignment,
  Nurse,
  DutyWindow,
  Doctor,
  ClinicalRole,
  Specialty,
  LeaveType,
} from '../../types';

interface VersionViewModalProps {
  version: ScheduleVersion | null;
  schedule?: Schedule | null;
  nurses: Nurse[];
  dutyWindows: DutyWindow[];
  doctors: Doctor[];
  roles: ClinicalRole[];
  specialties: Specialty[];
  leaveTypes?: LeaveType[];
  isOpen: boolean;
  onClose: () => void;
  onRestore?: (version: ScheduleVersion) => void;
  onDelete?: (version: ScheduleVersion) => void;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const VersionViewModal: React.FC<VersionViewModalProps> = ({
  version,
  schedule,
  nurses,
  dutyWindows,
  doctors,
  roles,
  specialties,
  leaveTypes = [],
  isOpen,
  onClose,
  onRestore,
  onDelete,
}) => {
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNurseId, setSelectedNurseId] = useState<string>('ALL');
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number>(0);

  if (!isOpen || !version) return null;

  const dutyMap = new Map(dutyWindows.map((d) => [d.id, d]));
  const nurseMap = new Map(nurses.map((n) => [n.id, n]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const specialtyMap = new Map(specialties.map((s) => [s.id, s]));
  const leaveTypeMap = new Map(leaveTypes.map((l) => [l.id, l]));

  const assignments = version.snapshot.assignments || [];
  const leaveEntries = version.snapshot.leaveEntries || [];
  const locks = version.snapshot.locks || [];

  // Effective schedule dates
  const effectiveSchedule = version.snapshot.schedule || schedule;
  const startDateStr = effectiveSchedule?.startDate || '2026-10-01';
  const endDateStr = effectiveSchedule?.endDate || '2026-10-31';
  const blockWeeks = effectiveSchedule?.blockWeeks || 2;
  const daysPerBlock = blockWeeks * 7;

  const start = new Date(startDateStr + 'T00:00:00Z');
  const end = new Date(endDateStr + 'T00:00:00Z');
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const totalBlocks = Math.max(1, Math.ceil(totalDays / daysPerBlock));

  const currentBlockStartDay = selectedBlockIndex * daysPerBlock + 1;
  const currentBlockEndDay = Math.min((selectedBlockIndex + 1) * daysPerBlock, totalDays);

  const blockDates: string[] = [];
  for (let day = currentBlockStartDay; day <= currentBlockEndDay; day++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + (day - 1));
    blockDates.push(d.toISOString().split('T')[0]);
  }

  // Filtered nurses
  const displayedNurses = nurses.filter((nurse) => {
    const matchesSearch =
      nurse.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      nurse.employeeCode.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesNurse = selectedNurseId === 'ALL' || nurse.id === selectedNurseId;
    return matchesSearch && matchesNurse;
  });

  // Filtered assignments for list mode
  const filteredAssignments = assignments.filter((a) => {
    const nurse = nurseMap.get(a.nurseId);
    const nurseName = nurse ? nurse.fullName.toLowerCase() : '';
    const matchesSearch =
      nurseName.includes(searchQuery.toLowerCase()) || a.date.includes(searchQuery);
    const matchesNurse = selectedNurseId === 'ALL' || a.nurseId === selectedNurseId;
    return matchesSearch && matchesNurse;
  });
  filteredAssignments.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden text-xs">
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Version v{version.number} Snapshot Inspector
                </h2>
                {version.isPublished && (
                  <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold font-mono text-[10px]">
                    PUBLISHED
                  </span>
                )}
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
                  {effectiveSchedule?.name || 'Roster Schedule'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 font-sans">
                &ldquo;{version.note || 'Save checkpoint'}&rdquo; · saved by <strong>{version.author}</strong> on {new Date(version.timestamp).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRestore && (
              <button
                type="button"
                onClick={() => {
                  onRestore(version);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium cursor-pointer shadow-xs transition-colors"
                title="Restore this version as active schedule draft"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore Draft</span>
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(version);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-lg font-medium cursor-pointer shadow-2xs transition-colors"
                title="Permanently delete this version"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Delete</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* View Switcher & Filter Bar */}
        <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('GRID')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                viewMode === 'GRID'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Calendar Matrix</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('LIST')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                viewMode === 'LIST'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Shifts List</span>
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="hidden sm:flex items-center gap-3 font-mono text-[11px] text-slate-600">
            <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200">
              Shifts: <strong className="text-slate-900">{assignments.length}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200">
              Leave: <strong className="text-slate-900">{leaveEntries.length}</strong>
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800">
              Locks: <strong>{locks.length}</strong>
            </span>
          </div>

          {/* Controls: Search, Nurse filter, Block navigation */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search staff, date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs"
              />
            </div>

            {/* Nurse dropdown */}
            <select
              value={selectedNurseId}
              onChange={(e) => setSelectedNurseId(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 text-xs cursor-pointer"
            >
              <option value="ALL">All Staff ({nurses.length})</option>
              {nurses.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.fullName} ({n.employeeCode})
                </option>
              ))}
            </select>

            {/* Block Switcher (if grid view and multiple blocks) */}
            {viewMode === 'GRID' && totalBlocks > 1 && (
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                <button
                  type="button"
                  disabled={selectedBlockIndex === 0}
                  onClick={() => setSelectedBlockIndex((p) => p - 1)}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                  title="Previous block"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-mono font-bold text-[11px] text-slate-700">
                  Block {selectedBlockIndex + 1}/{totalBlocks}
                </span>
                <button
                  type="button"
                  disabled={selectedBlockIndex >= totalBlocks - 1}
                  onClick={() => setSelectedBlockIndex((p) => p + 1)}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                  title="Next block"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto bg-slate-50/50 p-4">
          {viewMode === 'GRID' ? (
            /* Calendar Matrix Grid */
            <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                      <th className="py-2.5 px-3 sticky left-0 bg-slate-50 z-20 w-48 border-r border-slate-200">
                        Nursing Staff
                      </th>
                      {blockDates.map((dateStr) => {
                        const dateObj = new Date(dateStr + 'T00:00:00Z');
                        const weekday = WEEKDAY_NAMES[dateObj.getUTCDay()];
                        const dayNum = dateStr.split('-')[2];
                        const isWeekend = dateObj.getUTCDay() === 0 || dateObj.getUTCDay() === 6;

                        return (
                          <th
                            key={dateStr}
                            className={`py-2 px-1 text-center min-w-[76px] border-r border-slate-100 ${
                              isWeekend ? 'bg-slate-100/80 text-slate-800' : ''
                            }`}
                          >
                            <div className="text-[10px] text-slate-400 uppercase font-bold">{weekday}</div>
                            <div className="font-bold text-xs text-slate-900">{dayNum}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedNurses.map((nurse) => (
                      <tr key={nurse.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2 px-3 sticky left-0 bg-white z-10 border-r border-slate-200 shadow-2xs">
                          <div className="font-sans font-bold text-slate-900 truncate">
                            {nurse.fullName}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5">
                            <span>{nurse.employeeCode}</span>
                            <span>·</span>
                            <span>{nurse.contractPercent}%</span>
                          </div>
                        </td>

                        {blockDates.map((dateStr) => {
                          const asgn = assignments.find(
                            (a) => a.nurseId === nurse.id && a.date === dateStr
                          );
                          const leave = leaveEntries.find(
                            (l) =>
                              l.nurseId === nurse.id &&
                              l.approved &&
                              dateStr >= l.startDate &&
                              dateStr <= l.endDate
                          );
                          const isLocked = locks.some(
                            (lk) => lk.nurseId === nurse.id && lk.date === dateStr
                          ) || asgn?.locked;

                          const duty = asgn ? dutyMap.get(asgn.dutyWindowId) : null;
                          const leaveType = leave ? leaveTypeMap.get(leave.leaveTypeId) : null;

                          let targetLabel = '';
                          if (asgn?.doctorId) {
                            const doc = doctorMap.get(asgn.doctorId);
                            targetLabel = doc ? doc.fullName.split(' ')[1] || doc.fullName : 'Doc';
                          } else if (asgn?.clinicalRoleId) {
                            const cr = roleMap.get(asgn.clinicalRoleId);
                            targetLabel = cr ? cr.name : '';
                          } else if (asgn?.specialtyId) {
                            const sp = specialtyMap.get(asgn.specialtyId);
                            targetLabel = sp ? sp.name : '';
                          }

                          return (
                            <td
                              key={dateStr}
                              className="py-1 px-1 border-r border-slate-100 text-center align-middle"
                            >
                              {leave ? (
                                <div
                                  className="p-1 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200"
                                  title={`Approved Leave: ${leaveType?.name || 'Leave'}`}
                                >
                                  <div>{leaveType?.acronym || 'LV'}</div>
                                  <div className="text-[9px] font-normal text-amber-700">Leave</div>
                                </div>
                              ) : asgn && duty ? (
                                <div
                                  className="p-1 rounded text-[10px] font-bold text-white relative shadow-2xs"
                                  style={{ backgroundColor: duty.color }}
                                  title={`${duty.name} (${duty.startTime}–${duty.endTime}) ${targetLabel ? '· ' + targetLabel : ''}`}
                                >
                                  <div className="flex items-center justify-center gap-0.5">
                                    <span>{duty.acronym}</span>
                                    {isLocked && <Lock className="w-2.5 h-2.5 text-white/80 shrink-0" />}
                                  </div>
                                  {targetLabel && (
                                    <div className="text-[9px] font-normal opacity-90 truncate max-w-[68px]">
                                      {targetLabel}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-300 text-[11px]">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Shifts List View */
            <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="sticky top-0 bg-slate-100 text-slate-600 text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-3">Nurse Staff</th>
                    <th className="py-2.5 px-3">Duty Window</th>
                    <th className="py-2.5 px-3">Assigned Clinical Target</th>
                    <th className="py-2.5 px-3">Source</th>
                    <th className="py-2.5 px-4 text-right">Lock Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAssignments.map((a) => {
                    const nurse = nurseMap.get(a.nurseId);
                    const duty = dutyMap.get(a.dutyWindowId);

                    let targetName = 'Specialty Pool';
                    if (a.doctorId) {
                      const doc = doctorMap.get(a.doctorId);
                      targetName = doc ? doc.fullName : 'Doctor';
                    } else if (a.clinicalRoleId) {
                      const role = roleMap.get(a.clinicalRoleId);
                      targetName = role ? role.name : 'Clinical Role';
                    } else if (a.specialtyId) {
                      const spec = specialtyMap.get(a.specialtyId);
                      targetName = spec ? `${spec.name} Pool` : 'Specialty Pool';
                    }

                    return (
                      <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-4 font-bold text-slate-900">{a.date}</td>
                        <td className="py-2 px-3 font-sans font-medium text-slate-900">
                          {nurse?.fullName || a.nurseId}
                        </td>
                        <td className="py-2 px-3">
                          {duty ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="px-1.5 py-0.5 rounded text-white font-bold text-[10px]"
                                style={{ backgroundColor: duty.color }}
                              >
                                {duty.acronym}
                              </span>
                              <span className="text-slate-700">
                                {duty.name} ({duty.startTime}–{duty.endTime})
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-800 font-sans">{targetName}</td>
                        <td className="py-2 px-3 text-[10px] text-slate-500">{a.source}</td>
                        <td className="py-2 px-4 text-right">
                          {a.locked ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-bold text-[10px]">
                              <Lock className="w-3 h-3" /> PINNED LOCK
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">UNLOCKED</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredAssignments.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No assignments match the selected search or staff filters.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-slate-500 text-[11px]">
          <span>
            Snapshot contains {assignments.length} assignments, {leaveEntries.length} leaves, {locks.length} pinned locks
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium cursor-pointer transition-colors shadow-2xs"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
