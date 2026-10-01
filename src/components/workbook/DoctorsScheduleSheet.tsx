import React, { useState, useMemo } from 'react';
import {
  Stethoscope,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  Ban,
  Plus,
  Edit2,
  Filter,
  Search,
  Maximize2,
  Minimize2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Doctor, DoctorSession, Specialty, Schedule, Assignment, Nurse } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import { getRepository } from '../../services/repository';
import { EditDoctorShiftModal } from '../modals/EditDoctorShiftModal';
import {
  saveDoctorShift,
  deleteDoctorShift,
  populateRecurringDoctorSessionsForSchedule,
} from '../../services/schedule/doctorScheduleService';

interface DoctorsScheduleSheetProps {
  doctors: Doctor[];
  sessions: DoctorSession[];
  specialties: Specialty[];
  blockDates: string[];
  schedule?: Schedule | null;
  isAllDaysExpanded?: boolean;
  onToggleExpandDays?: () => void;
  onDoctorsChange?: (next: Doctor[]) => void;
  onSessionsChange?: (next: DoctorSession[]) => void;
  assignments?: Assignment[];
  nurses?: Nurse[];
}

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DoctorsScheduleSheet: React.FC<DoctorsScheduleSheetProps> = ({
  doctors,
  sessions,
  specialties,
  blockDates,
  schedule,
  isAllDaysExpanded,
  onToggleExpandDays,
  onDoctorsChange,
  onSessionsChange,
  assignments,
  nurses,
}) => {
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [localExpanded, setLocalExpanded] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Edit Shift Modal State
  const [selectedCell, setSelectedCell] = useState<{
    doctor: Doctor;
    date: string;
    session: DoctorSession | null;
  } | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const repo = getRepository();

  // Controlled or uncontrolled expansion state
  const isExpanded = isAllDaysExpanded !== undefined ? isAllDaysExpanded : localExpanded;

  const handleToggleExpand = () => {
    if (onToggleExpandDays) {
      onToggleExpandDays();
    } else {
      setLocalExpanded((prev) => !prev);
    }
  };

  // Generate all days in schedule if schedule is provided
  const allScheduleDates = useMemo(() => {
    if (!schedule?.startDate || !schedule?.endDate) return blockDates;
    const s = new Date(schedule.startDate + 'T00:00:00Z');
    const e = new Date(schedule.endDate + 'T00:00:00Z');
    const totalDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const dates: string[] = [];
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(s);
      d.setUTCDate(s.getUTCDate() + (day - 1));
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }, [schedule, blockDates]);

  // If expanded, use all dates of the schedule (or blockDates if already all days)
  const displayedDates = useMemo(() => {
    if (isExpanded) {
      return allScheduleDates.length > 0 ? allScheduleDates : blockDates;
    }
    return blockDates;
  }, [isExpanded, allScheduleDates, blockDates]);

  const specialtyMap = useMemo(() => new Map(specialties.map((s) => [s.id, s])), [specialties]);

  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      const matchesSpecialty = selectedSpecialty === 'ALL' || doc.specialtyIds.includes(selectedSpecialty);
      const matchesSearch =
        !searchQuery ||
        doc.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.specialtyIds.some((sId) => specialtyMap.get(sId)?.name.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesSpecialty && matchesSearch;
    });
  }, [doctors, selectedSpecialty, searchQuery, specialtyMap]);

  // Total active sessions in the displayed date range
  const totalSessionsInView = useMemo(() => {
    const datesSet = new Set(displayedDates);
    return sessions.filter((s) => datesSet.has(s.date) && !s.cancelled).length;
  }, [sessions, displayedDates]);

  // Trigger toast notification
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Cell click handler
  const handleCellClick = (doc: Doctor, dateStr: string) => {
    const sess = sessions.find(
      (s) => s.doctorId === doc.id && s.date === dateStr && !s.cancelled
    ) || null;
    setSelectedCell({ doctor: doc, date: dateStr, session: sess });
    setIsEditModalOpen(true);
  };

  // Save Shift handler (Single date or Recurring pattern)
  const handleSaveShift = async (params: {
    doctorId: string;
    date: string;
    startTime: string;
    endTime: string;
    room: string;
    specialtyId: string;
    updateScope: 'THIS_DATE_ONLY' | 'RECURRING_ALL_MATCHING_DAYS';
  }) => {
    const doc = doctors.find((d) => d.id === params.doctorId);
    if (!doc) return;

    const existingSession = sessions.find(
      (s) => s.doctorId === params.doctorId && s.date === params.date && !s.cancelled
    );

    const result = await saveDoctorShift({
      repo,
      doctor: doc,
      date: params.date,
      startTime: params.startTime,
      endTime: params.endTime,
      room: params.room,
      specialtyId: params.specialtyId,
      updateScope: params.updateScope,
      schedule,
      existingSession,
    });

    if (onSessionsChange) {
      onSessionsChange(result.allSessions);
    }
    if (onDoctorsChange && result.updatedDoctor) {
      const nextDocs = doctors.map((d) =>
        d.id === result.updatedDoctor.id ? result.updatedDoctor : d
      );
      onDoctorsChange(nextDocs);
    }

    triggerToast(result.message);
  };

  // Delete Shift handler (Single date or Recurring pattern)
  const handleDeleteShift = async (params: {
    sessionId?: string;
    doctorId: string;
    date: string;
    deleteScope: 'THIS_DATE_ONLY' | 'REMOVE_RECURRING_PATTERN';
  }) => {
    const doc = doctors.find((d) => d.id === params.doctorId);
    if (!doc) return;

    const result = await deleteDoctorShift({
      repo,
      doctor: doc,
      date: params.date,
      sessionId: params.sessionId,
      deleteScope: params.deleteScope,
      schedule,
    });

    if (onSessionsChange) {
      onSessionsChange(result.allSessions);
    }
    if (onDoctorsChange && result.updatedDoctor) {
      const nextDocs = doctors.map((d) =>
        d.id === result.updatedDoctor.id ? result.updatedDoctor : d
      );
      onDoctorsChange(nextDocs);
    }

    triggerToast(result.message);
  };

  // Sync Recurring Patterns across active schedule duration
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const handleSyncRecurringPatterns = async () => {
    if (!schedule?.startDate || !schedule?.endDate) return;
    setIsSyncing(true);
    try {
      const result = await populateRecurringDoctorSessionsForSchedule({
        repo,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        doctors,
      });

      const updatedSessions = await repo.list('doctorSessions');
      if (onSessionsChange) {
        onSessionsChange(updatedSessions);
      }

      triggerToast(
        result.createdCount > 0
          ? `Synced ${result.createdCount} recurring doctor sessions (${result.existingCount} already existed) across schedule duration.`
          : `All ${result.totalSessions} recurring doctor sessions are already present for this period.`
      );
    } catch (err: any) {
      console.error('Failed to sync recurring doctor patterns:', err);
      triggerToast(`Sync failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 select-none overflow-hidden relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Filter & Expansion Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <Stethoscope className="w-4 h-4 text-indigo-600" />
            <span>Doctors&apos; Clinic Sessions Schedule</span>
          </div>
          <span className="px-2 py-0.5 rounded font-mono text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            {totalSessionsInView} Sessions
          </span>
          <span className="text-slate-400 hidden sm:inline">·</span>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono hidden md:flex">
            <span>Click any cell to edit shift</span>
            <span className="text-slate-300">|</span>
            <span className="text-indigo-600 font-bold">↻ Recurring</span>
            <span className="text-slate-300">|</span>
            <span className="text-amber-600 font-bold">★ Override</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Doctor */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search doctor..."
              className="pl-7 pr-2.5 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36"
            />
          </div>

          {/* Specialty Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[11px]">Specialty:</span>
            <select
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
              className="px-2 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Specialties ({specialties.length})</option>
              {specialties.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name} ({sp.code})
                </option>
              ))}
            </select>
          </div>

          {/* Expand All Days Option */}
          <button
            type="button"
            onClick={handleToggleExpand}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded border text-xs font-semibold cursor-pointer transition-colors shadow-2xs ${
              isExpanded
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700 shadow-xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
            }`}
            title={
              isExpanded
                ? 'Switch back to single block view'
                : 'Expand doctors schedule to view all days in the entire schedule period'
            }
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{isExpanded ? `All Days (${displayedDates.length}d) ✓` : 'Expand All Days'}</span>
          </button>

          {/* Sync Recurring Patterns Option */}
          {schedule?.startDate && schedule?.endDate && (
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleSyncRecurringPatterns}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
              title="Populate and refresh all active doctors' recurring weekly clinic sessions across the schedule duration"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Recurring Patterns'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid Viewport */}
      <div className="flex-1 overflow-auto p-px bg-slate-200">
        <table className="border-collapse bg-white text-xs w-max min-w-full">
          <thead className="sticky top-0 z-30 bg-slate-100 border-b border-slate-300">
            <tr className="bg-slate-50 text-slate-700">
              <th className="sticky left-0 bg-slate-50 z-40 border-r border-slate-300 py-1.5 px-3 text-left font-semibold text-slate-800 w-52 shadow-xs">
                <div className="flex items-center justify-between">
                  <span>Doctor / Department</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {filteredDoctors.length} docs
                  </span>
                </div>
              </th>
              {displayedDates.map((dateStr) => {
                const dateObj = new Date(dateStr + 'T00:00:00Z');
                const day = dateObj.getUTCDate();
                const weekday = dateObj.getUTCDay();
                const isWeekend = weekday === 5 || weekday === 6;

                return (
                  <th
                    key={dateStr}
                    className={`py-1 px-1 text-center font-mono border-r border-slate-200 min-w-[76px] ${
                      isWeekend ? 'bg-slate-200/70 text-slate-800' : 'bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-[10px] font-normal leading-tight">
                      {WEEKDAY_ABBR[weekday]}
                    </div>
                    <div className="text-xs font-bold">{day}</div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 font-mono">
            {filteredDoctors.map((doc) => {
              const docSpecialty = specialties.find((s) => doc.specialtyIds.includes(s.id));

              // Count doctor sessions across the displayed dates
              const docSessionsInView = sessions.filter(
                (s) => s.doctorId === doc.id && displayedDates.includes(s.date) && !s.cancelled
              ).length;

              return (
                <tr key={doc.id} className="hover:bg-slate-50/60">
                  <td className="sticky left-0 bg-white z-20 border-r border-slate-300 py-1 px-3 text-left w-52 shadow-xs">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="truncate">
                        <span className="font-semibold text-slate-900 block text-xs truncate">
                          {doc.fullName}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono truncate block">
                          {docSpecialty?.name || 'General Clinic'}
                        </span>
                      </div>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600 shrink-0"
                        title={`${docSessionsInView} session${docSessionsInView === 1 ? '' : 's'} scheduled`}
                      >
                        {docSessionsInView}
                      </span>
                    </div>
                  </td>

                  {displayedDates.map((dateStr) => {
                    const sess = sessions.find(
                      (s) => s.doctorId === doc.id && s.date === dateStr && !s.cancelled
                    );
                    const pairedAssignment = assignments?.find(
                      (a) => a.kind === 'DOCTOR' && a.doctorId === doc.id && a.date === dateStr
                    );
                    const pairedNurse = pairedAssignment ? nurses?.find((n) => n.id === pairedAssignment.nurseId) : null;
                    const nursePref = pairedNurse?.preferences?.find((p) => p.kind === 'DOCTOR' && p.refId === doc.id);
                    const nurseSpecPref = !nursePref && pairedNurse && doc.specialtyIds
                      ? pairedNurse.preferences?.find(
                          (p) =>
                            p.kind === 'SPECIALTY' &&
                            (doc.specialtyIds.includes(p.refId) ||
                              doc.specialtyIds.some((sid) => p.refId.toLowerCase().includes(sid.toLowerCase()) || sid.toLowerCase().includes(p.refId.toLowerCase())))
                        )
                      : null;

                    const nurseHasSpecificAllocations = pairedNurse?.preferences?.some(
                      (p) => p.kind === 'DOCTOR' || p.kind === 'SPECIALTY'
                    );
                    const isAllocationMismatch = pairedNurse && nurseHasSpecificAllocations && !nursePref && !nurseSpecPref;

                    const priorityBadge = isAllocationMismatch
                      ? 'Mismatch'
                      : nursePref
                      ? `P${nursePref.rank}`
                      : nurseSpecPref
                      ? `P${nurseSpecPref.rank}`
                      : pairedNurse
                      ? 'Pool'
                      : null;

                    const nurseRankDesc = isAllocationMismatch
                      ? `⚠ Allocation Mismatch: ${pairedNurse?.fullName} is not allocated to Dr. ${doc.fullName.replace('Dr. ', '')} or this department`
                      : nursePref
                      ? `Assigned Doctor Priority #${nursePref.rank}`
                      : nurseSpecPref
                      ? `Specialty Match Priority #${nurseSpecPref.rank}`
                      : 'General Pool';

                    return (
                      <td
                        key={dateStr}
                        className="border-r border-b border-slate-200 p-0.5 text-center h-11"
                      >
                        {sess ? (
                          <div
                            onClick={() => handleCellClick(doc, dateStr)}
                            className={`w-full h-full rounded p-1 flex flex-col justify-center text-[10px] leading-tight cursor-pointer transition-all shadow-2xs group relative ${
                              isAllocationMismatch
                                ? 'bg-rose-50 border border-rose-300 text-rose-950 hover:bg-rose-100'
                                : 'bg-indigo-50 border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-100/90 text-indigo-900'
                            }`}
                            title={`Click to edit shift: ${sess.startTime}–${sess.endTime} in ${sess.room || 'Suite 101'} (${sess.source === 'PATTERN' ? 'Recurring Pattern' : 'Single Day Override'})${pairedNurse ? `\nPaired Nurse: ${pairedNurse.fullName} (${nurseRankDesc})` : '\nNo nurse currently paired'}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold font-mono">
                                {sess.startTime.substring(0, 2)}–{sess.endTime.substring(0, 2)}
                              </span>
                              <div className="flex items-center gap-0.5">
                                {priorityBadge && (
                                  <span
                                    className={`text-[8px] font-bold px-1 py-0.2 rounded ${
                                      priorityBadge === 'Mismatch'
                                        ? 'bg-rose-100 text-rose-800 border border-rose-300 font-extrabold'
                                        : priorityBadge === 'P1'
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : priorityBadge === 'P2'
                                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                        : 'bg-slate-100 text-slate-700 border border-slate-300'
                                    }`}
                                    title={`Paired Nurse: ${pairedNurse?.fullName} (${nurseRankDesc})`}
                                  >
                                    {priorityBadge}
                                  </span>
                                )}
                                {sess.source === 'PATTERN' ? (
                                  <span
                                    className="text-[9px] text-indigo-600 font-bold"
                                    title="Recurring weekly pattern"
                                  >
                                    ↻
                                  </span>
                                ) : (
                                  <span
                                    className="text-[9px] text-amber-600 font-bold"
                                    title="Single day override"
                                  >
                                    ★
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-slate-500 mt-0.5">
                              <span className="truncate max-w-[50px] font-medium text-slate-700">
                                {pairedNurse ? pairedNurse.fullName.split(' ')[0] : (sess.room || 'Room')}
                              </span>
                              <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-indigo-600 transition-opacity shrink-0 ml-0.5" />
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => handleCellClick(doc, dateStr)}
                            className="w-full h-full flex items-center justify-center text-slate-300 hover:text-indigo-600 hover:bg-indigo-50/70 rounded cursor-pointer transition-colors group"
                            title={`Click to schedule shift for ${doc.fullName} on ${formatDate(dateStr)}`}
                          >
                            <Plus className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500" />
                            <span className="group-hover:hidden">·</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Doctor Shift Modal */}
      {selectedCell && (
        <EditDoctorShiftModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedCell(null);
          }}
          doctor={selectedCell.doctor}
          date={selectedCell.date}
          existingSession={selectedCell.session}
          specialties={specialties}
          schedule={schedule || null}
          onSaveShift={handleSaveShift}
          onDeleteShift={handleDeleteShift}
        />
      )}
    </div>
  );
};
