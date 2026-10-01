/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Schedule Version History Center (Phase 10 & 16)
 * Complete interactive historical snapshot studio with calendar matrix inspection,
 * diff audit, non-destructive restore, and permanent deletion with verification prompt.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  RotateCcw,
  Eye,
  CheckCircle2,
  Calendar,
  User,
  ArrowRight,
  Shield,
  FileSpreadsheet,
  AlertTriangle,
  Diff,
  Download,
  Filter,
  Search,
  Sparkles,
  Layers,
  Clock,
  Trash2,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Lock,
  Droplets,
  Info,
  Maximize2,
  Check,
} from 'lucide-react';
import { ClinicContextState } from '../../types/navigation';
import { getRepository } from '../../services/repository';
import { syncScheduleAssignments } from '../../services/repository/assignmentSync';
import {
  Schedule,
  ScheduleVersion,
  Assignment,
  Nurse,
  DutyWindow,
  Doctor,
  DoctorSession,
  ClinicalRole,
  Specialty,
  LeaveEntry,
  LeaveType,
  SeniorityLevel,
  Rule,
} from '../../types';
import {
  computeScheduleDiff,
  ScheduleVersionDiff,
} from '../../services/history/diffEngine';
import { VersionCompareModal } from '../modals/VersionCompareModal';
import { VersionViewModal } from '../modals/VersionViewModal';
import { ExportModal } from '../modals/ExportModal';
import { DeleteVersionModal } from '../modals/DeleteVersionModal';
import { DeleteScheduleModal } from '../modals/DeleteScheduleModal';
import { deleteEntireSchedule } from '../../services/schedule/scheduleDeletionService';

interface HistoryViewProps {
  context: ClinicContextState;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const HistoryView: React.FC<HistoryViewProps> = ({ context }) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [activeAssignments, setActiveAssignments] = useState<Assignment[]>([]);
  const [versions, setVersions] = useState<ScheduleVersion[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [dutyWindows, setDutyWindows] = useState<DutyWindow[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [sessions, setSessions] = useState<DoctorSession[]>([]);
  const [roles, setClinicalRoles] = useState<ClinicalRole[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [leaveEntries, setLeaveEntries] = useState<LeaveEntry[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [seniorityLevels, setSeniorityLevels] = useState<SeniorityLevel[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);

  // Selected Version for inspection
  const [selectedVersion, setSelectedVersion] = useState<ScheduleVersion | null>(null);

  // Studio tabs: Roster Matrix, Diff vs Draft, Shifts List, Snapshot Metadata
  const [studioTab, setStudioTab] = useState<'MATRIX' | 'DIFF' | 'SHIFTS' | 'INFO'>('MATRIX');

  // Matrix controls
  const [matrixBlockIndex, setMatrixBlockIndex] = useState<number>(0);
  const [matrixShowAllDates, setMatrixShowAllDates] = useState<boolean>(false);
  const [matrixNurseFilter, setMatrixNurseFilter] = useState<string>('ALL');
  const [matrixSearchQuery, setMatrixSearchQuery] = useState<string>('');

  // Version Timeline Filters
  const [versionSearch, setVersionSearch] = useState<string>('');
  const [versionTypeFilter, setVersionTypeFilter] = useState<'ALL' | 'PUBLISHED' | 'RESTORED'>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // Sort from earliest to latest
  const [allAssignments, setAllAssignments] = useState<Assignment[]>([]);

  // Modals
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [compareBaseId, setCompareBaseId] = useState<string | undefined>(undefined);
  const [compareTargetId, setCompareTargetId] = useState<string | undefined>(undefined);

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [versionToView, setVersionToView] = useState<ScheduleVersion | null>(null);

  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [versionToRestore, setVersionToRestore] = useState<ScheduleVersion | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<ScheduleVersion | null>(null);

  const [isDeleteScheduleModalOpen, setIsDeleteScheduleModalOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const repo = getRepository();

  const loadData = async () => {
    try {
      const [
        schedList,
        asgnList,
        vList,
        nList,
        dwList,
        dList,
        sessList,
        crList,
        spList,
        leList,
        ltList,
        sList,
        rList,
      ] = await Promise.all([
        repo.list('schedules'),
        repo.list('assignments'),
        repo.list('versions'),
        repo.list('nurses'),
        repo.list('dutyWindows'),
        repo.list('doctors'),
        repo.list('doctorSessions'),
        repo.list('clinicalRoles'),
        repo.list('specialties'),
        repo.list('leaveEntries'),
        repo.list('leaveTypes'),
        repo.list('seniorityLevels'),
        repo.list('rules'),
      ]);

      const uniqueSchedules = Array.from(new Map(schedList.map((s) => [s.id, s])).values());
      setSchedules(uniqueSchedules);
      setNurses(nList);
      setDutyWindows(dwList);
      setDoctors(dList);
      setSessions(sessList);
      setClinicalRoles(crList);
      setSpecialties(spList);
      setLeaveEntries(leList);
      setLeaveTypes(ltList);
      setSeniorityLevels(sList);
      setRules(rList);
      setAllAssignments(asgnList);

      // Allow all previous versions to be viewed in the checkpoint timeline
      setVersions(vList);

      const current =
        schedList.find((s) => s.id === context.activeScheduleId) || schedList[0];
      if (current) {
        setActiveSchedule(current);
        const schedAsgns = asgnList.filter((a) => a.scheduleId === current.id);
        setActiveAssignments(schedAsgns);
      }

      if (vList.length > 0 && !selectedVersion) {
        setSelectedVersion(vList[0]);
      }
    } catch (err) {
      console.error('Error loading version history:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When selectedVersion changes, sync activeSchedule and activeAssignments to this version's schedule
  useEffect(() => {
    if (selectedVersion) {
      const schedId = selectedVersion.scheduleId;
      const sched = schedules.find((s) => s.id === schedId);
      if (sched) {
        setActiveSchedule(sched);
      }
      const schedAsgns = allAssignments.filter((a) => a.scheduleId === schedId);
      setActiveAssignments(schedAsgns);
    }
  }, [selectedVersion, allAssignments, schedules]);

  const triggerToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleScheduleChange = (schedId: string) => {
    const found = schedules.find((s) => s.id === schedId);
    if (found) {
      setActiveSchedule(found);
      setMatrixBlockIndex(0);
      repo.list('assignments').then((asgns) => {
        setActiveAssignments(asgns.filter((a) => a.scheduleId === found.id));
      });
      repo.list('versions').then((vList) => {
        const schedVersions = vList
          .filter((v) => v.scheduleId === found.id)
          .sort((a, b) => b.number - a.number);
        setVersions(schedVersions);
        if (schedVersions.length > 0) {
          setSelectedVersion(schedVersions[0]);
        } else {
          setSelectedVersion(null);
        }
      });
    }
  };

  // Safe non-destructive restore
  const handleConfirmRestore = async () => {
    if (!activeSchedule || !versionToRestore) return;

    try {
      const nextVerNumber = (activeSchedule.activeVersionNumber || 1) + 1;

      // 1. Update Schedule active version number
      await repo.update('schedules', activeSchedule.id, {
        activeVersionNumber: nextVerNumber,
        updatedAt: new Date().toISOString(),
      });

      // 2. Overwrite active assignments with the snapshot assignments
      const restoredAssignments = versionToRestore.snapshot.assignments;
      await syncScheduleAssignments(repo, activeSchedule.id, restoredAssignments);

      // 3. Create a brand new version documenting the restore
      await repo.create('versions', {
        scheduleId: activeSchedule.id,
        number: nextVerNumber,
        timestamp: new Date().toISOString(),
        author: context.currentUser?.name || 'Dr. Fatima (Admin)',
        note: `Restored from version ${versionToRestore.number} ("${versionToRestore.note || 'Snapshot'}")`,
        snapshot: versionToRestore.snapshot,
        isPublished: false,
      });

      // 4. Record audit event
      await repo.create('audit', {
        actor: context.currentUser?.name || 'Admin',
        action: 'RESTORE',
        entity: 'Schedule',
        entityId: activeSchedule.id,
        before: { version: activeSchedule.activeVersionNumber },
        note: `Restored to state of v${versionToRestore.number}`,
        timestamp: new Date().toISOString(),
      });

      triggerToast(`Restored v${versionToRestore.number} as new version v${nextVerNumber}.`);
      setIsRestoreModalOpen(false);
      setVersionToRestore(null);
      await loadData();
    } catch (err: any) {
      alert(`Restore failed: ${err.message}`);
    }
  };

  // Safe permanent deletion after verification
  const handleConfirmDelete = async (ver: ScheduleVersion) => {
    try {
      const deletedNumber = ver.number;
      const deletedId = ver.id;

      // 1. Remove from repository
      await repo.remove('versions', deletedId);

      // 2. Log in audit ledger
      await repo.create('audit', {
        actor: context.currentUser?.name || 'Admin',
        action: 'DELETE',
        entity: 'ScheduleVersion',
        entityId: deletedId,
        note: `Permanently deleted version checkpoint v${deletedNumber} ("${ver.note || 'No note'}")`,
        timestamp: new Date().toISOString(),
      });

      // 3. Update local state
      const updatedVersions = versions.filter((v) => v.id !== deletedId);
      setVersions(updatedVersions);

      if (selectedVersion?.id === deletedId) {
        setSelectedVersion(updatedVersions.length > 0 ? updatedVersions[0] : null);
      }

      setIsDeleteModalOpen(false);
      setVersionToDelete(null);
      triggerToast(`Version v${deletedNumber} permanently deleted.`);
    } catch (err: any) {
      console.error('Delete failed:', err);
      alert(`Delete failed: ${err.message || 'Unknown error'}`);
    }
  };

  // Safe permanent deletion of an entire schedule period
  const handleConfirmDeleteSchedule = async (sched: Schedule) => {
    try {
      const result = await deleteEntireSchedule(repo, sched.id, context.currentUser?.name || 'Admin');

      const remainingSchedules = schedules.filter((s) => s.id !== sched.id);
      setSchedules(remainingSchedules);

      setIsDeleteScheduleModalOpen(false);
      setScheduleToDelete(null);
      triggerToast(`Schedule "${result.scheduleName}" and all associated versions were permanently deleted.`);

      if (activeSchedule?.id === sched.id) {
        if (remainingSchedules.length > 0) {
          handleScheduleChange(remainingSchedules[0].id);
        } else {
          setActiveSchedule(null);
          setActiveAssignments([]);
          setVersions([]);
          setSelectedVersion(null);
        }
      }
    } catch (err: any) {
      console.error('Delete schedule failed:', err);
      alert(`Delete schedule failed: ${err.message || 'Unknown error'}`);
    }
  };

  // Compare helpers
  const handleOpenCompareWithDraft = (version: ScheduleVersion) => {
    setCompareBaseId(version.id);
    setCompareTargetId('DRAFT');
    setIsCompareModalOpen(true);
  };

  const handleOpenCompareTwoVersions = (baseVer: ScheduleVersion, targetVer: ScheduleVersion) => {
    setCompareBaseId(baseVer.id);
    setCompareTargetId(targetVer.id);
    setIsCompareModalOpen(true);
  };

  const handleOpenViewSnapshot = (version: ScheduleVersion) => {
    setVersionToView(version);
    setIsViewModalOpen(true);
  };

  // Live diff computation between selected version and current active draft
  const selectedVsDraftDiff: ScheduleVersionDiff | null = useMemo(() => {
    if (!selectedVersion) return null;
    return computeScheduleDiff(
      selectedVersion.snapshot.assignments || [],
      activeAssignments,
      nurses,
      dutyWindows,
      doctors,
      roles,
      specialties,
      `v${selectedVersion.number}`,
      'Active Draft'
    );
  }, [
    selectedVersion,
    activeAssignments,
    nurses,
    dutyWindows,
    doctors,
    roles,
    specialties,
  ]);

  // Lookup dictionaries
  const dutyMap = useMemo(() => new Map(dutyWindows.map((d) => [d.id, d])), [dutyWindows]);
  const nurseMap = useMemo(() => new Map(nurses.map((n) => [n.id, n])), [nurses]);
  const doctorMap = useMemo(() => new Map(doctors.map((d) => [d.id, d])), [doctors]);
  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const specialtyMap = useMemo(() => new Map(specialties.map((s) => [s.id, s])), [specialties]);
  const seniorityMap = useMemo(() => new Map(seniorityLevels.map((s) => [s.id, s])), [seniorityLevels]);
  const leaveTypeMap = useMemo(() => new Map(leaveTypes.map((l) => [l.id, l])), [leaveTypes]);

  // Available years from versions history
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    versions.forEach((v) => {
      if (v.timestamp) {
        const y = new Date(v.timestamp).getFullYear().toString();
        if (!isNaN(Number(y)) && y.length === 4) yearsSet.add(y);
      }
      if (v.snapshot?.schedule?.startDate) {
        const y = v.snapshot.schedule.startDate.split('-')[0];
        if (y && !isNaN(Number(y)) && y.length === 4) yearsSet.add(y);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [versions]);

  // Filter and sort versions for timeline rail
  const filteredVersions = useMemo(() => {
    return versions
      .filter((ver) => {
        const q = versionSearch.toLowerCase().trim();
        const schedName = (ver.snapshot?.schedule?.name || '').toLowerCase();
        const matchesSearch =
          !q ||
          ver.note?.toLowerCase().includes(q) ||
          ver.author.toLowerCase().includes(q) ||
          `v${ver.number}`.includes(q) ||
          schedName.includes(q);

        const matchesType =
          versionTypeFilter === 'ALL' ||
          (versionTypeFilter === 'PUBLISHED' && ver.isPublished) ||
          (versionTypeFilter === 'RESTORED' && ver.note?.toLowerCase().includes('restored'));

        let matchesYear = true;
        if (selectedYear !== 'ALL') {
          const verYear = new Date(ver.timestamp).getFullYear().toString();
          const schedYear = ver.snapshot?.schedule?.startDate?.split('-')[0];
          matchesYear = verYear === selectedYear || schedYear === selectedYear;
        }

        return matchesSearch && matchesType && matchesYear;
      })
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        if (sortOrder === 'asc') {
          // Earliest to latest
          return timeA - timeB || a.number - b.number;
        } else {
          // Latest to earliest
          return timeB - timeA || b.number - a.number;
        }
      });
  }, [versions, versionSearch, versionTypeFilter, selectedYear, sortOrder]);

  // Compute block dates for Calendar Matrix inspection
  const effectiveSchedule = selectedVersion?.snapshot.schedule || activeSchedule;
  const blockWeeks = effectiveSchedule?.blockWeeks || 2;
  const daysPerBlock = blockWeeks * 7;

  const { blockDates, totalBlocks } = useMemo(() => {
    if (!effectiveSchedule) return { blockDates: [], totalBlocks: 1 };
    const start = new Date(effectiveSchedule.startDate + 'T00:00:00Z');
    const end = new Date(effectiveSchedule.endDate + 'T00:00:00Z');
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const numBlocks = Math.max(1, Math.ceil(totalDays / daysPerBlock));

    if (matrixShowAllDates) {
      const all: string[] = [];
      for (let day = 1; day <= totalDays; day++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + (day - 1));
        all.push(d.toISOString().split('T')[0]);
      }
      return { blockDates: all, totalBlocks: numBlocks };
    }

    const startDay = matrixBlockIndex * daysPerBlock + 1;
    const endDay = Math.min((matrixBlockIndex + 1) * daysPerBlock, totalDays);
    const dates: string[] = [];
    for (let day = startDay; day <= endDay; day++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + (day - 1));
      dates.push(d.toISOString().split('T')[0]);
    }
    return { blockDates: dates, totalBlocks: numBlocks };
  }, [effectiveSchedule, matrixBlockIndex, matrixShowAllDates, daysPerBlock]);

  // Filter nurses for matrix view
  const matrixDisplayedNurses = useMemo(() => {
    return nurses.filter((nurse) => {
      const q = matrixSearchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        nurse.fullName.toLowerCase().includes(q) ||
        nurse.employeeCode.toLowerCase().includes(q);
      const matchesSelect = matrixNurseFilter === 'ALL' || nurse.id === matrixNurseFilter;
      return matchesSearch && matchesSelect;
    });
  }, [nurses, matrixSearchQuery, matrixNurseFilter]);

  // Stepper navigation helpers (based on current filtered and sorted list)
  const currentVersionIndex = useMemo(() => {
    if (!selectedVersion) return -1;
    return filteredVersions.findIndex((v) => v.id === selectedVersion.id);
  }, [filteredVersions, selectedVersion]);

  const prevVersion = currentVersionIndex > 0 ? filteredVersions[currentVersionIndex - 1] : null;
  const nextVersion =
    currentVersionIndex >= 0 && currentVersionIndex < filteredVersions.length - 1
      ? filteredVersions[currentVersionIndex + 1]
      : null;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5 select-none">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{notification}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Schedule Version History Center
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
              {filteredVersions.length} of {versions.length} Snapshots
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Inspect historical roster matrices, review cell-by-cell delta audits, compare drafts, and restore or purge checkpoints across all clinic schedules.
          </p>
        </div>

        {/* Header Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Year Filter Quick Select */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs shadow-2xs hover:border-slate-300 transition-colors">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-500 font-medium text-[11px]">Year:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer text-xs"
              title="Filter versions by year"
            >
              <option value="ALL">All Years ({versions.length})</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Order Toggle: Earliest to Latest / Latest to Earliest */}
          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
            title={
              sortOrder === 'asc'
                ? 'Sorted Earliest to Latest. Click to sort Latest to Earliest.'
                : 'Sorted Latest to Earliest. Click to sort Earliest to Latest.'
            }
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600" />
            <span>{sortOrder === 'asc' ? 'Earliest to Latest' : 'Latest to Earliest'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCompareBaseId(versions[0]?.id || 'DRAFT');
              setCompareTargetId('DRAFT');
              setIsCompareModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
          >
            <Diff className="w-3.5 h-3.5" />
            <span>Compare Any Versions</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Versions Timeline (Left 4 Cols) + Interactive Snapshot Studio (Right 8 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Version History Rail (4 Cols) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            {/* Timeline Filter Header */}
            <div className="p-3 border-b border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Checkpoints Timeline</span>
                </span>
                <span className="text-[11px] text-slate-500 font-mono font-medium">
                  {filteredVersions.length} of {versions.length}
                </span>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by note, author, v#..."
                  value={versionSearch}
                  onChange={(e) => setVersionSearch(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Filter chips */}
              <div className="flex items-center gap-1 text-[10px] font-medium pt-0.5">
                <button
                  type="button"
                  onClick={() => setVersionTypeFilter('ALL')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    versionTypeFilter === 'ALL'
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  All ({versions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setVersionTypeFilter('PUBLISHED')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    versionTypeFilter === 'PUBLISHED'
                      ? 'bg-purple-600 text-white font-bold'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Published ({versions.filter((v) => v.isPublished).length})
                </button>
                <button
                  type="button"
                  onClick={() => setVersionTypeFilter('RESTORED')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    versionTypeFilter === 'RESTORED'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Restored ({versions.filter((v) => v.note?.toLowerCase().includes('restored')).length})
                </button>
              </div>

              {/* Year Filter & Sort Toggle in Timeline Header */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-slate-500 font-semibold text-[10px] uppercase tracking-wider">Year:</span>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="ALL">All Years ({versions.length})</option>
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr} ({versions.filter((v) => new Date(v.timestamp).getFullYear().toString() === yr).length})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-[10px] font-semibold cursor-pointer transition-colors shadow-2xs"
                  title={
                    sortOrder === 'asc'
                      ? 'Currently sorted Earliest to Latest (Click for Latest to Earliest)'
                      : 'Currently sorted Latest to Earliest (Click for Earliest to Latest)'
                  }
                >
                  <ArrowUpDown className="w-3 h-3 text-indigo-600" />
                  <span>{sortOrder === 'asc' ? 'Earliest → Latest' : 'Latest → Earliest'}</span>
                </button>
              </div>
            </div>

            {/* Version Cards Scrollable List */}
            <div className="divide-y divide-slate-100 max-h-[660px] overflow-y-auto">
              {filteredVersions.map((ver, idx) => {
                const isSelected = selectedVersion?.id === ver.id;
                const isCurrentDraft = ver.number === activeSchedule?.activeVersionNumber;
                const prevVer = versions[idx + 1];

                const shiftCount = ver.snapshot.assignments?.length || 0;
                const leaveCount = ver.snapshot.leaveEntries?.length || 0;
                const lockCount = ver.snapshot.locks?.length || 0;
                const schedName = ver.snapshot?.schedule?.name;

                return (
                  <div
                    key={ver.id}
                    onClick={() => setSelectedVersion(ver)}
                    className={`p-3.5 transition-all cursor-pointer relative group ${
                      isSelected
                        ? 'bg-indigo-50/70 border-l-4 border-l-indigo-600 shadow-2xs'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-900 text-white">
                          v{ver.number}.0
                        </span>
                        {ver.isPublished && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            PUBLISHED
                          </span>
                        )}
                        {isCurrentDraft && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ACTIVE DRAFT
                          </span>
                        )}
                        {schedName && (
                          <span
                            className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 truncate max-w-[130px]"
                            title={schedName}
                          >
                            {schedName}
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(ver.timestamp).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    {/* Checkpoint Note */}
                    <div className="mt-1.5">
                      <p className="text-xs font-semibold text-slate-900 leading-snug line-clamp-2">
                        {ver.note || 'Manual save checkpoint'}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1 font-sans">
                        <span className="truncate">{ver.author}</span>
                        <span>·</span>
                        <span>{new Date(ver.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    {/* Snapshot Stats Pills */}
                    <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-slate-600">
                      <span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded">
                        {shiftCount} shifts
                      </span>
                      <span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded">
                        {leaveCount} leave
                      </span>
                      {lockCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded flex items-center gap-0.5">
                          <Lock className="w-2.5 h-2.5" />
                          {lockCount} locks
                        </span>
                      )}
                    </div>

                    {/* Quick Actions Row */}
                    <div className="mt-2.5 pt-2 flex items-center gap-1.5 border-t border-slate-200/60">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVersion(ver);
                          setStudioTab('MATRIX');
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.8 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-[10px] cursor-pointer shadow-2xs"
                        title="Inspect snapshot in calendar matrix"
                      >
                        <LayoutGrid className="w-2.5 h-2.5 text-indigo-600" />
                        <span>Inspect</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenCompareWithDraft(ver);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.8 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium text-[10px] cursor-pointer shadow-2xs"
                        title="Compare with active draft"
                      >
                        <Diff className="w-2.5 h-2.5 text-indigo-600" />
                        <span>Diff</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setVersionToRestore(ver);
                          setIsRestoreModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.8 rounded bg-white border border-slate-200 hover:bg-slate-100 text-amber-800 font-medium text-[10px] cursor-pointer shadow-2xs"
                        title="Restore this version as a new draft"
                      >
                        <RotateCcw className="w-2.5 h-2.5 text-amber-600" />
                        <span>Restore</span>
                      </button>

                      {/* Delete Version Button with Verification */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setVersionToDelete(ver);
                          setIsDeleteModalOpen(true);
                        }}
                        className="ml-auto inline-flex items-center gap-1 px-2 py-0.8 rounded bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 font-medium text-[10px] cursor-pointer shadow-2xs transition-colors"
                        title="Delete this version checkpoint (with confirmation prompt)"
                      >
                        <Trash2 className="w-2.5 h-2.5 text-rose-600" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredVersions.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs space-y-1">
                  <p className="font-semibold text-slate-600">No versions match criteria.</p>
                  <p className="text-[11px]">Clear search or select another schedule period.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Snapshot Studio (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          {selectedVersion ? (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs space-y-0 text-xs">
              {/* Studio Header Bar */}
              <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 via-white to-indigo-50/30 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-xs px-2.5 py-0.5 rounded bg-indigo-600 text-white shadow-2xs">
                      Version v{selectedVersion.number}.0
                    </span>
                    {selectedVersion.isPublished && (
                      <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold font-mono text-[10px]">
                        OFFICIALLY PUBLISHED
                      </span>
                    )}
                    <span className="text-slate-400 font-mono text-xs">·</span>
                    <span className="text-xs font-bold text-slate-800">
                      {effectiveSchedule?.name || 'October 2026 Roster'}
                    </span>
                  </div>

                  <p className="text-slate-700 font-medium mt-1 text-xs">
                    &ldquo;{selectedVersion.note || 'Save checkpoint'}&rdquo;
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-sans">
                    Saved by <strong>{selectedVersion.author}</strong> on {new Date(selectedVersion.timestamp).toLocaleString()}
                  </p>
                </div>

                {/* Top Action Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Stepper Navigation: Previous / Next Version */}
                  <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                    <button
                      type="button"
                      disabled={!prevVersion}
                      onClick={() => prevVersion && setSelectedVersion(prevVersion)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 text-slate-700 text-[11px] disabled:opacity-30 cursor-pointer font-medium"
                      title={prevVersion ? `Go to previous version v${prevVersion.number}` : 'No previous version in current view'}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>v{prevVersion?.number || '—'}</span>
                    </button>
                    <div className="h-4 w-px bg-slate-200 mx-0.5" />
                    <button
                      type="button"
                      disabled={!nextVersion}
                      onClick={() => nextVersion && setSelectedVersion(nextVersion)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 text-slate-700 text-[11px] disabled:opacity-30 cursor-pointer font-medium"
                      title={nextVersion ? `Go to next version v${nextVersion.number}` : 'No next version in current view'}
                    >
                      <span>v{nextVersion?.number || '—'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Export button */}
                  <button
                    type="button"
                    onClick={() => setIsExportModalOpen(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                    title="Export this historical version as Excel, CSV, or Print packet"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="hidden sm:inline">Export</span>
                  </button>

                  {/* Popout Fullscreen Modal */}
                  <button
                    type="button"
                    onClick={() => handleOpenViewSnapshot(selectedVersion)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium cursor-pointer shadow-2xs transition-colors"
                    title="Open snapshot in expanded modal view"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                    <span className="hidden sm:inline">Popout</span>
                  </button>

                  {/* Restore button */}
                  <button
                    type="button"
                    onClick={() => {
                      setVersionToRestore(selectedVersion);
                      setIsRestoreModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                    title="Restore this version as new draft"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore Draft</span>
                  </button>

                  {/* Delete version button */}
                  <button
                    type="button"
                    onClick={() => {
                      setVersionToDelete(selectedVersion);
                      setIsDeleteModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                    title="Permanently delete version checkpoint with verification prompt"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Delete Version</span>
                  </button>

                  {/* Delete entire schedule button */}
                  {activeSchedule && (
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleToDelete(activeSchedule);
                        setIsDeleteScheduleModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                      title={`Permanently delete schedule "${activeSchedule.name}" and all versions`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Delete Schedule</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Studio Tabs Navigation */}
              <div className="px-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
                <div className="flex items-center gap-1 -mb-px">
                  <button
                    type="button"
                    onClick={() => setStudioTab('MATRIX')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-xs font-bold cursor-pointer transition-colors ${
                      studioTab === 'MATRIX'
                        ? 'border-indigo-600 text-indigo-700 bg-white'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Roster Matrix</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudioTab('DIFF')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-xs font-bold cursor-pointer transition-colors ${
                      studioTab === 'DIFF'
                        ? 'border-indigo-600 text-indigo-700 bg-white'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                    }`}
                  >
                    <Diff className="w-3.5 h-3.5" />
                    <span>Diff vs Active Draft</span>
                    {selectedVsDraftDiff && (
                      <span className="ml-1 px-1.5 py-0.2 rounded-full font-mono text-[10px] bg-indigo-100 text-indigo-800">
                        {selectedVsDraftDiff.totalChangesCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudioTab('SHIFTS')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-xs font-bold cursor-pointer transition-colors ${
                      studioTab === 'SHIFTS'
                        ? 'border-indigo-600 text-indigo-700 bg-white'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>Shifts Table</span>
                    <span className="ml-1 px-1.5 py-0.2 rounded-full font-mono text-[10px] bg-slate-200 text-slate-700">
                      {selectedVersion.snapshot.assignments?.length || 0}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudioTab('INFO')}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-xs font-bold cursor-pointer transition-colors ${
                      studioTab === 'INFO'
                        ? 'border-indigo-600 text-indigo-700 bg-white'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                    }`}
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>Snapshot Metadata</span>
                  </button>
                </div>

                <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-slate-500">
                  <span>{selectedVersion.snapshot.assignments?.length || 0} shifts</span>
                  <span>·</span>
                  <span>{selectedVersion.snapshot.leaveEntries?.length || 0} leaves</span>
                  <span>·</span>
                  <span>{selectedVersion.snapshot.locks?.length || 0} locks</span>
                </div>
              </div>

              {/* Tab 1: Calendar Matrix View */}
              {studioTab === 'MATRIX' && (
                <div className="p-4 sm:p-5 space-y-4">
                  {/* Matrix Controls Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    {/* Block Navigation */}
                    <div className="flex items-center gap-2">
                      {!matrixShowAllDates && totalBlocks > 1 && (
                        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                          <button
                            type="button"
                            disabled={matrixBlockIndex === 0}
                            onClick={() => setMatrixBlockIndex((p) => Math.max(0, p - 1))}
                            className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
                            title="Previous block"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2 font-mono font-bold text-[11px] text-slate-700">
                            Block {matrixBlockIndex + 1} of {totalBlocks}
                          </span>
                          <button
                            type="button"
                            disabled={matrixBlockIndex >= totalBlocks - 1}
                            onClick={() => setMatrixBlockIndex((p) => Math.min(totalBlocks - 1, p + 1))}
                            className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 cursor-pointer"
                            title="Next block"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setMatrixShowAllDates(!matrixShowAllDates)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                          matrixShowAllDates
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {matrixShowAllDates ? 'Viewing All Days' : 'View Entire Period'}
                      </button>
                    </div>

                    {/* Filters & Search */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative w-48">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Filter nurse..."
                          value={matrixSearchQuery}
                          onChange={(e) => setMatrixSearchQuery(e.target.value)}
                          className="w-full pl-8 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <select
                        value={matrixNurseFilter}
                        onChange={(e) => setMatrixNurseFilter(e.target.value)}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-700 text-xs cursor-pointer"
                      >
                        <option value="ALL">All Staff ({nurses.length})</option>
                        {nurses.map((n) => (
                          <option key={n.id} value={n.id}>
                            {n.fullName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Calendar Matrix Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs font-mono">
                        <thead>
                          <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                            <th className="py-2.5 px-3 sticky left-0 bg-slate-50 z-20 w-44 border-r border-slate-200">
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
                                  className={`py-2 px-1 text-center min-w-[70px] border-r border-slate-100 ${
                                    isWeekend ? 'bg-slate-100/70 text-slate-800' : ''
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
                          {matrixDisplayedNurses.map((nurse) => {
                            const seniority = seniorityMap.get(nurse.seniorityLevelId);
                            const assignments = selectedVersion.snapshot.assignments || [];
                            const leaveEntries = selectedVersion.snapshot.leaveEntries || [];
                            const locks = selectedVersion.snapshot.locks || [];

                            return (
                              <tr key={nurse.id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="py-2 px-3 sticky left-0 bg-white z-10 border-r border-slate-200 shadow-2xs">
                                  <div className="font-sans font-bold text-slate-900 truncate">
                                    {nurse.fullName}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5">
                                    <span>{nurse.employeeCode}</span>
                                    <span>·</span>
                                    <span>{seniority?.name || `${nurse.contractPercent}%`}</span>
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
                                          title={`Leave: ${leaveType?.name || 'Leave'}`}
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
                                            <div className="text-[9px] font-normal opacity-90 truncate max-w-[62px]">
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
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Quick Duty Legend */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-500">Legend:</span>
                    {dutyWindows.map((dw) => (
                      <span
                        key={dw.id}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-white text-[10px] font-bold"
                        style={{ backgroundColor: dw.color }}
                      >
                        {dw.acronym} - {dw.name} ({dw.startTime}–{dw.endTime})
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold">
                      LV - Approved Leave
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                      <Lock className="w-3 h-3 text-amber-600" /> Pinned Lock
                    </span>
                  </div>
                </div>
              )}

              {/* Tab 2: Diff vs Active Draft */}
              {studioTab === 'DIFF' && selectedVsDraftDiff && (
                <div className="p-4 sm:p-5 space-y-4">
                  {/* Diff Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Total Delta Cells
                      </span>
                      <span className="text-xl font-bold font-mono text-slate-900">
                        {selectedVsDraftDiff.totalChangesCount}
                      </span>
                    </div>

                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                        Added Shifts
                      </span>
                      <span className="text-xl font-bold font-mono text-emerald-800">
                        {selectedVsDraftDiff.addedCount}
                      </span>
                    </div>

                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 block">
                        Removed Shifts
                      </span>
                      <span className="text-xl font-bold font-mono text-rose-800">
                        {selectedVsDraftDiff.removedCount}
                      </span>
                    </div>

                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 block">
                        Modified Targets
                      </span>
                      <span className="text-xl font-bold font-mono text-indigo-800">
                        {selectedVsDraftDiff.modifiedCount}
                      </span>
                    </div>
                  </div>

                  {selectedVsDraftDiff.totalChangesCount > 0 ? (
                    <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-50 text-slate-600 text-[11px] border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Nurse Staff</th>
                            <th className="py-2.5 px-3">Change Type</th>
                            <th className="py-2.5 px-3">v{selectedVersion.number} State</th>
                            <th className="py-2.5 px-3">Current Active Draft</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px]">
                          {selectedVsDraftDiff.allChanges.map((change) => (
                            <tr key={change.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2 px-3 font-bold text-slate-900">{change.date}</td>
                              <td className="py-2 px-3 text-slate-900 font-sans font-medium">{change.nurseName}</td>
                              <td className="py-2 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    change.changeType === 'ADDED'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : change.changeType === 'REMOVED'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-indigo-100 text-indigo-800'
                                  }`}
                                >
                                  {change.changeType}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-700">
                                {change.before
                                  ? `${change.before.dutyAcronym} (${change.before.targetName})`
                                  : '—'}
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-900">
                                {change.after
                                  ? `${change.after.dutyAcronym} (${change.after.targetName})`
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="font-bold text-xs">Identical to Active Draft</p>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          Every nurse shift assignment in version v{selectedVersion.number} exactly matches the current active schedule draft.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-1 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => handleOpenCompareWithDraft(selectedVersion)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                    >
                      <Diff className="w-3.5 h-3.5" />
                      <span>Open Full Side-by-Side Diff Modal</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 3: Shifts Table View */}
              {studioTab === 'SHIFTS' && (
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-50 text-slate-600 text-[11px] border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Nurse Staff</th>
                          <th className="py-2.5 px-3">Duty Window</th>
                          <th className="py-2.5 px-3">Clinical Target</th>
                          <th className="py-2.5 px-3">Source</th>
                          <th className="py-2.5 px-3 text-right">Lock Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(selectedVersion.snapshot.assignments || [])
                          .slice()
                          .sort((a, b) => a.date.localeCompare(b.date))
                          .map((a) => {
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
                                <td className="py-2 px-3 font-bold text-slate-900">{a.date}</td>
                                <td className="py-2 px-3 font-sans font-medium text-slate-900">
                                  {nurse?.fullName || a.nurseId}
                                </td>
                                <td className="py-2 px-3">
                                  {duty ? (
                                    <span
                                      className="px-1.5 py-0.5 rounded text-white font-bold text-[10px]"
                                      style={{ backgroundColor: duty.color }}
                                    >
                                      {duty.acronym} · {duty.name}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-slate-800 font-sans">{targetName}</td>
                                <td className="py-2 px-3 text-[10px] text-slate-500">{a.source}</td>
                                <td className="py-2 px-3 text-right">
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
                  </div>
                </div>
              )}

              {/* Tab 4: Snapshot Info & Integrity */}
              {studioTab === 'INFO' && (
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Version Identifier
                      </span>
                      <p className="font-mono font-bold text-sm text-slate-900">
                        {selectedVersion.id}
                      </p>
                      <p className="text-[11px] text-slate-500">Immutable Checkpoint ID</p>
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Schedule Scope
                      </span>
                      <p className="font-bold text-sm text-slate-900 truncate">
                        {effectiveSchedule?.name || 'Active Schedule'}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {effectiveSchedule?.startDate} to {effectiveSchedule?.endDate}
                      </p>
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Publication Status
                      </span>
                      <p className="font-bold text-sm text-slate-900">
                        {selectedVersion.isPublished ? 'Published to Staff' : 'Internal Checkpoint'}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono">
                        Active Draft v{activeSchedule?.activeVersionNumber}
                      </p>
                    </div>
                  </div>

                  {/* Summary Breakdown Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-white border border-slate-200 rounded-lg font-mono">
                      <span className="text-slate-500 text-[10px] block">Roster Shifts</span>
                      <span className="text-lg font-bold text-slate-900">
                        {selectedVersion.snapshot.assignments?.length || 0}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Assigned shifts</span>
                    </div>

                    <div className="p-3 bg-white border border-slate-200 rounded-lg font-mono">
                      <span className="text-slate-500 text-[10px] block">Approved Leave</span>
                      <span className="text-lg font-bold text-slate-900">
                        {selectedVersion.snapshot.leaveEntries?.length || 0}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Entries recorded</span>
                    </div>

                    <div className="p-3 bg-white border border-slate-200 rounded-lg font-mono">
                      <span className="text-slate-500 text-[10px] block">Pinned Locks</span>
                      <span className="text-lg font-bold text-amber-700">
                        {selectedVersion.snapshot.locks?.length || 0}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">Non-changeable days</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs">
              Select a version from the timeline on the left to inspect its snapshot details.
            </div>
          )}
        </div>
      </div>

      {/* --- RESTORE CONFIRMATION MODAL --- */}
      {isRestoreModalOpen && versionToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none animate-in fade-in duration-150">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-indigo-600">
              <RotateCcw className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">
                Safe Non-Destructive Restore
              </h3>
            </div>

            <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 space-y-2 leading-relaxed text-[11px]">
              <p className="font-semibold text-xs">Non-Destructive Principle:</p>
              <p>
                Restores <strong>v{versionToRestore.number}</strong> as{' '}
                <strong className="font-mono text-indigo-950 font-bold">
                  v{(activeSchedule?.activeVersionNumber || 1) + 1}
                </strong>
                . Nothing is overwritten or deleted.
              </p>
              <p className="text-slate-600 text-[10px]">
                Active assignments will be safely populated from this checkpoint snapshot, and a new version entry will record the restoration event.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsRestoreModalOpen(false);
                  setVersionToRestore(null);
                }}
                className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg cursor-pointer font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold cursor-pointer transition-colors shadow-xs"
              >
                Confirm &amp; Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- DELETE VERSION VERIFICATION MODAL --- */}
      <DeleteVersionModal
        isOpen={isDeleteModalOpen}
        version={versionToDelete}
        scheduleName={activeSchedule?.name || 'Roster'}
        isCurrentActiveDraft={versionToDelete?.number === activeSchedule?.activeVersionNumber}
        isOnlyVersion={versions.length <= 1}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setVersionToDelete(null);
        }}
        onConfirmDelete={handleConfirmDelete}
        onDeleteScheduleInstead={() => {
          if (activeSchedule) {
            setScheduleToDelete(activeSchedule);
            setIsDeleteScheduleModalOpen(true);
          }
        }}
      />

      {/* --- DELETE SCHEDULE VERIFICATION MODAL --- */}
      <DeleteScheduleModal
        isOpen={isDeleteScheduleModalOpen}
        schedule={scheduleToDelete}
        shiftCount={activeAssignments.length}
        versionCount={versions.length}
        onClose={() => {
          setIsDeleteScheduleModalOpen(false);
          setScheduleToDelete(null);
        }}
        onConfirmDelete={handleConfirmDeleteSchedule}
      />

      {/* --- VERSION COMPARE MODAL --- */}
      <VersionCompareModal
        schedule={activeSchedule || schedules[0]}
        versions={versions}
        activeAssignments={activeAssignments}
        nurses={nurses}
        dutyWindows={dutyWindows}
        doctors={doctors}
        roles={roles}
        specialties={specialties}
        initialBaseVersionId={compareBaseId}
        initialTargetVersionId={compareTargetId}
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        onRestoreVersion={(v) => {
          setIsCompareModalOpen(false);
          setVersionToRestore(v);
          setIsRestoreModalOpen(true);
        }}
      />

      {/* --- VERSION VIEW MODAL --- */}
      <VersionViewModal
        version={versionToView}
        schedule={activeSchedule}
        nurses={nurses}
        dutyWindows={dutyWindows}
        doctors={doctors}
        roles={roles}
        specialties={specialties}
        leaveTypes={leaveTypes}
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        onRestore={(v) => {
          setVersionToRestore(v);
          setIsRestoreModalOpen(true);
        }}
        onDelete={(v) => {
          setIsViewModalOpen(false);
          setVersionToDelete(v);
          setIsDeleteModalOpen(true);
        }}
      />

      {/* --- EXPORT MODAL FOR HISTORICAL SNAPSHOT --- */}
      {selectedVersion && activeSchedule && (
        <ExportModal
          clinicName={context.clinicName}
          schedule={selectedVersion.snapshot.schedule || activeSchedule}
          assignments={selectedVersion.snapshot.assignments || []}
          nurses={nurses}
          dutyWindows={dutyWindows}
          leaveEntries={selectedVersion.snapshot.leaveEntries || leaveEntries}
          leaveTypes={leaveTypes}
          seniorityLevels={seniorityLevels}
          doctors={doctors}
          sessions={sessions}
          roles={roles}
          specialties={specialties}
          rules={selectedVersion.snapshot.rulesSnapshot || rules}
          versionNumber={selectedVersion.number}
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
        />
      )}
    </div>
  );
};
