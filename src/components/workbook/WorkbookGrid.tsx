import React, { useState, useEffect, useRef } from 'react';
import {
  FileSpreadsheet,
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  Sparkles,
  Lock,
  Unlock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Eye,
  Layers,
  Shield,
  ShieldAlert,
  Clock,
  Droplets,
  Calendar,
  X,
  Check,
  Search,
  Filter,
  Users,
  Stethoscope,
  Info,
  Sliders,
  ChevronDown,
  Edit2,
  Trash2,
  Star,
} from 'lucide-react';
import {
  Schedule,
  Assignment,
  Nurse,
  Doctor,
  DoctorSession,
  LockEntry,
  LeaveEntry,
  LeaveType,
  DutyWindow,
  SeniorityLevel,
  ClinicalRole,
  Specialty,
  Rule,
  PublicHoliday,
  AssignmentKind,
  AssignmentSource,
} from '../../types';
import { ValidationReport, ValidationFinding } from '../../services/validation/ScheduleValidator';
import { calculateDutyDurationHours } from '../../services/reports/hoursAccounting';
import { formatDate } from '../../utils/dateUtils';
import { isExclusiveNurseClinic } from '../../services/engine/nurseClinicUtils';

interface WorkbookGridProps {
  schedule: Schedule;
  assignments: Assignment[];
  nurses: Nurse[];
  doctors: Doctor[];
  sessions: DoctorSession[];
  locks: LockEntry[];
  leaveEntries: LeaveEntry[];
  leaveTypes: LeaveType[];
  dutyWindows: DutyWindow[];
  seniorityLevels: SeniorityLevel[];
  roles: ClinicalRole[];
  specialties: Specialty[];
  holidays: PublicHoliday[];
  validationReport: ValidationReport;
  currentBlockIndex: number;
  onBlockChange: (index: number) => void;
  onAssignmentsChange: (next: Assignment[]) => void;
  onLocksChange?: (next: LockEntry[]) => void;
  onLeaveEntriesChange?: (next: LeaveEntry[]) => void;
  onJumpToCell?: (nurseId: string, date: string) => void;
  onOpenLockOverrideModal?: (lock: LockEntry) => void;
  onNavigateTab?: (tab: 'roster' | 'doctors' | 'coverage' | 'warnings' | 'leave' | 'legend') => void;
  isAllDaysExpanded?: boolean;
  onToggleExpandDays?: () => void;
  isExpandedView?: boolean;
  onToggleExpandView?: () => void;
}

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const WorkbookGrid: React.FC<WorkbookGridProps> = ({
  schedule,
  assignments,
  nurses,
  doctors,
  sessions,
  locks,
  leaveEntries,
  leaveTypes,
  dutyWindows,
  seniorityLevels,
  roles,
  specialties,
  holidays,
  validationReport,
  currentBlockIndex,
  onBlockChange,
  onAssignmentsChange,
  onLocksChange,
  onLeaveEntriesChange,
  onOpenLockOverrideModal,
  onNavigateTab,
  isAllDaysExpanded = false,
  onToggleExpandDays,
  isExpandedView = false,
  onToggleExpandView,
}) => {
  // Navigation & Zoom (Supports 75% compact fit, 90%, 100%, 115%)
  const [zoomLevel, setZoomLevel] = useState<75 | 90 | 100 | 115>(100);
  const [viewMode, setViewMode] = useState<'ACRONYMS' | 'FULL'>('ACRONYMS');
  const [groupBy, setGroupBy] = useState<'NONE' | 'SENIORITY'>('NONE');
  const [highlightViolations, setHighlightViolations] = useState(true);

  // Selection & Focus
  const [selectedCell, setSelectedCell] = useState<{ nurseId: string; date: string } | null>(null);
  const [selectedRange, setSelectedRange] = useState<{
    startNurseId: string;
    startDate: string;
    endNurseId: string;
    endDate: string;
  } | null>(null);

  // Inline Editor Popover
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<{ nurseId: string; date: string } | null>(null);
  const [editorCategory, setEditorCategory] = useState<'DUTY' | 'LEAVE'>('DUTY');
  const [editorDutyId, setEditorDutyId] = useState<string>(dutyWindows[0]?.id || '');
  const [editorKind, setEditorKind] = useState<AssignmentKind>('DOCTOR');
  const [editorTargetRefId, setEditorTargetRefId] = useState<string>('');
  const [editorNote, setEditorNote] = useState<string>('');
  const [editorLeaveTypeId, setEditorLeaveTypeId] = useState<string>(leaveTypes[0]?.id || '');
  const [editorAllowOverwrite, setEditorAllowOverwrite] = useState<boolean>(false);

  // Right-Click Context Menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nurseId: string;
    date: string;
  } | null>(null);

  // Legend Drawer
  const [isLegendDrawerOpen, setIsLegendDrawerOpen] = useState(false);

  // Clipboard buffer
  const [clipboardAssignment, setClipboardAssignment] = useState<Assignment | null>(null);

  // Compute Active Block Dates
  const start = new Date(schedule.startDate);
  const end = new Date(schedule.endDate);
  const totalDays =
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const blockSizeDays = schedule.blockWeeks * 7;
  const numBlocks = Math.ceil(totalDays / blockSizeDays);

  const blockStartDay = isAllDaysExpanded ? 1 : currentBlockIndex * blockSizeDays + 1;
  const blockEndDay = isAllDaysExpanded ? totalDays : Math.min((currentBlockIndex + 1) * blockSizeDays, totalDays);

  const blockDates: string[] = [];
  for (let day = blockStartDay; day <= blockEndDay; day++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + (day - 1));
    blockDates.push(d.toISOString().split('T')[0]);
  }

  // Lookup maps
  const dutyMap = new Map(dutyWindows.map((d) => [d.id, d]));
  const nurseMap = new Map(nurses.map((n) => [n.id, n]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));
  const specialtyMap = new Map(specialties.map((s) => [s.id, s]));
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const seniorityMap = new Map(seniorityLevels.map((s) => [s.id, s]));

  // Violation cells set and messages map
  const violationCellKeys = new Set(
    validationReport.findings.flatMap((f) => f.cellRefs.map((r) => `${r.nurseId}_${r.date}`))
  );

  const cellViolationMessages = new Map<string, string[]>();
  validationReport.findings.forEach((f) => {
    f.cellRefs.forEach((r) => {
      const k = `${r.nurseId}_${r.date}`;
      const list = cellViolationMessages.get(k) || [];
      list.push(f.message);
      cellViolationMessages.set(k, list);
    });
  });

  // Group nurses if requested
  const displayNurses = [...nurses].sort((a, b) => {
    if (groupBy === 'SENIORITY') {
      const rankA = seniorityMap.get(a.seniorityLevelId)?.rank || 99;
      const rankB = seniorityMap.get(b.seniorityLevelId)?.rank || 99;
      if (rankA !== rankB) return rankA - rankB;
    }
    return a.fullName.localeCompare(b.fullName);
  });

  // Calculate nurse total hours vs target
  const getNurseHoursProgress = (nurse: Nurse) => {
    const nurseAssignments = assignments.filter((a) => a.nurseId === nurse.id);
    let dutyHours = 0;
    nurseAssignments.forEach((a) => {
      const duty = dutyMap.get(a.dutyWindowId);
      dutyHours += calculateDutyDurationHours(duty);
    });

    let leaveHours = 0;
    const activeLeave = leaveEntries.filter(
      (le) =>
        le.nurseId === nurse.id &&
        le.approved &&
        !(le.endDate < schedule.startDate || le.startDate > schedule.endDate)
    );
    activeLeave.forEach((le) => {
      const lt = leaveTypes.find((l) => l.id === le.leaveTypeId);
      if (lt?.countsTowardHoursTarget !== false) {
        leaveHours += le.hoursCredited || 8;
      }
    });

    const totalHours = dutyHours + leaveHours;
    const targetHours = Math.round(schedule.hoursTargetFullTime * (nurse.contractPercent / 100));
    const percent = Math.min(100, Math.round((totalHours / targetHours) * 100));

    return { totalHours, targetHours, percent, dutyHours, leaveHours };
  };

  // Calculate hours worked within the currently active block
  const getNurseBlockHours = (nurse: Nurse) => {
    let bDuty = 0;
    let bLeave = 0;
    blockDates.forEach((dateStr) => {
      const asgn = assignments.find((a) => a.nurseId === nurse.id && a.date === dateStr);
      if (asgn) {
        const duty = dutyMap.get(asgn.dutyWindowId);
        bDuty += calculateDutyDurationHours(duty);
      } else {
        const leave = leaveEntries.find(
          (le) =>
            le.nurseId === nurse.id &&
            le.approved &&
            dateStr >= le.startDate &&
            dateStr <= le.endDate
        );
        if (leave) {
          const lt = leaveTypes.find((l) => l.id === leave.leaveTypeId);
          if (lt?.countsTowardHoursTarget !== false) {
            bLeave += leave.hoursCredited || 8;
          }
        }
      }
    });
    return { blockTotal: bDuty + bLeave, bDuty, bLeave };
  };

  // Open Cell Editor for Duty Shift or Leave
  const openCellEditor = (nurseId: string, date: string) => {
    setSelectedCell({ nurseId, date });
    setSelectedRange(null);
    setContextMenu(null);
    setEditorTarget({ nurseId, date });

    const existingLock = locks.find((l) => l.nurseId === nurseId && l.date === date);
    const existingLeave = leaveEntries.find(
      (le) => le.nurseId === nurseId && date >= le.startDate && date <= le.endDate
    );
    const existingAsgn = assignments.find((a) => a.nurseId === nurseId && a.date === date);

    if (existingLeave) {
      setEditorCategory('LEAVE');
      setEditorLeaveTypeId(existingLeave.leaveTypeId);
      setEditorAllowOverwrite(!existingLeave.approved && !existingLock);
      setEditorNote(existingLeave.note || '');
      setEditorDutyId(dutyWindows[0]?.id || '');
      setEditorKind('DOCTOR');
      setEditorTargetRefId(doctors[0]?.id || '');
    } else if (existingLock?.mode === 'OFF') {
      setEditorCategory('LEAVE');
      setEditorLeaveTypeId(leaveTypes.find((l) => l.acronym === 'RO')?.id || leaveTypes[0]?.id || '');
      setEditorAllowOverwrite(false);
      setEditorNote(existingLock.note || 'Pinned Day Off');
      setEditorDutyId(dutyWindows[0]?.id || '');
      setEditorKind('DOCTOR');
      setEditorTargetRefId(doctors[0]?.id || '');
    } else if (existingAsgn) {
      setEditorCategory('DUTY');
      setEditorDutyId(existingAsgn.dutyWindowId);
      setEditorKind(existingAsgn.kind);
      setEditorTargetRefId(
        existingAsgn.doctorId || existingAsgn.clinicalRoleId || existingAsgn.specialtyId || ''
      );
      setEditorNote(existingAsgn.note || '');
      setEditorAllowOverwrite(!existingAsgn.locked && existingAsgn.source !== 'LOCK' && !existingLock);
      setEditorLeaveTypeId(leaveTypes.find((l) => l.acronym === 'BL')?.id || leaveTypes[0]?.id || '');
    } else {
      // Empty cell
      const targetNurse = nurseMap.get(nurseId);
      const isTargetExclusiveNC = targetNurse ? isExclusiveNurseClinic(targetNurse, roles) : false;
      const ncRole = roles.find(
        (r) =>
          r.id === 'role-nurse-clinic' ||
          r.acronym === 'NC' ||
          r.name.toLowerCase().includes('nurse clinic')
      );

      setEditorCategory('DUTY');
      setEditorDutyId(dutyWindows[0]?.id || '');
      if (isTargetExclusiveNC) {
        setEditorKind('CLINICAL_ROLE');
        setEditorTargetRefId(ncRole?.id || roles[0]?.id || '');
        setEditorNote('Dedicated Nurse Clinic (no doctor pairing)');
      } else {
        setEditorKind('DOCTOR');
        setEditorTargetRefId(doctors[0]?.id || '');
        setEditorNote('');
      }
      setEditorAllowOverwrite(false); // Default to Protected / Pinned
      setEditorLeaveTypeId(leaveTypes.find((l) => l.acronym === 'BL')?.id || leaveTypes[0]?.id || '');
    }

    setIsEditorOpen(true);
  };

  // Cell Click / Navigation
  const handleCellClick = (nurseId: string, date: string) => {
    openCellEditor(nurseId, date);
  };

  const handleCellDoubleClick = (nurseId: string, date: string) => {
    openCellEditor(nurseId, date);
  };

  // Keyboard navigation (Arrows, Enter, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditorOpen) return;
      if (!selectedCell) return;

      const currentNurseIndex = displayNurses.findIndex((n) => n.id === selectedCell.nurseId);
      const currentDateIndex = blockDates.indexOf(selectedCell.date);

      if (e.key === 'ArrowRight' || e.key === 'Tab') {
        e.preventDefault();
        if (currentDateIndex < blockDates.length - 1) {
          setSelectedCell({
            nurseId: selectedCell.nurseId,
            date: blockDates[currentDateIndex + 1],
          });
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentDateIndex > 0) {
          setSelectedCell({
            nurseId: selectedCell.nurseId,
            date: blockDates[currentDateIndex - 1],
          });
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentNurseIndex < displayNurses.length - 1) {
          setSelectedCell({
            nurseId: displayNurses[currentNurseIndex + 1].id,
            date: selectedCell.date,
          });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentNurseIndex > 0) {
          setSelectedCell({
            nurseId: displayNurses[currentNurseIndex - 1].id,
            date: selectedCell.date,
          });
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleCellDoubleClick(selectedCell.nurseId, selectedCell.date);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteCellAssignment(selectedCell.nurseId, selectedCell.date);
      } else if (e.ctrlKey && e.key === 'c') {
        const asgn = assignments.find(
          (a) => a.nurseId === selectedCell.nurseId && a.date === selectedCell.date
        );
        if (asgn) setClipboardAssignment(asgn);
      } else if (e.ctrlKey && e.key === 'v') {
        if (clipboardAssignment) {
          handlePasteAssignment(selectedCell.nurseId, selectedCell.date);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, isEditorOpen, displayNurses, blockDates, assignments, clipboardAssignment]);

  // Context Menu
  const handleContextMenu = (e: React.MouseEvent, nurseId: string, date: string) => {
    e.preventDefault();
    setSelectedCell({ nurseId, date });
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      nurseId,
      date,
    });
  };

  // Helper to add days to ISO date string (YYYY-MM-DD)
  const addDaysToIso = (dateStr: string, days: number): string => {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
  };

  // Helper to count days between two ISO date strings (inclusive)
  const countDaysBetween = (startStr: string, endStr: string): number => {
    const s = new Date(startStr + 'T00:00:00Z').getTime();
    const e = new Date(endStr + 'T00:00:00Z').getTime();
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
  };

  /**
   * Safely removes only the targeted date for a nurse from leave entries.
   * If a leave entry spans multiple days (e.g. 5 days of Annual Leave),
   * only the selected day is removed (by advancing startDate, regressing endDate,
   * or splitting into two valid entries), strictly preserving all other days.
   */
  const removeDateFromLeaves = (
    entries: LeaveEntry[],
    nurseId: string,
    targetDate: string
  ): LeaveEntry[] => {
    const result: LeaveEntry[] = [];

    for (const entry of entries) {
      if (entry.nurseId !== nurseId || targetDate < entry.startDate || targetDate > entry.endDate) {
        result.push(entry);
        continue;
      }

      // Target date matches this nurse and this leave entry
      // Case 1: Single day leave: only this one selected entry is removed
      if (entry.startDate === entry.endDate) {
        continue;
      }

      // Case 2: Multi-day span: shrink or split, preserving all other days of the leave
      const totalSpanDays = countDaysBetween(entry.startDate, entry.endDate);
      const hoursPerDay = entry.hoursCredited ? entry.hoursCredited / totalSpanDays : 8;

      if (entry.startDate === targetDate) {
        // Remove only the first day of the span
        const newStart = addDaysToIso(entry.startDate, 1);
        const remainingDays = countDaysBetween(newStart, entry.endDate);
        result.push({
          ...entry,
          startDate: newStart,
          hoursCredited: Math.round(remainingDays * hoursPerDay),
        });
      } else if (entry.endDate === targetDate) {
        // Remove only the last day of the span
        const newEnd = addDaysToIso(entry.endDate, -1);
        const remainingDays = countDaysBetween(entry.startDate, newEnd);
        result.push({
          ...entry,
          endDate: newEnd,
          hoursCredited: Math.round(remainingDays * hoursPerDay),
        });
      } else {
        // Target is in the middle: split into two separate valid leave entries
        const end1 = addDaysToIso(targetDate, -1);
        const days1 = countDaysBetween(entry.startDate, end1);
        result.push({
          ...entry,
          id: `${entry.id}-p1-${Date.now()}`,
          startDate: entry.startDate,
          endDate: end1,
          hoursCredited: Math.round(days1 * hoursPerDay),
        });

        const start2 = addDaysToIso(targetDate, 1);
        const days2 = countDaysBetween(start2, entry.endDate);
        result.push({
          ...entry,
          id: `${entry.id}-p2-${Date.now()}`,
          startDate: start2,
          endDate: entry.endDate,
          hoursCredited: Math.round(days2 * hoursPerDay),
        });
      }
    }

    return result;
  };

  // Inline Editor Save (Duty Shift or Leave)
  const handleSaveEditorAssignment = () => {
    if (!editorTarget) return;
    const { nurseId, date } = editorTarget;

    const nextAssignments = assignments.filter((a) => !(a.nurseId === nurseId && a.date === date));
    let nextLocks = locks.filter((l) => !(l.nurseId === nurseId && l.date === date));
    let nextLeaves = removeDateFromLeaves(leaveEntries, nurseId, date);

    if (editorCategory === 'DUTY') {
      const isLocked = !editorAllowOverwrite;

      const newAssignment: Assignment = {
        id: `asgn-manual-${nurseId}-${date}-${Date.now()}`,
        scheduleId: schedule.id,
        nurseId,
        date,
        dutyWindowId: editorDutyId,
        kind: editorKind,
        doctorId: editorKind === 'DOCTOR' ? editorTargetRefId : undefined,
        clinicalRoleId: editorKind === 'CLINICAL_ROLE' ? editorTargetRefId : undefined,
        specialtyId: editorKind === 'SPECIALTY' ? editorTargetRefId : undefined,
        locked: isLocked,
        source: isLocked ? 'LOCK' : 'MANUAL',
        note: editorNote.trim() || (isLocked ? 'Pinned duty shift' : undefined),
      };
      nextAssignments.push(newAssignment);

      if (isLocked) {
        const newLock: LockEntry = {
          id: `lock-${nurseId}-${date}-${Date.now()}`,
          nurseId,
          date,
          mode: 'ASSIGNMENT',
          dutyWindowId: editorDutyId,
          assignmentKind: editorKind,
          targetRefId: editorTargetRefId,
          note: editorNote.trim() || 'Pinned duty assignment',
          createdAt: new Date().toISOString(),
        };
        nextLocks.push(newLock);
      }
    } else {
      // LEAVE / DAY OFF
      const lt = leaveTypes.find((l) => l.id === editorLeaveTypeId) || leaveTypes[0];
      const isProtected = !editorAllowOverwrite;
      const creditedHours = typeof lt?.creditedHours === 'number' ? lt.creditedHours : 8;

      const newLeave: LeaveEntry = {
        id: `leave-${nurseId}-${date}-${Date.now()}`,
        nurseId,
        leaveTypeId: lt ? lt.id : 'leave-ro',
        startDate: date,
        endDate: date,
        approved: isProtected,
        hoursCredited: creditedHours,
        note: editorNote.trim() || undefined,
      };
      nextLeaves.push(newLeave);

      if (isProtected) {
        const newLock: LockEntry = {
          id: `lock-${nurseId}-${date}-${Date.now()}`,
          nurseId,
          date,
          mode: 'OFF',
          note: `Pinned ${lt?.name || 'Leave'}`,
          createdAt: new Date().toISOString(),
        };
        nextLocks.push(newLock);
      }
    }

    onAssignmentsChange(nextAssignments);
    if (onLocksChange) onLocksChange(nextLocks);
    if (onLeaveEntriesChange) onLeaveEntriesChange(nextLeaves);

    setIsEditorOpen(false);
  };

  const handleDeleteCellAssignment = (nurseId: string, date: string) => {
    const nextAssignments = assignments.filter((a) => !(a.nurseId === nurseId && a.date === date));
    const nextLocks = locks.filter((l) => !(l.nurseId === nurseId && l.date === date));
    // Remove ONLY the selected date from leave entries, preserving all other days/leaves
    const nextLeaves = removeDateFromLeaves(leaveEntries, nurseId, date);

    onAssignmentsChange(nextAssignments);
    if (onLocksChange) onLocksChange(nextLocks);
    if (onLeaveEntriesChange) onLeaveEntriesChange(nextLeaves);

    setIsEditorOpen(false);
  };

  const handlePasteAssignment = (nurseId: string, date: string) => {
    if (!clipboardAssignment) return;
    const isLocked = locks.some((l) => l.nurseId === nurseId && l.date === date);
    if (isLocked) return;

    const filtered = assignments.filter((a) => !(a.nurseId === nurseId && a.date === date));
    const pasted: Assignment = {
      ...clipboardAssignment,
      id: `asgn-manual-${nurseId}-${date}-${Date.now()}`,
      nurseId,
      date,
      source: 'MANUAL',
    };
    onAssignmentsChange([...filtered, pasted]);
  };

  // Zoom sizing classes
  const cellHeightClass = zoomLevel === 75 ? 'h-6' : zoomLevel === 90 ? 'h-7' : zoomLevel === 115 ? 'h-10' : 'h-8';
  const cellFontSizeClass = zoomLevel === 75 ? 'text-[9px]' : zoomLevel === 90 ? 'text-[10px]' : zoomLevel === 115 ? 'text-xs' : 'text-[11px]';

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-100 font-sans select-none">
      {/* 6.1 Shared Toolbar ("Ribbon-Lite", Row 2: Edit Ops & Block Nav) */}
      <div className="bg-white border-b border-slate-200 px-4 py-1.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 z-20">
        <div className="flex items-center gap-2">
          {/* Block Navigation */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200">
            <button
              disabled={isAllDaysExpanded || currentBlockIndex === 0}
              onClick={() => onBlockChange(currentBlockIndex - 1)}
              className="p-1 rounded hover:bg-white text-slate-600 disabled:opacity-30 cursor-pointer"
              title="Previous Block"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono font-bold text-slate-800 px-2 tabular-nums">
              {isAllDaysExpanded
                ? `All ${totalDays} Days (${blockDates[0]?.substring(5)}–${blockDates[blockDates.length - 1]?.substring(5)})`
                : `Block ${currentBlockIndex + 1}/${numBlocks} (${blockDates[0]?.substring(5)}–${blockDates[blockDates.length - 1]?.substring(5)})`}
            </span>
            <button
              disabled={isAllDaysExpanded || currentBlockIndex >= numBlocks - 1}
              onClick={() => onBlockChange(currentBlockIndex + 1)}
              className="p-1 rounded hover:bg-white text-slate-600 disabled:opacity-30 cursor-pointer"
              title="Next Block"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {onToggleExpandDays && (
            <button
              onClick={onToggleExpandDays}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-semibold cursor-pointer transition-colors ${
                isAllDaysExpanded
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title={isAllDaysExpanded ? 'Switch to block view (14 days)' : 'Expand view to all days (full month continuous)'}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{isAllDaysExpanded ? 'All Days (31d) ✓' : 'Expand All Days'}</span>
            </button>
          )}

          <div className="h-4 w-px bg-slate-200" />

          {/* View Toggles */}
          <button
            onClick={() => setViewMode(viewMode === 'ACRONYMS' ? 'FULL' : 'ACRONYMS')}
            className="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50 text-slate-700 cursor-pointer"
          >
            {viewMode === 'ACRONYMS' ? 'Labels: Acronyms' : 'Labels: Full Text'}
          </button>

          <div className="flex items-center gap-1 text-slate-600">
            <span className="text-[11px] text-slate-400">Group:</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="px-1.5 py-1 border border-slate-200 rounded bg-white text-xs"
            >
              <option value="NONE">None</option>
              <option value="SENIORITY">By Seniority</option>
            </select>
          </div>

          <button
            onClick={() => setHighlightViolations(!highlightViolations)}
            className={`px-2 py-1 rounded border text-xs cursor-pointer ${
              highlightViolations
                ? 'bg-amber-50 border-amber-300 text-amber-900 font-medium'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            Highlight ⚠ ({validationReport.errorCount + validationReport.warnCount})
          </button>
        </div>

        {/* Right Side Tools: Zoom, Legend Drawer, & Expand View */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded border border-slate-200 p-0.5 bg-slate-50">
            <button
              onClick={() => setZoomLevel(75)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                zoomLevel === 75 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600'
              }`}
              title="75% Zoom (compact fit full month)"
            >
              75%
            </button>
            <button
              onClick={() => setZoomLevel(90)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                zoomLevel === 90 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600'
              }`}
            >
              90%
            </button>
            <button
              onClick={() => setZoomLevel(100)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                zoomLevel === 100 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600'
              }`}
            >
              100%
            </button>
            <button
              onClick={() => setZoomLevel(115)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                zoomLevel === 115 ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600'
              }`}
            >
              115%
            </button>
          </div>

          <button
            onClick={() => setIsLegendDrawerOpen(!isLegendDrawerOpen)}
            className="px-2.5 py-1 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded font-medium cursor-pointer"
          >
            Legend ▾
          </button>

          {onToggleExpandView && (
            <button
              onClick={onToggleExpandView}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors shadow-2xs ${
                isExpandedView
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700'
              }`}
              title={isExpandedView ? 'Exit expanded screen view (Esc)' : 'Expand schedule view to full screen'}
            >
              {isExpandedView ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Collapse View</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Expand View</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 6.2 ROSTER SHEET MAIN GRID VIEWPORT */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 overflow-auto bg-slate-200 p-px">
          <table className="border-collapse bg-white text-xs w-max">
            {/* Sticky Header Row 1: Week Spans */}
            <thead className="sticky top-0 z-30 bg-slate-100 border-b border-slate-300">
              <tr className="border-b border-slate-200">
                <th
                  colSpan={3}
                  className="sticky left-0 bg-slate-100 z-40 border-r border-slate-300 py-1 px-3 text-left font-semibold text-slate-700 text-xs shadow-xs"
                >
                  Clinical Staff Roster
                </th>
                <th
                  colSpan={blockDates.length}
                  className="py-1 px-2 text-center font-mono text-[11px] text-slate-600 bg-slate-100 border-r border-slate-300"
                >
                  {isAllDaysExpanded ? (
                    <span className="font-bold text-indigo-700">
                      Full Schedule Period ({totalDays} Days) · Continuous Month View
                    </span>
                  ) : (
                    <span>
                      Weeks {currentBlockIndex * schedule.blockWeeks + 1}–
                      {Math.min((currentBlockIndex + 1) * schedule.blockWeeks, Math.ceil(totalDays / 7))} · Active Period Block
                    </span>
                  )}
                </th>
                <th className="py-1 px-2 text-center font-mono text-[11px] text-slate-600 bg-slate-100">
                  Block Hours
                </th>
              </tr>

              {/* Sticky Header Row 2: Day-name + Date */}
              <tr className="bg-slate-50 text-slate-700">
                {/* Sticky Left Column 1: Nurse Name */}
                <th className="sticky left-0 bg-slate-50 z-40 border-r border-slate-300 py-1.5 px-3 text-left font-semibold text-slate-800 w-44 shadow-xs">
                  Nurse / Role
                </th>
                {/* Sticky Left Column 2: Contract % */}
                <th className="sticky left-44 bg-slate-50 z-40 border-r border-slate-300 py-1.5 px-2 text-center font-mono text-slate-600 w-16 shadow-xs">
                  Contract
                </th>
                {/* Sticky Left Column 3: Hours Progress Bar */}
                <th className="sticky left-60 bg-slate-50 z-40 border-r-2 border-slate-300 py-1.5 px-2 text-left font-mono text-slate-600 w-32 shadow-xs">
                  Hours Progress
                </th>

                {/* Date Columns */}
                {blockDates.map((dateStr) => {
                  const dateObj = new Date(dateStr);
                  const day = dateObj.getUTCDate();
                  const weekday = dateObj.getUTCDay();
                  const isWeekend = weekday === 5 || weekday === 6;
                  const holiday = holidays.find((h) => h.date === dateStr);

                  return (
                    <th
                      key={dateStr}
                      title={`${WEEKDAY_ABBR[weekday]} ${formatDate(dateStr)}${holiday ? ` · Holiday: ${holiday.name}` : ''}`}
                      className={`py-1 px-1 text-center font-mono border-r border-slate-200 min-w-[50px] ${
                        holiday
                          ? 'bg-cyan-100 text-cyan-900 font-bold'
                          : isWeekend
                          ? 'bg-slate-200/70 text-slate-800'
                          : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="text-[10px] font-normal leading-tight">
                        {WEEKDAY_ABBR[weekday]}
                      </div>
                      <div className="flex items-center justify-center gap-0.5 text-xs font-bold">
                        <span>{day}</span>
                        {holiday && (
                          <span title={`Public Holiday: ${holiday.name}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-600 inline-block" />
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}

                <th className="py-1 px-2 text-center font-mono text-[11px] text-slate-600 bg-slate-50">
                  Total
                </th>
              </tr>
            </thead>

            {/* Table Body: Nurse Rows */}
            <tbody className="divide-y divide-slate-200 font-mono">
              {displayNurses.map((nurse) => {
                const seniority = seniorityMap.get(nurse.seniorityLevelId);
                const hasPhl = nurse.capabilityIds?.includes('role-phl');
                const { totalHours, targetHours, percent } = getNurseHoursProgress(nurse);

                // Progress bar color: green in range, amber near, red over/under
                const barColor =
                  percent >= 90 && percent <= 110
                    ? 'bg-emerald-500'
                    : percent >= 75
                    ? 'bg-amber-500'
                    : 'bg-rose-500';

                return (
                  <tr key={nurse.id} className="hover:bg-slate-50/60">
                    {/* Sticky Left Column 1: Nurse Name */}
                    <td className="sticky left-0 bg-white z-20 border-r border-slate-300 py-1 px-2.5 text-left w-44 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="truncate">
                          <span className="font-semibold text-slate-900 block truncate text-xs">
                            {nurse.fullName}
                          </span>
                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                            {seniority && (
                              <span
                                className="font-medium px-1 py-0.2 rounded"
                                style={{
                                  backgroundColor: `${seniority.color}15`,
                                  color: seniority.color,
                                }}
                              >
                                {seniority.name}
                              </span>
                            )}
                          </div>
                        </div>
                        {hasPhl && (
                          <span
                            title="Phlebotomist / IV certified"
                            className="text-rose-600 text-xs font-bold shrink-0"
                          >
                            🩸
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Sticky Left Column 2: Contract % */}
                    <td className="sticky left-44 bg-white z-20 border-r border-slate-300 py-1 px-2 text-center text-xs w-16 shadow-xs font-bold text-slate-700">
                      {nurse.contractPercent}%
                    </td>

                    {/* Sticky Left Column 3: Hours Progress Bar */}
                    <td className="sticky left-60 bg-white z-20 border-r-2 border-slate-300 py-1 px-2 text-left w-32 shadow-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-bold text-slate-800">{totalHours}h</span>
                          <span className="text-slate-400">/ {targetHours}h</span>
                        </div>
                        <div className="w-full h-1.5 rounded bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full ${barColor}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Matrix Cells */}
                    {blockDates.map((dateStr) => {
                      const asgn = assignments.find(
                        (a) => a.nurseId === nurse.id && a.date === dateStr
                      );
                      const lock = locks.find((l) => l.nurseId === nurse.id && l.date === dateStr);
                      const leave = leaveEntries.find(
                        (le) =>
                          le.nurseId === nurse.id &&
                          le.approved &&
                          dateStr >= le.startDate &&
                          dateStr <= le.endDate
                      );

                      const isSelected =
                        selectedCell?.nurseId === nurse.id && selectedCell?.date === dateStr;
                      const hasViolation =
                        highlightViolations && violationCellKeys.has(`${nurse.id}_${dateStr}`);

                      const duty = asgn ? dutyMap.get(asgn.dutyWindowId) : undefined;
                      const leaveType = leave ? leaveTypes.find((l) => l.id === leave.leaveTypeId) : undefined;

                      let doctorName = '';
                      const isNurseClinic =
                        asgn?.clinicalRoleId === 'role-nurse-clinic' ||
                        asgn?.note?.toLowerCase().includes('nurse clinic');

                      const isFloatPool =
                        asgn?.clinicalRoleId === 'role-float' ||
                        asgn?.note?.toLowerCase().includes('float pool') ||
                        asgn?.note?.toLowerCase().includes('general clinic');

                      if (asgn?.doctorId) {
                        const d = doctorMap.get(asgn.doctorId);
                        doctorName = d ? d.fullName.replace('Dr. ', '') : '';
                      } else if (asgn?.clinicalRoleId) {
                        const r = roleMap.get(asgn.clinicalRoleId);
                        if (asgn.clinicalRoleId === 'role-float') {
                          doctorName = 'FLOAT';
                        } else {
                          doctorName = r ? r.acronym : (isNurseClinic ? 'NC' : 'ROLE');
                        }
                      } else if (asgn?.specialtyId) {
                        const s = specialtyMap.get(asgn.specialtyId);
                        doctorName = s ? s.code : 'POOL';
                      } else if (isNurseClinic) {
                        doctorName = 'NC';
                      } else if (isFloatPool) {
                        doctorName = 'FLOAT';
                      }

                      const docObj = asgn?.doctorId ? doctorMap.get(asgn.doctorId) : null;
                      const docPref = asgn?.doctorId ? nurse.preferences?.find((p) => p.kind === 'DOCTOR' && p.refId === asgn.doctorId) : null;
                      const specPref = !docPref && docObj && docObj.specialtyIds
                        ? nurse.preferences?.find(
                            (p) =>
                              p.kind === 'SPECIALTY' &&
                              (docObj.specialtyIds.includes(p.refId) ||
                                docObj.specialtyIds.some((sid) => {
                                  const sCode = specialtyMap.get(sid)?.code?.toLowerCase();
                                  return sCode && p.refId.toLowerCase().includes(sCode);
                                }))
                          )
                        : null;

                      // Check strict allocation match vs profile
                      const hasSpecificAllocations = nurse.preferences?.some(
                        (p) => p.kind === 'DOCTOR' || p.kind === 'SPECIALTY'
                      );
                      let isAllocationMismatch = false;
                      let mismatchReason = '';

                      if (asgn && hasSpecificAllocations) {
                        if (asgn.kind === 'DOCTOR' && asgn.doctorId) {
                          const docSpecIds = docObj?.specialtyIds || [];
                          const matchesDoc = nurse.preferences?.some(
                            (p) => p.kind === 'DOCTOR' && p.refId === asgn.doctorId
                          );
                          const matchesSpec = nurse.preferences?.some((p) => {
                            if (p.kind !== 'SPECIALTY') return false;
                            if (docSpecIds.includes(p.refId)) return true;
                            const pRefLower = p.refId.toLowerCase();
                            for (const sid of docSpecIds) {
                              const sObj = specialtyMap.get(sid);
                              if (sObj) {
                                if (
                                  pRefLower === sObj.code.toLowerCase() ||
                                  pRefLower === sObj.name.toLowerCase() ||
                                  (sObj.code.toLowerCase() === 'pcc' && pRefLower.includes('pcc')) ||
                                  (sObj.code.toLowerCase() === 'ped' && (pRefLower.includes('ped') || pRefLower.includes('pedia')))
                                ) {
                                  return true;
                                }
                              }
                            }
                            return false;
                          });

                          if (!matchesDoc && !matchesSpec) {
                            isAllocationMismatch = true;
                            mismatchReason = `Unallocated Pairing: Dr. ${docObj?.fullName.replace('Dr. ', '') || 'Doctor'} is not in ${nurse.fullName}'s profile.`;
                          }
                        } else if (asgn.kind === 'SPECIALTY' && asgn.specialtyId) {
                          const specObj = specialtyMap.get(asgn.specialtyId);
                          const matchesSpec = nurse.preferences?.some((p) => {
                            if (p.kind !== 'SPECIALTY') return false;
                            if (p.refId === asgn.specialtyId) return true;
                            if (specObj) {
                              const pRefLower = p.refId.toLowerCase();
                              if (
                                pRefLower === specObj.code.toLowerCase() ||
                                pRefLower === specObj.name.toLowerCase() ||
                                (specObj.code.toLowerCase() === 'pcc' && pRefLower.includes('pcc')) ||
                                (specObj.code.toLowerCase() === 'ped' && (pRefLower.includes('ped') || pRefLower.includes('pedia')))
                              ) {
                                return true;
                              }
                            }
                            return false;
                          });

                          if (!matchesSpec) {
                            isAllocationMismatch = true;
                            mismatchReason = `Unallocated Department: ${specObj?.name || 'Specialty'} is not in ${nurse.fullName}'s profile.`;
                          }
                        }
                      }

                      const docRankBadge = isAllocationMismatch
                        ? 'Mismatch'
                        : docPref
                        ? `P${docPref.rank}`
                        : specPref
                        ? `P${specPref.rank}`
                        : isFloatPool
                        ? null
                        : asgn?.doctorId
                        ? 'Pool'
                        : null;

                      const pairingDesc = isNurseClinic
                        ? 'Dedicated Nurse Clinic (No doctor paired)'
                        : isFloatPool || asgn?.clinicalRoleId === 'role-float'
                        ? 'General Clinic / Float Pool'
                        : asgn?.clinicalRoleId
                        ? `Clinical Role: ${roleMap.get(asgn.clinicalRoleId)?.name || doctorName}`
                        : asgn?.doctorId
                        ? `Paired Doctor: Dr. ${doctorName}${
                            docPref
                              ? ` (Assigned Doctor Priority #${docPref.rank})`
                              : specPref
                              ? ` (Specialty Match: Priority #${specPref.rank})`
                              : isAllocationMismatch
                              ? ' ⚠ [ALLOCATION MISMATCH: Not in nurse profile]'
                              : ' (General Pool Clinic Nurse)'
                          }`
                        : asgn?.specialtyId
                        ? `Specialty: ${specialtyMap.get(asgn.specialtyId)?.name || doctorName}${
                            specPref
                              ? ` (Specialty Match: Priority #${specPref.rank})`
                              : isAllocationMismatch
                              ? ' ⚠ [ALLOCATION MISMATCH: Not in nurse profile]'
                              : ' (Specialty Pool)'
                          }`
                        : `Paired: ${doctorName}`;

                      return (
                        <td
                          key={dateStr}
                          onClick={() => handleCellClick(nurse.id, dateStr)}
                          onDoubleClick={() => handleCellDoubleClick(nurse.id, dateStr)}
                          onContextMenu={(e) => handleContextMenu(e, nurse.id, dateStr)}
                          className={`border-r border-b border-slate-200 p-0.5 text-center cursor-pointer relative transition-all ${cellHeightClass} ${
                            isSelected
                              ? 'ring-2 ring-indigo-600 z-10 bg-indigo-50/50'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* 1. Leave Cell Rendering */}
                          {leave ? (
                            <div
                              className="w-full h-full rounded flex items-center justify-center font-bold text-white shadow-2xs"
                              style={{ backgroundColor: leaveType?.color || '#f59e0b' }}
                              title={`${leaveType?.name} (${leave.hoursCredited}h credit)`}
                            >
                              <span>{leaveType?.acronym || 'L'}</span>
                            </div>
                          ) : lock?.mode === 'OFF' ? (
                            // 2. Lock Off
                            <div className="w-full h-full rounded border border-dashed border-amber-400 bg-amber-50 flex items-center justify-center font-bold text-amber-900 text-[10px]">
                              <Lock className="w-2.5 h-2.5 text-amber-600 mr-0.5" />
                              <span>OFF</span>
                            </div>
                          ) : asgn ? (
                            // 3. Assignment Cell (Duty + Pairing Label)
                            <div
                              className={`w-full h-full rounded flex flex-col items-center justify-center leading-none px-0.5 border ${
                                hasViolation || isAllocationMismatch
                                  ? 'ring-1.5 ring-rose-500 border-rose-400 bg-rose-50/70 shadow-xs'
                                  : isNurseClinic
                                  ? 'bg-teal-50/70 border-teal-300'
                                  : isFloatPool
                                  ? 'bg-indigo-50/40 border-indigo-200'
                                  : ''
                              }`}
                              style={{
                                backgroundColor: (hasViolation || isAllocationMismatch)
                                  ? undefined
                                  : isNurseClinic
                                  ? undefined
                                  : isFloatPool
                                  ? undefined
                                  : `${duty?.color || '#3b82f6'}18`,
                                borderColor: (hasViolation || isAllocationMismatch)
                                  ? undefined
                                  : isNurseClinic
                                  ? undefined
                                  : isFloatPool
                                  ? undefined
                                  : duty?.color || '#3b82f6',
                              }}
                              title={`Duty: ${duty?.name}${duty?.isPriority ? ' ★ [Priority Duty]' : ''} (${duty?.startTime}–${duty?.endTime}) | ${pairingDesc} | Source: ${asgn.source}${
                                cellViolationMessages.has(`${nurse.id}_${dateStr}`)
                                  ? `\n⚠ VIOLATIONS:\n${cellViolationMessages.get(`${nurse.id}_${dateStr}`)?.join('\n')}`
                                  : isAllocationMismatch
                                  ? `\n⚠ ALLOCATION WARNING:\n${mismatchReason}`
                                  : ''
                              }`}
                            >
                              <div className="flex items-center gap-0.5">
                                <span
                                  className={`font-bold text-[10px] ${
                                    isNurseClinic ? 'text-teal-800' : ''
                                  }`}
                                  style={{
                                    color: isNurseClinic ? undefined : duty?.color || '#1e40af',
                                  }}
                                >
                                  {duty?.acronym || 'D'}
                                </span>
                                {duty?.isPriority && (
                                  <span className="text-[8px] text-amber-500 font-bold leading-none" title="Priority Duty">
                                    ★
                                  </span>
                                )}
                                {lock && <Lock className="w-2.5 h-2.5 text-amber-600" />}
                                {(hasViolation || isAllocationMismatch) && (
                                  <span className="text-red-500 text-[9px] font-bold" title={isAllocationMismatch ? mismatchReason : 'Validation violation'}>⚠</span>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5 max-w-[48px] justify-center">
                                <span
                                  className={`text-[9px] font-semibold truncate ${
                                    isAllocationMismatch
                                      ? 'text-rose-900 font-bold'
                                      : isNurseClinic
                                      ? 'text-teal-900 font-bold bg-teal-100/80 px-1 py-0.2 rounded border border-teal-300'
                                      : isFloatPool
                                      ? 'text-indigo-800 font-bold'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {doctorName}
                                </span>
                                {docRankBadge && (
                                  <span
                                    className={`text-[7px] font-bold px-0.5 rounded leading-none shrink-0 ${
                                      docRankBadge === 'Mismatch'
                                        ? 'bg-rose-100 text-rose-800 border border-rose-300 font-extrabold'
                                        : docRankBadge === 'P1'
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : docRankBadge === 'P2'
                                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                        : 'bg-slate-100 text-slate-700 border border-slate-300'
                                    }`}
                                    title={docRankBadge === 'Mismatch' ? mismatchReason : docPref ? `Assigned Doctor Priority #${docPref.rank}` : 'General Pool'}
                                  >
                                    {docRankBadge}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            // 4. Empty Cell
                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                              —
                            </div>
                          )}
                        </td>
                      );
                    })}

                    {/* Block Total Column */}
                    <td
                      className="py-1 px-2 text-center text-xs font-bold text-slate-800 bg-slate-50 border-b border-slate-200"
                      title={`Block ${currentBlockIndex + 1}: ${getNurseBlockHours(nurse).bDuty}h duty + ${getNurseBlockHours(nurse).bLeave}h leave | Period Total: ${totalHours}h / ${targetHours}h`}
                    >
                      <span>{getNurseBlockHours(nurse).blockTotal}h</span>
                      <span className="block text-[9px] font-normal text-slate-400">
                        {totalHours}h tot
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 6.6 Collapsible Right Drawer: Interactive Legend */}
        {isLegendDrawerOpen && (
          <div className="w-64 bg-white border-l border-slate-200 flex flex-col shrink-0 text-xs shadow-lg animate-in slide-in-from-right duration-150 z-30">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <span className="font-bold text-slate-800">Workbook Legend</span>
              <button
                onClick={() => setIsLegendDrawerOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <h4 className="font-semibold text-slate-700 mb-1.5 font-mono text-[10px] uppercase">
                  Duty Windows
                </h4>
                <div className="space-y-1">
                  {dutyWindows.map((dw) => (
                    <div key={dw.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-4 h-4 rounded text-white font-mono font-bold text-[9px] flex items-center justify-center"
                          style={{ backgroundColor: dw.color }}
                        >
                          {dw.acronym}
                        </span>
                        <span className="text-slate-800 font-medium">{dw.name}</span>
                        {dw.isPriority && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded">
                            <Star className="w-2 h-2 fill-amber-500 text-amber-500" />
                            Priority
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-slate-400 text-[10px]">
                        {dw.startTime}–{dw.endTime}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-700 mb-1.5 font-mono text-[10px] uppercase">
                  Leave Types
                </h4>
                <div className="space-y-1">
                  {leaveTypes.map((lt) => (
                    <div key={lt.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-4 h-4 rounded text-white font-mono font-bold text-[9px] flex items-center justify-center"
                          style={{ backgroundColor: lt.color }}
                        >
                          {lt.acronym}
                        </span>
                        <span className="text-slate-800">{lt.name}</span>
                      </div>
                      <span className="font-mono text-slate-500 text-[10px]">
                        {typeof lt.creditedHours === 'number' ? `${lt.creditedHours}h` : 'match'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-700 mb-1.5 font-mono text-[10px] uppercase">
                  Special Badges &amp; Symbols
                </h4>
                <div className="space-y-1.5 text-[11px] text-slate-600">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Non-changeable Pinned Lock</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-rose-600 font-bold">🩸</span>
                    <span>Blood Collection &amp; IV Nurse</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-4 rounded text-teal-900 font-mono font-bold text-[9px] flex items-center justify-center bg-teal-100 border border-teal-300">
                      NC
                    </span>
                    <span>Dedicated Nurse Clinic (No doctor paired)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-500 font-bold">⚠</span>
                    <span>Rule or Coverage Violation</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Status Bar */}
      <div className="h-7 bg-white border-t border-slate-200 px-4 flex items-center justify-between text-[11px] text-slate-600 shrink-0 select-none">
        <div className="flex items-center gap-4">
          {selectedCell ? (
            <div className="flex items-center gap-1.5 font-mono text-slate-800">
              <span className="font-bold">
                {nurseMap.get(selectedCell.nurseId)?.fullName}
              </span>
              <span>·</span>
              <span>{formatDate(selectedCell.date)}</span>
            </div>
          ) : (
            <span className="text-slate-400">Click any cell to navigate</span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {(() => {
            const checkDate = selectedCell?.date || blockDates[0] || schedule.startDate;
            const hourData = validationReport.hourlyCoverageMap[checkDate]?.['19:00'];
            if (hourData) {
              const { nurses: nActive, doctors: dActive, deficit } = hourData;
              return (
                <div
                  onClick={() => onNavigateTab && onNavigateTab('coverage')}
                  className={`flex items-center gap-1 font-mono cursor-pointer px-1.5 py-0.5 rounded ${
                    deficit > 0
                      ? 'bg-rose-50 text-rose-700 font-bold border border-rose-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Click to inspect Hourly Coverage tab"
                >
                  <span className="text-slate-400">19:00 coverage:</span>
                  <span>
                    {nActive} {nActive === 1 ? 'nurse' : 'nurses'} / {dActive} {dActive === 1 ? 'doctor' : 'doctors'}
                  </span>
                  {deficit > 0 && <span className="text-rose-600 font-bold">⚠</span>}
                </div>
              );
            }
            return (
              <div className="flex items-center gap-1">
                <span className="text-slate-400">Evening Coverage:</span>
                <span className="font-mono font-semibold text-emerald-700">Satisfied ✓</span>
              </div>
            );
          })()}

          <button
            onClick={() => onNavigateTab && onNavigateTab('warnings')}
            className={`flex items-center gap-1 font-mono px-2 py-0.5 rounded cursor-pointer transition-colors ${
              validationReport.errorCount > 0
                ? 'bg-rose-50 text-rose-700 font-bold hover:bg-rose-100 border border-rose-200'
                : validationReport.warnCount > 0
                ? 'bg-amber-50 text-amber-800 font-bold hover:bg-amber-100 border border-amber-200'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Click to view all warnings and rule violations in Warnings tab"
          >
            <span className="text-slate-400">Audit Status:</span>
            <span>
              {validationReport.errorCount} errors · {validationReport.warnCount} warnings
            </span>
          </button>
        </div>
      </div>

      {/* --- INLINE CELL SHIFT & LEAVE EDITOR MODAL --- */}
      {isEditorOpen && editorTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-2xs animate-in fade-in duration-100">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 space-y-4 text-xs animate-in zoom-in-95 duration-100 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">
                    {nurseMap.get(editorTarget.nurseId)?.fullName}
                  </span>
                  <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-medium">
                    {formatDate(editorTarget.date)}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Configure duty shift or leave entry, and set whether automatic generation can overwrite it.
                </span>
              </div>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category Segmented Tabs: Duty Shift vs Leave / Day Off */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setEditorCategory('DUTY')}
                className={`py-2 px-3 rounded-md font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  editorCategory === 'DUTY'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>Assign Duty Shift</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorCategory('LEAVE')}
                className={`py-2 px-3 rounded-md font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  editorCategory === 'LEAVE'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Leave / Day Off</span>
              </button>
            </div>

            {/* DUTY SHIFT CONFIGURATION */}
            {editorCategory === 'DUTY' && (
              <div className="space-y-3.5 animate-in fade-in duration-100">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    1. Select Duty Window / Shift
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {dutyWindows.map((dw) => {
                      const isSelected = editorDutyId === dw.id;
                      return (
                        <button
                          key={dw.id}
                          type="button"
                          onClick={() => setEditorDutyId(dw.id)}
                          className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className="font-bold text-xs"
                              style={{ color: dw.color || '#1e40af' }}
                            >
                              {dw.name} ({dw.acronym})
                            </span>
                            {dw.isPriority ? (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-700 bg-amber-100/80 border border-amber-200 px-1.5 py-0.2 rounded">
                                <Star className="w-2 h-2 fill-amber-500 text-amber-500" />
                                Priority
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-400">Standard</span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                            {dw.startTime} – {dw.endTime}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    2. Assignment Target (Doctor / Role / Specialty)
                  </label>
                  {(() => {
                    const activeNurse = editorTarget ? nurseMap.get(editorTarget.nurseId) : undefined;
                    const isTargetExclusiveNC = activeNurse ? isExclusiveNurseClinic(activeNurse, roles) : false;

                    return (
                      <>
                        {isTargetExclusiveNC && (editorKind === 'DOCTOR' || editorKind === 'SPECIALTY') && (
                          <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs flex items-start gap-2 mb-2 animate-in fade-in duration-100">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold block text-[11px]">
                                Exclusive Nurse Clinic Warning
                              </span>
                              <span className="text-[10px] text-amber-800 leading-tight block">
                                {activeNurse?.fullName} is designated as Exclusive Nurse Clinic (no doctor pairings). Assigning them to a doctor or specialty will trigger a schedule validation error.
                              </span>
                            </div>
                          </div>
                        )}
                        {(() => {
                          const nurseSpecificPrefs = activeNurse?.preferences?.filter(
                            (p) => p.kind === 'DOCTOR' || p.kind === 'SPECIALTY'
                          ) || [];

                          if (!isTargetExclusiveNC && nurseSpecificPrefs.length > 0) {
                            let isMismatch = false;
                            let warnText = '';

                            if (editorKind === 'DOCTOR') {
                              const selDoc = doctors.find((d) => d.id === editorTargetRefId);
                              const selDocSpecIds = selDoc?.specialtyIds || [];
                              const matchesDoc = nurseSpecificPrefs.some((p) => p.kind === 'DOCTOR' && p.refId === editorTargetRefId);
                              const matchesSpec = nurseSpecificPrefs.some((p) => {
                                if (p.kind !== 'SPECIALTY') return false;
                                if (selDocSpecIds.includes(p.refId)) return true;
                                const pRefLower = p.refId.toLowerCase();
                                for (const sid of selDocSpecIds) {
                                  const sObj = specialtyMap.get(sid);
                                  if (sObj) {
                                    if (
                                      pRefLower === sObj.code.toLowerCase() ||
                                      pRefLower === sObj.name.toLowerCase() ||
                                      (sObj.code.toLowerCase() === 'pcc' && pRefLower.includes('pcc')) ||
                                      (sObj.code.toLowerCase() === 'ped' && (pRefLower.includes('ped') || pRefLower.includes('pedia')))
                                    ) {
                                      return true;
                                    }
                                  }
                                }
                                return false;
                              });

                              if (!matchesDoc && !matchesSpec) {
                                isMismatch = true;
                                warnText = `${activeNurse?.fullName} is allocated to other departments in their profile. Assigning to Dr. ${selDoc?.fullName.replace('Dr. ', '') || 'Doctor'} will trigger an allocation audit error.`;
                              }
                            } else if (editorKind === 'SPECIALTY') {
                              const selSpec = specialties.find((s) => s.id === editorTargetRefId);
                              const matchesSpec = nurseSpecificPrefs.some((p) => {
                                if (p.kind !== 'SPECIALTY') return false;
                                if (p.refId === editorTargetRefId) return true;
                                if (selSpec) {
                                  const pRefLower = p.refId.toLowerCase();
                                  if (
                                    pRefLower === selSpec.code.toLowerCase() ||
                                    pRefLower === selSpec.name.toLowerCase() ||
                                    (selSpec.code.toLowerCase() === 'pcc' && pRefLower.includes('pcc')) ||
                                    (selSpec.code.toLowerCase() === 'ped' && (pRefLower.includes('ped') || pRefLower.includes('pedia')))
                                  ) {
                                    return true;
                                  }
                                }
                                return false;
                              });

                              if (!matchesSpec) {
                                isMismatch = true;
                                warnText = `${activeNurse?.fullName} is allocated to other departments in their profile. Assigning to ${selSpec?.name || 'this specialty'} will trigger an allocation audit error.`;
                              }
                            }

                            if (isMismatch) {
                              return (
                                <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-lg text-rose-900 text-xs flex items-start gap-2 mb-2 animate-in fade-in duration-100">
                                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-semibold block text-[11px]">
                                      Profile Allocation Mismatch
                                    </span>
                                    <span className="text-[10px] text-rose-800 leading-tight block">
                                      {warnText}
                                    </span>
                                  </div>
                                </div>
                              );
                            }
                          }
                          return null;
                        })()}
                        <div className="grid grid-cols-3 gap-1.5 mb-2">
                          {(['DOCTOR', 'CLINICAL_ROLE', 'SPECIALTY'] as AssignmentKind[]).map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => {
                                setEditorKind(k);
                                if (k === 'DOCTOR') setEditorTargetRefId(doctors[0]?.id || '');
                                if (k === 'CLINICAL_ROLE') setEditorTargetRefId(roles[0]?.id || '');
                                if (k === 'SPECIALTY') setEditorTargetRefId(specialties[0]?.id || '');
                              }}
                              className={`py-1.5 rounded-md border text-xs font-semibold cursor-pointer text-center transition-all ${
                                editorKind === k
                                  ? 'bg-indigo-50 border-indigo-400 text-indigo-700 shadow-2xs'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {k === 'CLINICAL_ROLE' ? (isTargetExclusiveNC ? 'Clinical Role (NC)' : 'Clinical Role') : k === 'DOCTOR' ? 'Doctor Session' : 'Specialty Pool'}
                            </button>
                          ))}
                        </div>
                      </>
                    );
                  })()}

                  <select
                    value={editorTargetRefId}
                    onChange={(e) => setEditorTargetRefId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs font-medium text-slate-800"
                  >
                    {editorKind === 'DOCTOR' &&
                      doctors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.fullName} ({specialties.find((s) => s.id === d.specialtyIds[0])?.name || 'Clinic'})
                        </option>
                      ))}
                    {editorKind === 'CLINICAL_ROLE' &&
                      roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.acronym}) · {r.defaultStartTime || '09:00'}–{r.defaultEndTime || '13:00'}
                        </option>
                      ))}
                    {editorKind === 'SPECIALTY' &&
                      specialties.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code}) Pool
                        </option>
                      ))}
                  </select>
                  {(() => {
                    const activeNurse = editorTarget ? nurseMap.get(editorTarget.nurseId) : undefined;
                    const nurseSpecificPrefs = activeNurse?.preferences?.filter(
                      (p) => p.kind === 'DOCTOR' || p.kind === 'SPECIALTY'
                    ) || [];
                    if (nurseSpecificPrefs.length > 0) {
                      const tags = nurseSpecificPrefs.map((p) => {
                        if (p.kind === 'DOCTOR') {
                          const doc = doctorMap.get(p.refId);
                          return `Dr. ${doc ? doc.fullName.replace('Dr. ', '') : 'Doctor'} (#${p.rank})`;
                        } else {
                          const sp = specialtyMap.get(p.refId);
                          return `${sp ? sp.name : 'Specialty'} (#${p.rank})`;
                        }
                      }).join(', ');
                      return (
                        <div className="mt-1 text-[10px] text-indigo-700 bg-indigo-50/60 rounded px-2 py-0.5 border border-indigo-100">
                          <strong>Profile Allocations:</strong> {tags}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}

            {/* LEAVE / DAY OFF CONFIGURATION */}
            {editorCategory === 'LEAVE' && (
              <div className="space-y-3.5 animate-in fade-in duration-100">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    1. Select Leave / Off Type
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {leaveTypes.map((lt) => {
                      const isSelected = editorLeaveTypeId === lt.id;
                      return (
                        <button
                          key={lt.id}
                          type="button"
                          onClick={() => setEditorLeaveTypeId(lt.id)}
                          className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className="font-bold text-[10px] px-1.5 py-0.5 rounded text-white"
                              style={{ backgroundColor: lt.color || '#f59e0b' }}
                            >
                              {lt.acronym}
                            </span>
                            <span className="font-bold text-slate-800 text-xs truncate">
                              {lt.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 block">
                            {typeof lt.creditedHours === 'number' ? `${lt.creditedHours}h credit` : 'Duty match'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* AUTOMATIC GENERATION OVERWRITE SETTING */}
            <div className="pt-2 border-t border-slate-100">
              <label className="block font-semibold text-slate-800 mb-1.5">
                Automatic Generation Overwrite Rule
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEditorAllowOverwrite(false)}
                  className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all flex items-start gap-2 ${
                    !editorAllowOverwrite
                      ? 'border-amber-400 bg-amber-50/70 ring-1 ring-amber-400'
                      : 'border-slate-200 hover:bg-slate-50 opacity-70'
                  }`}
                >
                  <Lock className={`w-4 h-4 shrink-0 mt-0.5 ${!editorAllowOverwrite ? 'text-amber-600' : 'text-slate-400'}`} />
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">
                      🔒 Pinned (Protected)
                    </span>
                    <span className="text-[10px] text-slate-600 block leading-tight mt-0.5">
                      Automatic generation will <strong className="text-amber-800 font-bold">NEVER</strong> overwrite or alter this cell.
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setEditorAllowOverwrite(true)}
                  className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all flex items-start gap-2 ${
                    editorAllowOverwrite
                      ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500'
                      : 'border-slate-200 hover:bg-slate-50 opacity-70'
                  }`}
                >
                  <Unlock className={`w-4 h-4 shrink-0 mt-0.5 ${editorAllowOverwrite ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">
                      ⚡ Flexible (Allow Overwrite)
                    </span>
                    <span className="text-[10px] text-slate-600 block leading-tight mt-0.5">
                      Automatic generation <strong className="text-indigo-800 font-bold">CAN</strong> rebalance or replace this cell.
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Note (Optional)
              </label>
              <input
                type="text"
                value={editorNote}
                onChange={(e) => setEditorNote(e.target.value)}
                placeholder="e.g. Birthday celebration, swapped shift, or specific doctor assignment"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  if (editorTarget) {
                    handleDeleteCellAssignment(editorTarget.nurseId, editorTarget.date);
                  }
                }}
                className="text-red-600 hover:text-red-700 font-semibold cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Cell</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditorAssignment}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold cursor-pointer shadow-xs transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Cell</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- RIGHT CLICK CONTEXT MENU --- */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-slate-200 rounded shadow-xl py-1 text-xs w-44 animate-in fade-in duration-75"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            onClick={() => {
              handleCellDoubleClick(contextMenu.nurseId, contextMenu.date);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700 cursor-pointer flex items-center gap-2"
          >
            <Edit2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Edit Assignment...</span>
          </button>
          <button
            onClick={() => {
              const asgn = assignments.find(
                (a) => a.nurseId === contextMenu.nurseId && a.date === contextMenu.date
              );
              if (asgn) setClipboardAssignment(asgn);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700 cursor-pointer flex items-center gap-2"
          >
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>Copy Cell</span>
          </button>
          <button
            disabled={!clipboardAssignment}
            onClick={() => {
              handlePasteAssignment(contextMenu.nurseId, contextMenu.date);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700 disabled:opacity-40 cursor-pointer flex items-center gap-2"
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-slate-400" />
            <span>Paste Cell</span>
          </button>
          <div className="h-px bg-slate-100 my-1" />
          <button
            onClick={() => {
              handleDeleteCellAssignment(contextMenu.nurseId, contextMenu.date);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600 cursor-pointer flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Cell</span>
          </button>
        </div>
      )}
    </div>
  );
};
