import React, { useState } from 'react';
import {
  CalendarCheck2,
  Lock,
  Plus,
  Trash2,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { LeaveEntry, LockEntry, Nurse, LeaveType, DutyWindow } from '../../types';
import { formatDate } from '../../utils/dateUtils';

interface LeaveAndLocksSheetProps {
  scheduleStartDate: string;
  scheduleEndDate: string;
  leaveEntries: LeaveEntry[];
  locks: LockEntry[];
  nurses: Nurse[];
  leaveTypes: LeaveType[];
  dutyWindows: DutyWindow[];
  onGoToCell?: (nurseId: string, date: string) => void;
  onRemoveLock?: (id: string) => void;
  onRemoveLeave?: (id: string) => void;
}

export const LeaveAndLocksSheet: React.FC<LeaveAndLocksSheetProps> = ({
  scheduleStartDate,
  scheduleEndDate,
  leaveEntries,
  locks,
  nurses,
  leaveTypes,
  dutyWindows,
  onGoToCell,
  onRemoveLock,
  onRemoveLeave,
}) => {
  const [filterType, setFilterType] = useState<'ALL' | 'LEAVE' | 'LOCKS'>('ALL');

  const nurseMap = new Map(nurses.map((n) => [n.id, n]));
  const leaveTypeMap = new Map(leaveTypes.map((l) => [l.id, l]));

  const intersectingLeave = leaveEntries.filter(
    (le) => !(le.endDate < scheduleStartDate || le.startDate > scheduleEndDate)
  );

  const intersectingLocks = locks.filter(
    (l) => l.date >= scheduleStartDate && l.date <= scheduleEndDate
  );

  return (
    <div className="flex flex-col h-full bg-slate-100 select-none overflow-hidden text-xs">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <CalendarCheck2 className="w-4 h-4 text-indigo-600" />
          <span className="font-bold text-slate-800">
            Leave &amp; Pinned Locks Ledger ({intersectingLeave.length} leave, {intersectingLocks.length} locks)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-2.5 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
          >
            <option value="ALL">All Entries</option>
            <option value="LEAVE">Leave Only</option>
            <option value="LOCKS">Locks Only</option>
          </select>
        </div>
      </div>

      {/* Table Ledger */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {(filterType === 'ALL' || filterType === 'LOCKS') && (
          <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
            <div className="p-2.5 bg-amber-50/70 border-b border-amber-200 flex items-center gap-1.5 text-amber-900 font-bold">
              <Lock className="w-3.5 h-3.5 text-amber-700" />
              <span>Pinned Non-Changeable Shift Locks ({intersectingLocks.length})</span>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-medium">
                <tr>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Nurse</th>
                  <th className="py-2 px-3">Mode</th>
                  <th className="py-2 px-3">Duty / Target</th>
                  <th className="py-2 px-3">Note</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {intersectingLocks.map((lock) => (
                  <tr key={lock.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-slate-800">{formatDate(lock.date)}</td>
                    <td className="py-2 px-3 text-slate-900">
                      {nurseMap.get(lock.nurseId)?.fullName}
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">
                        {lock.mode}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {lock.dutyWindowId ? dutyWindows.find((d) => d.id === lock.dutyWindowId)?.name : '—'}
                    </td>
                    <td className="py-2 px-3 text-slate-400 italic font-sans">{lock.note || '—'}</td>
                    <td className="py-2 px-3 text-right">
                      {onGoToCell && (
                        <button
                          onClick={() => onGoToCell(lock.nurseId, lock.date)}
                          className="text-indigo-600 hover:text-indigo-800 font-sans cursor-pointer text-xs"
                        >
                          Jump to cell
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(filterType === 'ALL' || filterType === 'LEAVE') && (
          <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
            <div className="p-2.5 bg-blue-50/70 border-b border-blue-200 flex items-center gap-1.5 text-blue-900 font-bold">
              <CalendarCheck2 className="w-3.5 h-3.5 text-blue-700" />
              <span>Approved Staff Leave ({intersectingLeave.length})</span>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-medium">
                <tr>
                  <th className="py-2 px-3">Dates</th>
                  <th className="py-2 px-3">Nurse</th>
                  <th className="py-2 px-3">Leave Type</th>
                  <th className="py-2 px-3">Credited Hours</th>
                  <th className="py-2 px-3">Note</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {intersectingLeave.map((le) => {
                  const lt = leaveTypeMap.get(le.leaveTypeId);
                  return (
                    <tr key={le.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-slate-800">
                        {formatDate(le.startDate)} to {formatDate(le.endDate)}
                      </td>
                      <td className="py-2 px-3 text-slate-900">
                        {nurseMap.get(le.nurseId)?.fullName}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className="px-1.5 py-0.2 rounded text-white font-bold text-[10px]"
                          style={{ backgroundColor: lt?.color || '#f59e0b' }}
                        >
                          {lt?.acronym} - {lt?.name}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-700 font-bold">
                        {le.hoursCredited}h
                      </td>
                      <td className="py-2 px-3 text-slate-400 italic font-sans">{le.note || '—'}</td>
                      <td className="py-2 px-3 text-right">
                        {onGoToCell && (
                          <button
                            onClick={() => onGoToCell(le.nurseId, le.startDate)}
                            className="text-indigo-600 hover:text-indigo-800 font-sans cursor-pointer text-xs"
                          >
                            Jump to cell
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
