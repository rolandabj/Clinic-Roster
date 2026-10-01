import React, { useState, useEffect, useRef } from 'react';
import {
  CalendarRange,
  Plus,
  Play,
  RotateCcw,
  Sparkles,
  Download,
  Share2,
  Send,
  FileSpreadsheet,
  CheckCircle,
  CheckCircle2,
  Clock,
  Layers,
  AlertTriangle,
  Info,
  Calendar,
  ChevronRight,
  Filter,
  Check,
  X,
  Trash2,
  Edit2,
  Users,
  Shield,
  ArrowRight,
  HelpCircle,
  Save,
  History,
  Diff,
  FolderOpen,
  Scale,
  ArrowLeftRight,
  Maximize2,
  Minimize2,
  Star,
  Stethoscope,
} from 'lucide-react';
import { ClinicContextState } from '../../types/navigation';
import { getRepository } from '../../services/repository';
import { syncScheduleAssignments } from '../../services/repository/assignmentSync';
import {
  Schedule,
  ScheduleVersion,
  Assignment,
  Nurse,
  Doctor,
  DoctorSession,
  LockEntry,
  LeaveEntry,
  ClinicalRole,
  Specialty,
  SeniorityLevel,
  DutyWindow,
  Rule,
  BlockWeeks,
  PublicHoliday,
  LeaveType,
  NurseHoursQuota,
  Invitation,
  WorkingHoursPeriod,
} from '../../types';
import { SchedulingEngine } from '../../services/engine/SchedulingEngine';
import { calculateWorkingHoursForDateRange } from '../../services/periods/workingHoursPeriodService';
import {
  GenerationPreflightSummary,
  GenerationProgress,
  RegenerateMode,
} from '../../services/engine/types';
import { ScheduleValidator, ValidationReport } from '../../services/validation/ScheduleValidator';
import { WorkbookGrid } from '../workbook/WorkbookGrid';
import { DoctorsScheduleSheet } from '../workbook/DoctorsScheduleSheet';
import { CoverageSheet } from '../workbook/CoverageSheet';
import { WarningsSheet } from '../workbook/WarningsSheet';
import { LeaveAndLocksSheet } from '../workbook/LeaveAndLocksSheet';
import { HoursAccountingSheet } from '../workbook/HoursAccountingSheet';
import { VersionCompareModal } from '../modals/VersionCompareModal';
import { ExportModal } from '../modals/ExportModal';
import { ShareModal } from '../modals/ShareModal';
import { PublishModal } from '../modals/PublishModal';
import { FairnessModal } from '../modals/FairnessModal';
import { TemplateModal } from '../modals/TemplateModal';
import { SwapManagerModal } from '../modals/SwapManagerModal';
import { CreateScheduleModal } from '../modals/CreateScheduleModal';
import { DeleteScheduleModal } from '../modals/DeleteScheduleModal';
import { deleteEntireSchedule } from '../../services/schedule/scheduleDeletionService';
import { populateRecurringDoctorSessionsForSchedule } from '../../services/schedule/doctorScheduleService';
import { formatDate } from '../../utils/dateUtils';

interface SchedulesViewProps {
  context: ClinicContextState;
  onOpenSharePreview?: (token: string) => void;
  initialOpenCreate?: boolean;
}

export const SchedulesView: React.FC<SchedulesViewProps> = ({
  context,
  onOpenSharePreview,
  initialOpenCreate = false,
}) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [sessions, setSessions] = useState<DoctorSession[]>([]);
  const [locks, setLocks] = useState<LockEntry[]>([]);
  const [leaveEntries, setLeaveEntries] = useState<LeaveEntry[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [roles, setClinicalRoles] = useState<ClinicalRole[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [seniorityLevels, setSeniorityLevels] = useState<SeniorityLevel[]>([]);
  const [dutyWindows, setDutyWindows] = useState<DutyWindow[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [quotas, setQuotas] = useState<NurseHoursQuota[]>([]);

  // Validation Report state
  const [validationReport, setValidationReport] = useState<ValidationReport>({
    scheduleId: '',
    timestamp: '',
    errorCount: 0,
    warnCount: 0,
    infoCount: 0,
    findings: [],
    hourlyCoverageMap: {},
  });

  // Create Schedule Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  useEffect(() => {
    if (initialOpenCreate) {
      setIsNewModalOpen(true);
    }
  }, [initialOpenCreate]);

  // Pre-flight & Generation Modal
  const [isPreflightModalOpen, setIsPreflightModalOpen] = useState(false);
  const [preflightSummary, setPreflightSummary] = useState<GenerationPreflightSummary | null>(null);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeGenerationMode, setActiveGenerationMode] = useState<RegenerateMode>('GENERATE_ALL');
  const [clearIncludeManual, setClearIncludeManual] = useState(false);

  // Active Block & Tab selection in Workbook View
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'roster' | 'doctors' | 'coverage' | 'warnings' | 'leave' | 'hours' | 'legend'>('roster');

  // Lock Override Modal
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [activeLockToOverride, setActiveLockToOverride] = useState<LockEntry | null>(null);
  const [overrideInput, setOverrideInput] = useState('');

  // Save with Note Modal
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [versions, setVersions] = useState<ScheduleVersion[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishWizardMode, setPublishWizardMode] = useState<'PUBLISH' | 'CHANGE'>('PUBLISH');
  const [isPublishDropdownOpen, setIsPublishDropdownOpen] = useState(false);
  const [isSchedulePickerOpen, setIsSchedulePickerOpen] = useState(false);
  const [isDeleteScheduleModalOpen, setIsDeleteScheduleModalOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null);
  const [isFairnessModalOpen, setIsFairnessModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [lastAutosavedAt, setLastAutosavedAt] = useState<string | null>(null);
  const [workingHoursPeriods, setWorkingHoursPeriods] = useState<WorkingHoursPeriod[]>([]);

  // Undo/Redo stack (50 steps)
  const [undoStack, setUndoStack] = useState<Assignment[][]>([]);
  const [redoStack, setRedoStack] = useState<Assignment[][]>([]);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Expanded View & All Days Mode
  const [isExpandedView, setIsExpandedView] = useState(false);
  const [isAllDaysExpanded, setIsAllDaysExpanded] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpandedView) {
        setIsExpandedView(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpandedView]);

  const repo = getRepository();

  const loadData = async () => {
    try {
      const [
        schedList,
        asgnList,
        nList,
        dList,
        sessList,
        lkList,
        leList,
        ltList,
        crList,
        spList,
        sList,
        dwList,
        rList,
        hList,
        qList,
        vList,
        invList,
        whpList,
      ] = await Promise.all([
        repo.list('schedules'),
        repo.list('assignments'),
        repo.list('nurses'),
        repo.list('doctors'),
        repo.list('doctorSessions'),
        repo.list('locks'),
        repo.list('leaveEntries'),
        repo.list('leaveTypes'),
        repo.list('clinicalRoles'),
        repo.list('specialties'),
        repo.list('seniorityLevels'),
        repo.list('dutyWindows'),
        repo.list('rules'),
        repo.list('holidays'),
        repo.list('quotas'),
        repo.list('versions'),
        repo.list('invitations'),
        repo.list('workingHoursPeriods'),
      ]);

      const sortedWhp = [...whpList].sort((a, b) => a.startDate.localeCompare(b.startDate));
      setWorkingHoursPeriods(sortedWhp);

      // Clean up any legacy pre-seeded automatic leaves (Annual, Sick, Birthday, PH)
      const seedLeaveIds = new Set(['leave-1', 'leave-2', 'leave-3', 'leave-4', 'leave-5']);
      const autoLeavesToDelete = leList.filter(
        (le) =>
          seedLeaveIds.has(le.id) ||
          le.note?.toLowerCase().includes('auto-entitlement') ||
          le.note?.toLowerCase().includes('birthday leave auto') ||
          le.note?.toLowerCase().includes('public holiday entitlement')
      );
      let activeLeaveList = leList;
      if (autoLeavesToDelete.length > 0) {
        await repo.bulkRemove('leaveEntries', autoLeavesToDelete.map((l) => l.id));
        activeLeaveList = leList.filter((le) => !autoLeavesToDelete.some((del) => del.id === le.id));
      }

      const uniqueSchedules = Array.from(new Map(schedList.map((s) => [s.id, s])).values());
      setSchedules(uniqueSchedules);
      setInvitations(invList);
      setNurses(nList.filter((n) => n.active));
      setDoctors(dList.filter((d) => d.active));
      setSessions(sessList);
      setLocks(lkList);
      setLeaveEntries(activeLeaveList);
      setLeaveTypes(ltList);
      setClinicalRoles(crList);
      setSpecialties(spList);
      setSeniorityLevels(sList);
      setDutyWindows(dwList);
      setRules(rList);
      setHolidays(hList);
      setQuotas(qList);

      if (schedList.length > 0) {
        const current = schedList.find((s) => s.id === context.activeScheduleId) || schedList[0];
        setActiveSchedule(current);
        const schedAssignments = asgnList.filter((a) => a.scheduleId === current.id);
        setAssignments(schedAssignments);

        const schedVersions = vList
          .filter((v) => v.scheduleId === current.id)
          .sort((a, b) => b.number - a.number);
        setVersions(schedVersions);

        // Run validation
        const report = ScheduleValidator.validate(
          current,
          schedAssignments,
          nList.filter((n) => n.active),
          sList,
          dwList,
          sessList,
          leList,
          lkList,
          crList,
          rList,
          sortedWhp,
          spList,
          dList
        );
        setValidationReport(report);
      }
    } catch (err) {
      console.error('Error loading schedule workspace:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Autosave draft every 30 seconds to persistence (Phase 10)
  useEffect(() => {
    if (!activeSchedule) return;

    const autosaveTimer = setInterval(async () => {
      try {
        if (activeSchedule) {
          await syncScheduleAssignments(repo, activeSchedule.id, assignments);
          const timeStr = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          setLastAutosavedAt(timeStr);
        }
      } catch (err) {
        console.error('Autosave error:', err);
      }
    }, 30000);

    return () => clearInterval(autosaveTimer);
  }, [activeSchedule, assignments]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Debounce timer ref for live validation
  const validationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Re-run validation debounced (300ms) whenever assignments change
  const handleAssignmentsChange = (next: Assignment[]) => {
    setUndoStack((prev) => [assignments, ...prev].slice(0, 50));
    setRedoStack([]);
    setAssignments(next);

    // Save to repository and clean up any deleted assignments
    if (activeSchedule) {
      syncScheduleAssignments(repo, activeSchedule.id, next).catch((err) => {
        console.error('Failed to sync assignments on change:', err);
      });

      if (validationTimerRef.current) {
        clearTimeout(validationTimerRef.current);
      }
      validationTimerRef.current = setTimeout(() => {
        const report = ScheduleValidator.validate(
          activeSchedule,
          next,
          nurses,
          seniorityLevels,
          dutyWindows,
          sessions,
          leaveEntries,
          locks,
          roles,
          rules,
          workingHoursPeriods,
          specialties,
          doctors
        );
        setValidationReport(report);
      }, 300);
    }
  };

  const handleLocksChange = async (nextLocks: LockEntry[]) => {
    setLocks(nextLocks);
    try {
      const existing = await repo.list('locks');
      const nextIds = new Set(nextLocks.map((l) => l.id));
      const toDelete = existing.filter((l) => !nextIds.has(l.id)).map((l) => l.id);
      if (toDelete.length > 0) {
        await repo.bulkRemove('locks', toDelete);
      }
      if (nextLocks.length > 0) {
        await repo.bulkUpsert('locks', nextLocks);
      }

      if (activeSchedule) {
        const report = ScheduleValidator.validate(
          activeSchedule,
          assignments,
          nurses,
          seniorityLevels,
          dutyWindows,
          sessions,
          leaveEntries,
          nextLocks,
          roles,
          rules,
          workingHoursPeriods,
          specialties,
          doctors
        );
        setValidationReport(report);
      }
    } catch (err) {
      console.error('Failed to sync locks:', err);
    }
  };

  const handleLeaveEntriesChange = async (nextLeaves: LeaveEntry[]) => {
    setLeaveEntries(nextLeaves);
    try {
      const existing = await repo.list('leaveEntries');
      const nextIds = new Set(nextLeaves.map((l) => l.id));
      const toDelete = existing.filter((l) => !nextIds.has(l.id)).map((l) => l.id);
      if (toDelete.length > 0) {
        await repo.bulkRemove('leaveEntries', toDelete);
      }
      if (nextLeaves.length > 0) {
        await repo.bulkUpsert('leaveEntries', nextLeaves);
      }

      if (activeSchedule) {
        const report = ScheduleValidator.validate(
          activeSchedule,
          assignments,
          nurses,
          seniorityLevels,
          dutyWindows,
          sessions,
          nextLeaves,
          locks,
          roles,
          rules,
          workingHoursPeriods,
          specialties,
          doctors
        );
        setValidationReport(report);
      }
    } catch (err) {
      console.error('Failed to sync leave entries:', err);
    }
  };

  const handleSessionsChange = (nextSessions: DoctorSession[]) => {
    setSessions(nextSessions);
    if (activeSchedule) {
      const report = ScheduleValidator.validate(
        activeSchedule,
        assignments,
        nurses,
        seniorityLevels,
        dutyWindows,
        nextSessions,
        leaveEntries,
        locks,
        roles,
        rules,
        workingHoursPeriods,
        specialties,
        doctors
      );
      setValidationReport(report);
    }
  };

  // Calculate blocks for active schedule
  const getScheduleBlocks = () => {
    if (!activeSchedule) return [];
    const start = new Date(activeSchedule.startDate);
    const end = new Date(activeSchedule.endDate);
    const totalDays =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const blockSizeDays = activeSchedule.blockWeeks * 7;
    const numBlocks = Math.ceil(totalDays / blockSizeDays);

    const blocks: { index: number; label: string; startDay: number; endDay: number; startDate: string; endDate: string }[] = [];
    for (let b = 0; b < numBlocks; b++) {
      const bStartDay = b * blockSizeDays + 1;
      const bEndDay = Math.min((b + 1) * blockSizeDays, totalDays);

      const bStartDateObj = new Date(start);
      bStartDateObj.setUTCDate(start.getUTCDate() + (bStartDay - 1));
      const bEndDateObj = new Date(start);
      bEndDateObj.setUTCDate(start.getUTCDate() + (bEndDay - 1));

      const bStartStr = bStartDateObj.toISOString().split('T')[0];
      const bEndStr = bEndDateObj.toISOString().split('T')[0];

      blocks.push({
        index: b,
        label: `Block ${b + 1}/${numBlocks} (${formatDate(bStartStr)} – ${formatDate(bEndStr)})`,
        startDay: bStartDay,
        endDay: bEndDay,
        startDate: bStartStr,
        endDate: bEndStr,
      });
    }
    return blocks;
  };

  const blocks = getScheduleBlocks();
  const currentBlock = blocks[selectedBlockIndex] || blocks[0];

  // Duration readout helper
  const computeDurationReadout = (startStr: string, endStr: string, blockWeeks: number) => {
    if (!startStr || !endStr) return '';
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (start > end) return 'Invalid date range';
    const totalDays =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const weeks = (totalDays / 7).toFixed(1);
    const blockSizeDays = blockWeeks * 7;
    const numBlocks = Math.ceil(totalDays / blockSizeDays);

    return `${totalDays} days · ${weeks} weeks → ${numBlocks} block(s) (${blockWeeks}w each)`;
  };

  const computeSuggestedHours = (startStr: string, endStr: string) => {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const totalDays =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.round((totalDays * 8 * 5) / 7);
  };

  // --- CREATE SCHEDULE FLOW ---
  const handleScheduleCreated = async (createdSchedule: Schedule, generateImmediately: boolean) => {
    await loadData();
    setActiveSchedule(createdSchedule);
    setSelectedBlockIndex(0);
    triggerToast(`Schedule "${createdSchedule.name}" created.`);

    if (generateImmediately) {
      handleOpenPreflight('GENERATE_ALL', createdSchedule);
    }
  };

  // --- DELETE SCHEDULE FLOW ---
  const handleConfirmDeleteSchedule = async (sched: Schedule) => {
    try {
      const result = await deleteEntireSchedule(repo, sched.id, context.currentUser?.name || 'Admin');

      const remainingSchedules = schedules.filter((s) => s.id !== sched.id);
      setSchedules(remainingSchedules);

      setIsDeleteScheduleModalOpen(false);
      setScheduleToDelete(null);
      triggerToast(`Schedule "${result.scheduleName}" was permanently deleted.`);

      if (activeSchedule?.id === sched.id) {
        if (remainingSchedules.length > 0) {
          const nextSched = remainingSchedules[0];
          setActiveSchedule(nextSched);
          setSelectedBlockIndex(0);
          const asgns = await repo.list('assignments');
          setAssignments(asgns.filter((a) => a.scheduleId === nextSched.id));
          const vList = await repo.list('versions');
          setVersions(vList.filter((v) => v.scheduleId === nextSched.id).sort((a, b) => b.number - a.number));
        } else {
          setActiveSchedule(null);
          setAssignments([]);
          setVersions([]);
        }
      }
    } catch (err: any) {
      console.error('Delete schedule failed:', err);
      alert(`Delete schedule failed: ${err.message || 'Unknown error'}`);
    }
  };

  // Helper to determine Dedicated Period or Prorated chip for a schedule
  const getSchedulePeriodChip = (sched: Schedule) => {
    if (sched.periodName) {
      const isExact = !sched.periodName.toLowerCase().includes('prorated');
      return {
        label: isExact ? `Period: ${sched.periodName} · ${sched.hoursTargetFullTime}h` : sched.periodName,
        tooltip: `Period target: ${sched.hoursTargetFullTime}h FT contracted hours`,
        isExact,
      };
    }

    if (workingHoursPeriods.length > 0 && sched.startDate && sched.endDate) {
      const calc = calculateWorkingHoursForDateRange(sched.startDate, sched.endDate, workingHoursPeriods);
      if (calc.isExactMatch && calc.matchedPeriod) {
        return {
          label: `Period: ${calc.matchedPeriod.name} · ${sched.hoursTargetFullTime || calc.targetHours}h`,
          tooltip: `Exact match for dedicated cycle ${calc.matchedPeriod.name} (${calc.targetHours}h FT)`,
          isExact: true,
        };
      }
      return {
        label: `${calc.totalScheduleDays}d Prorated · ${sched.hoursTargetFullTime || calc.targetHours}h`,
        tooltip: calc.description,
        isExact: false,
      };
    }

    return {
      label: `${sched.hoursTargetFullTime || 160}h Target`,
      tooltip: `Standard target: ${sched.hoursTargetFullTime || 160} working hours`,
      isExact: false,
    };
  };

  // --- OPEN GENERATION PRE-FLIGHT ---
  const handleOpenPreflight = async (mode: RegenerateMode, targetSchedule?: Schedule) => {
    const sched = targetSchedule || activeSchedule;
    if (!sched) return;

    let currentSessions = sessions;

    // STEP 1: Always guarantee the doctor's recurring schedule is filled first for the schedule duration
    if (sched.startDate && sched.endDate && doctors.length > 0) {
      try {
        const fillResult = await populateRecurringDoctorSessionsForSchedule({
          repo,
          startDate: sched.startDate,
          endDate: sched.endDate,
          doctors,
        });

        if (fillResult.createdCount > 0) {
          currentSessions = await repo.list('doctorSessions');
          setSessions(currentSessions);
        }
      } catch (err) {
        console.error('Failed to auto-populate doctor recurring schedule on pre-flight:', err);
      }
    }

    const summary = SchedulingEngine.computePreflight(
      sched,
      nurses,
      doctors,
      currentSessions,
      locks,
      leaveEntries,
      roles,
      rules,
      dutyWindows,
      workingHoursPeriods
    );

    setActiveGenerationMode(mode);
    setClearIncludeManual(false);
    setPreflightSummary(summary);
    setGenerationProgress(null);
    setIsPreflightModalOpen(true);
  };

  // --- TOGGLE NURSE CLINIC HARD/SOFT RULE FROM PRE-FLIGHT MODAL ---
  const handleUpdateNurseClinicRule = async (severity: 'HARD' | 'SOFT', enabled: boolean) => {
    try {
      const existing = rules.find(
        (r) => r.templateKey === 'DEDICATED_NURSE_CLINIC' || r.id === 'rule-nurse-clinic'
      );
      let updatedRules = [...rules];
      if (existing) {
        await repo.update('rules', existing.id, { severity, enabled });
        updatedRules = rules.map((r) =>
          r.id === existing.id ? { ...r, severity, enabled } : r
        );
      } else {
        const created = await repo.create('rules', {
          id: 'rule-nurse-clinic',
          name: 'Dedicated nurse clinic coverage (not assigned to doctor)',
          templateKey: 'DEDICATED_NURSE_CLINIC',
          scope: 'PER_DAY',
          metric: 'DUTIES_WITH_END_TIME_X_COUNT',
          operator: 'MIN',
          value: 1,
          severity,
          enabled,
        });
        updatedRules.push(created);
      }
      setRules(updatedRules);

      const targetSched = activeSchedule;
      if (targetSched) {
        const summary = SchedulingEngine.computePreflight(
          targetSched,
          nurses,
          doctors,
          sessions,
          locks,
          leaveEntries,
          roles,
          updatedRules,
          dutyWindows,
          workingHoursPeriods
        );
        setPreflightSummary(summary);
      }
    } catch (err) {
      console.error('Failed to update nurse clinic rule:', err);
    }
  };

  // --- RUN DETERMINISTIC ENGINE PASS ---
  const handleExecuteGeneration = async () => {
    if (!activeSchedule) return;
    setIsGenerating(true);

    try {
      setUndoStack((prev) => [assignments, ...prev].slice(0, 50));
      setRedoStack([]);

      if (activeGenerationMode === 'CLEAR_GENERATED') {
        const result = await SchedulingEngine.generate(
          activeSchedule,
          'CLEAR_GENERATED',
          assignments,
          nurses,
          seniorityLevels,
          dutyWindows,
          roles,
          specialties,
          sessions,
          locks,
          leaveEntries,
          rules,
          (progress) => {
            setGenerationProgress(progress);
          },
          workingHoursPeriods
        );

        let finalAssignments = result.assignments;
        if (clearIncludeManual) {
          finalAssignments = finalAssignments.filter((a) => a.source === 'LOCK');
        }

        await syncScheduleAssignments(repo, activeSchedule.id, finalAssignments);
        setAssignments(finalAssignments);

        const report = ScheduleValidator.validate(
          activeSchedule,
          finalAssignments,
          nurses,
          seniorityLevels,
          dutyWindows,
          sessions,
          leaveEntries,
          locks,
          roles,
          rules,
          workingHoursPeriods,
          specialties,
          doctors
        );
        setValidationReport(report);

        const clearedCount = assignments.length - finalAssignments.length;
        triggerToast(
          `Schedule cleared: removed ${clearedCount} shift assignments (${finalAssignments.length} locked shifts preserved).`
        );
        setIsPreflightModalOpen(false);
        setIsGenerating(false);
        return;
      }

      // STEP 1: Guarantee doctor's recurring schedule is filled first for the entire schedule period
      let currentSessions = sessions;
      if (activeSchedule.startDate && activeSchedule.endDate && doctors.length > 0) {
        try {
          const fillResult = await populateRecurringDoctorSessionsForSchedule({
            repo,
            startDate: activeSchedule.startDate,
            endDate: activeSchedule.endDate,
            doctors,
          });
          if (fillResult.createdCount > 0) {
            currentSessions = await repo.list('doctorSessions');
            setSessions(currentSessions);
          }
        } catch (fillErr) {
          console.error('Failed to auto-populate doctor recurring schedule before generation:', fillErr);
        }
      }

      const result = await SchedulingEngine.generate(
        activeSchedule,
        activeGenerationMode,
        assignments,
        nurses,
        seniorityLevels,
        dutyWindows,
        roles,
        specialties,
        currentSessions,
        locks,
        leaveEntries,
        rules,
        (progress) => {
          setGenerationProgress(progress);
        },
        workingHoursPeriods,
        doctors
      );

      // If engine resolved an authoritative period target, synchronize the schedule record
      let effectiveSchedule = activeSchedule;
      if (
        result.effectiveFullTimeTarget &&
        (result.effectiveFullTimeTarget !== activeSchedule.hoursTargetFullTime ||
          (result.periodName && result.periodName !== activeSchedule.periodName))
      ) {
        const scheduleUpdates: Partial<Schedule> = {
          hoursTargetFullTime: result.effectiveFullTimeTarget,
        };
        if (result.periodName) {
          scheduleUpdates.periodName = result.periodName;
        }
        await repo.update('schedules', activeSchedule.id, scheduleUpdates);
        effectiveSchedule = {
          ...activeSchedule,
          ...scheduleUpdates,
        };
        setActiveSchedule(effectiveSchedule);
        setSchedules((prev) =>
          prev.map((s) => (s.id === effectiveSchedule.id ? effectiveSchedule : s))
        );
      }

      await syncScheduleAssignments(repo, effectiveSchedule.id, result.assignments);
      setAssignments(result.assignments);

      const report = ScheduleValidator.validate(
        effectiveSchedule,
        result.assignments,
        nurses,
        seniorityLevels,
        dutyWindows,
        currentSessions,
        leaveEntries,
        locks,
        roles,
        rules,
        workingHoursPeriods,
        specialties,
        doctors
      );
      setValidationReport(report);

      const overtimeFindings = report.findings.filter(
        (f) => f.category === 'HOURS_IMBALANCE' && f.id.startsWith('hours-over-')
      );
      const overtimeStatus =
        overtimeFindings.length === 0
          ? ` • Hours target: 100% compliant (0 overtime)`
          : ` • Overtime alerts: ${overtimeFindings.length}`;

      const pairingSummary =
        result.doctorSessionsTotal && result.doctorSessionsTotal > 0
          ? ` • Doctor clinic pairing: ${result.doctorPriority1PairingsCount || 0} Priority #1, ${result.doctorPriority2PairingsCount || 0} Priority #2, ${result.doctorSpecialtyPairingsCount || 0} Specialty, ${result.doctorFallbackPairingsCount || 0} fallback`
          : '';

      triggerToast(
        `Generated ${result.assignments.length} assignments in ${result.generationDurationMs}ms${overtimeStatus}${pairingSummary} (${result.preservedLocksCount} locks preserved).`
      );
      setIsPreflightModalOpen(false);
      setIsGenerating(false);
    } catch (err: any) {
      triggerToast(`Operation failed: ${err.message}`);
      setIsGenerating(false);
    }
  };

  // --- SAVE VERSION WITH NOTE (Phase 10: 5-minute checkpoint replacement) ---
  const handleSaveVersion = async () => {
    if (!activeSchedule) return;
    try {
      const allVersions = await repo.list('versions');
      const schedVersions = allVersions
        .filter((v) => v.scheduleId === activeSchedule.id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const latestVer = schedVersions[0];
      const now = new Date();
      const fiveMinMs = 5 * 60 * 1000;
      const isWithin5Min =
        latestVer &&
        !latestVer.isPublished &&
        now.getTime() - new Date(latestVer.timestamp).getTime() < fiveMinMs;

      if (isWithin5Min) {
        // Replace existing version checkpoint within 5 minutes
        await repo.update('versions', latestVer.id, {
          timestamp: now.toISOString(),
          note: saveNote.trim() || latestVer.note || 'Manual save checkpoint',
          author: context.currentUser?.name || latestVer.author,
          snapshot: {
            schedule: activeSchedule,
            assignments,
            leaveEntries,
            locks,
            rulesSnapshot: rules,
          },
        });
        await repo.update('schedules', activeSchedule.id, {
          updatedAt: now.toISOString(),
        });
        triggerToast(`Updated checkpoint v${latestVer.number} (within 5m window).`);
      } else {
        // Create brand new version
        const nextVerNumber = (activeSchedule.activeVersionNumber || 1) + 1;
        await repo.update('schedules', activeSchedule.id, {
          activeVersionNumber: nextVerNumber,
          updatedAt: now.toISOString(),
        });

        await repo.create('versions', {
          scheduleId: activeSchedule.id,
          number: nextVerNumber,
          timestamp: now.toISOString(),
          author: context.currentUser?.name || 'Dr. Fatima (Admin)',
          note: saveNote.trim() || 'Manual save checkpoint',
          snapshot: {
            schedule: activeSchedule,
            assignments,
            leaveEntries,
            locks,
            rulesSnapshot: rules,
          },
          isPublished: false,
        });

        triggerToast(`Roster saved as v${nextVerNumber}.`);
      }

      setIsSaveModalOpen(false);
      setSaveNote('');
      loadData();
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    }
  };

  // --- LOCK OVERRIDE PROTOCOL ---
  const handleExecuteLockOverride = async () => {
    if (!activeLockToOverride) return;

    try {
      await repo.remove('locks', activeLockToOverride.id);
      await repo.create('audit', {
        actor: context.currentUser?.name || 'Admin',
        action: 'OVERRIDE_LOCK',
        entity: 'LockEntry',
        entityId: activeLockToOverride.id,
        before: activeLockToOverride,
        note: `User confirmed OVERRIDE protocol to unlock pinned day on ${formatDate(activeLockToOverride.date)}.`,
        timestamp: new Date().toISOString(),
      });

      triggerToast('Lock successfully removed via OVERRIDE protocol.');
      setIsOverrideModalOpen(false);
      setActiveLockToOverride(null);
      setOverrideInput('');
      loadData();
    } catch (err: any) {
      triggerToast(`Override failed: ${err.message}`);
    }
  };

  // Undo / Redo
  const handleUndo = async () => {
    if (undoStack.length === 0 || !activeSchedule) return;
    const previous = undoStack[0];
    const nextUndo = undoStack.slice(1);

    setRedoStack((prev) => [assignments, ...prev].slice(0, 50));
    setUndoStack(nextUndo);

    await syncScheduleAssignments(repo, activeSchedule.id, previous);
    setAssignments(previous);
    triggerToast('Undo applied.');
  };

  const handleRedo = async () => {
    if (redoStack.length === 0 || !activeSchedule) return;
    const next = redoStack[0];
    const nextRedo = redoStack.slice(1);

    setUndoStack((prev) => [assignments, ...prev].slice(0, 50));
    setRedoStack(nextRedo);

    await syncScheduleAssignments(repo, activeSchedule.id, next);
    setAssignments(next);
    triggerToast('Redo applied.');
  };

  // Jump to cell helper
  const handleJumpToCell = (nurseId: string, date: string) => {
    setActiveTab('roster');
    // Find block that contains this date
    const targetBlockIdx = blocks.findIndex(
      (b) => date >= b.startDate && date <= b.endDate
    );
    if (targetBlockIdx !== -1) {
      setSelectedBlockIndex(targetBlockIdx);
    }
  };

  // Block dates array for current block (or full month if all days expanded)
  const blockDates: string[] = [];
  if (activeSchedule) {
    const s = new Date(activeSchedule.startDate);
    const e = new Date(activeSchedule.endDate);
    const totalDays = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const startDay = isAllDaysExpanded ? 1 : (currentBlock ? currentBlock.startDay : 1);
    const endDay = isAllDaysExpanded ? totalDays : (currentBlock ? currentBlock.endDay : totalDays);
    for (let day = startDay; day <= endDay; day++) {
      const d = new Date(s);
      d.setUTCDate(s.getUTCDate() + (day - 1));
      blockDates.push(d.toISOString().split('T')[0]);
    }
  }

  return (
    <div
      className={`flex flex-col overflow-hidden bg-slate-50 select-none ${
        isExpandedView
          ? 'fixed inset-0 z-40 bg-slate-50 shadow-2xl animate-in fade-in duration-150'
          : 'h-full'
      }`}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 6.1 Shared Toolbar ("Ribbon-Lite", Row 1: File & Global Ops) */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 z-20">
        <div className="flex items-center gap-2">
          {/* Schedule Picker Button */}
          <button
            onClick={() => {
              repo.list('schedules').then((schedList) => {
                const unique = Array.from(new Map(schedList.map((s) => [s.id, s])).values());
                setSchedules(unique);
              });
              setIsSchedulePickerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-300 hover:border-indigo-400 hover:bg-slate-50 rounded text-slate-800 font-bold transition-colors cursor-pointer"
            title="Open or switch schedules (My Schedules & Shared with me)"
          >
            <FolderOpen className="w-3.5 h-3.5 text-indigo-600" />
            <span className="truncate max-w-[180px]">
              {activeSchedule ? activeSchedule.name : 'Select Schedule'}
            </span>
            <span className="text-[10px] text-slate-400 font-normal">▾</span>
          </button>

          {/* New Schedule Button with custom date picker */}
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-semibold rounded cursor-pointer transition-colors shadow-2xs"
            title="Create a new schedule with custom start and end dates"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Schedule</span>
          </button>

          <span className="text-slate-400">·</span>
          <span className="text-slate-600 font-mono tabular-nums hidden sm:inline">
            {activeSchedule ? `${formatDate(activeSchedule.startDate)} to ${formatDate(activeSchedule.endDate)}` : ''}
          </span>
          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono font-bold">
            {activeSchedule?.status || 'DRAFT'} v{activeSchedule?.activeVersionNumber || 1}
          </span>

          {activeSchedule && (() => {
            const chip = getSchedulePeriodChip(activeSchedule);
            return (
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold inline-flex items-center gap-1 border shadow-2xs ${
                  chip.isExact
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                }`}
                title={chip.tooltip}
              >
                <Clock className="w-3 h-3 text-indigo-600" />
                <span>{chip.label}</span>
              </span>
            );
          })()}

          {context.currentUser?.role === 'EDITOR' && (
            <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-mono font-bold">
              EDITOR MODE
            </span>
          )}

          {isExpandedView && (
            <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono font-bold inline-flex items-center gap-1 border border-indigo-200">
              <Maximize2 className="w-3 h-3 text-indigo-600" />
              <span>FULLSCREEN WORKSPACE (ESC TO EXIT)</span>
            </span>
          )}

          <button
            onClick={() => setIsSaveModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded text-slate-700 font-medium cursor-pointer ml-1 shadow-2xs"
            title="Save version with note"
          >
            <Save className="w-3 h-3 text-indigo-600" />
            <span>Save</span>
          </button>

          <button
            onClick={() => setIsCompareModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium cursor-pointer shadow-2xs"
            title="Compare versions & audit cell diffs"
          >
            <Diff className="w-3 h-3 text-indigo-600" />
            <span>Diff History</span>
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-semibold rounded cursor-pointer shadow-2xs"
            title="Export Excel (.xlsx), CSV, A3 Landscape Print, or Per-Nurse Packets"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export ▾</span>
          </button>

          {/* Publish ▾ Dropdown (Phase 13) */}
          <div className="relative">
            <button
              onClick={() => setIsPublishDropdownOpen(!isPublishDropdownOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded cursor-pointer shadow-2xs transition-colors"
              title="Publish official schedule or send change alerts to nurses"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Publish ▾</span>
            </button>

            {isPublishDropdownOpen && (
              <div
                className="absolute left-0 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-30 text-xs animate-in fade-in duration-100"
                onMouseLeave={() => setIsPublishDropdownOpen(false)}
              >
                <button
                  onClick={() => {
                    setIsPublishDropdownOpen(false);
                    setPublishWizardMode('PUBLISH');
                    setIsPublishModalOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-slate-800 hover:bg-indigo-50 hover:text-indigo-900 flex items-center gap-2.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <div>
                    <div className="font-bold">Publish Official Roster</div>
                    <div className="text-[10px] text-slate-500">Official release &amp; email dispatch</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsPublishDropdownOpen(false);
                    setPublishWizardMode('CHANGE');
                    setIsPublishModalOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-slate-800 hover:bg-amber-50 hover:text-amber-900 flex items-center gap-2.5 cursor-pointer border-t border-slate-100"
                >
                  <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <div>
                    <div className="font-bold">Send Change Alerts</div>
                    <div className="text-[10px] text-slate-500">Notify staff of shift modifications</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsShareModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded cursor-pointer shadow-2xs"
            title="Share view-only links & invite editors"
          >
            <Share2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Share</span>
          </button>

          <button
            onClick={() => setIsFairnessModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-900 font-semibold rounded cursor-pointer shadow-2xs"
            title="Fairness dashboard & automated parity rebalancing"
          >
            <Scale className="w-3.5 h-3.5 text-amber-700" />
            <span>Fairness</span>
          </button>

          <button
            onClick={() => setIsTemplateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded cursor-pointer shadow-2xs"
            title="Manage weekly roster templates & copy previous period"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span>Templates</span>
          </button>

          <button
            onClick={() => setIsSwapModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded cursor-pointer shadow-2xs"
            title="Exchange shifts between two nurses with live safety validation"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-slate-600" />
            <span>Swap</span>
          </button>

          {lastAutosavedAt && (
            <span
              className="text-[10px] text-slate-400 font-mono hidden md:inline"
              title="Draft assignments automatically saved every 30s"
            >
              Autosaved {lastAutosavedAt}
            </span>
          )}
        </div>

        {/* Engine Generation & Recovery Tools */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenPreflight('GENERATE_ALL')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium transition-colors shadow-xs cursor-pointer"
            title="Wipes generated cells and places deterministic nurse assignments"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Generate All</span>
          </button>

          <button
            onClick={() => handleOpenPreflight('EMPTY_ONLY')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded font-medium transition-colors cursor-pointer"
            title="Fill only empty unassigned cells"
          >
            <Plus className="w-3 h-3 text-slate-500" />
            <span>Fill Empty</span>
          </button>

          <button
            onClick={() => handleOpenPreflight('REBALANCE')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded font-medium transition-colors cursor-pointer"
            title="Re-optimize soft rules while preserving manual cells & locks"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Rebalance</span>
          </button>

          <button
            onClick={() => handleOpenPreflight('CLEAR_GENERATED')}
            className="inline-flex items-center gap-1 px-2 py-1.5 border border-slate-200 hover:bg-red-50 text-red-600 rounded font-medium transition-colors cursor-pointer"
            title="Remove generated cells (keeps pinned locks & manual edits)"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>

          <div className="h-4 w-px bg-slate-200" />

          {/* Undo / Redo */}
          <button
            disabled={undoStack.length === 0}
            onClick={handleUndo}
            className="px-2 py-1 border border-slate-200 rounded disabled:opacity-30 hover:bg-slate-50 text-slate-700 cursor-pointer font-mono"
            title="Undo (Ctrl+Z)"
          >
            Undo ({undoStack.length})
          </button>
          <button
            disabled={redoStack.length === 0}
            onClick={handleRedo}
            className="px-2 py-1 border border-slate-200 rounded disabled:opacity-30 hover:bg-slate-50 text-slate-700 cursor-pointer font-mono"
            title="Redo (Ctrl+Y)"
          >
            Redo
          </button>

          <div className="h-4 w-px bg-slate-200" />

          {/* Expand Viewport Button */}
          <button
            onClick={() => setIsExpandedView(!isExpandedView)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded font-semibold text-xs transition-colors cursor-pointer shadow-2xs ${
              isExpandedView
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700'
            }`}
            title={isExpandedView ? 'Exit expanded screen view (Esc)' : 'Expand schedule view to full screen'}
          >
            {isExpandedView ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Exit Expand</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Expand View</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Top Validation Alert Banner (Total findings count + Top 3 Plain Language Findings) */}
      {(validationReport.errorCount > 0 || validationReport.warnCount > 0) && (
        <div
          onClick={() => setActiveTab('warnings')}
          className={`px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-3 border-b cursor-pointer transition-colors shrink-0 ${
            validationReport.errorCount > 0
              ? 'bg-rose-50 text-rose-900 border-rose-200 hover:bg-rose-100/80'
              : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100/80'
          }`}
          title="Click to view all findings in the Warnings sheet"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <AlertTriangle className={`w-4 h-4 shrink-0 ${validationReport.errorCount > 0 ? 'text-rose-600' : 'text-amber-600'}`} />
            <span className="font-bold">
              {validationReport.errorCount > 0
                ? `${validationReport.errorCount} Error${validationReport.errorCount === 1 ? '' : 's'}, ${validationReport.warnCount} Warning${validationReport.warnCount === 1 ? '' : 's'}`
                : `${validationReport.warnCount} Validation Warning${validationReport.warnCount === 1 ? '' : 's'}`}:
            </span>
            <div className="flex items-center gap-2 truncate text-[11px]">
              {validationReport.findings.slice(0, 3).map((f, i) => (
                <span key={f.id} className="truncate max-w-sm">
                  {i > 0 && <span className="opacity-40 mr-2">·</span>}
                  {f.message}
                </span>
              ))}
              {validationReport.findings.length > 3 && (
                <span className="font-semibold underline ml-1">
                  +{validationReport.findings.length - 3} more
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-900 text-xs shrink-0">
            <span>Open Warnings Sheet</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      )}

      {/* Main Viewport: Swappable Workbook Sheets */}
      <div className="flex-1 overflow-hidden relative">
        {!activeSchedule ? (
          <div className="h-full flex items-center justify-center p-8 text-center bg-slate-50">
            <div className="max-w-md bg-white border border-slate-200 rounded-lg p-8 shadow-xs space-y-4">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
                <CalendarRange className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">No Active Schedules Found</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  The schedule database is currently empty. You can create a new schedule period from scratch with custom dates by clicking "New Schedule".
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setIsNewModalOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold transition-colors shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Schedule</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'roster' && (
              <WorkbookGrid
                schedule={activeSchedule}
                assignments={assignments}
                nurses={nurses}
                doctors={doctors}
                sessions={sessions}
                locks={locks}
                leaveEntries={leaveEntries}
                leaveTypes={leaveTypes}
                dutyWindows={dutyWindows}
                seniorityLevels={seniorityLevels}
                roles={roles}
                specialties={specialties}
                holidays={holidays}
                validationReport={validationReport}
                currentBlockIndex={selectedBlockIndex}
                onBlockChange={(idx) => setSelectedBlockIndex(idx)}
                onAssignmentsChange={handleAssignmentsChange}
                onLocksChange={handleLocksChange}
                onLeaveEntriesChange={handleLeaveEntriesChange}
                onNavigateTab={(tab) => setActiveTab(tab)}
                isAllDaysExpanded={isAllDaysExpanded}
                onToggleExpandDays={() => setIsAllDaysExpanded(!isAllDaysExpanded)}
                isExpandedView={isExpandedView}
                onToggleExpandView={() => setIsExpandedView(!isExpandedView)}
                onOpenLockOverrideModal={(lock) => {
                  setActiveLockToOverride(lock);
                  setOverrideInput('');
                  setIsOverrideModalOpen(true);
                }}
              />
            )}

            {activeTab === 'doctors' && (
              <DoctorsScheduleSheet
                doctors={doctors}
                sessions={sessions}
                specialties={specialties}
                blockDates={blockDates}
                schedule={activeSchedule}
                isAllDaysExpanded={isAllDaysExpanded}
                onToggleExpandDays={() => setIsAllDaysExpanded(!isAllDaysExpanded)}
                onDoctorsChange={(nextDocs) => setDoctors(nextDocs)}
                onSessionsChange={handleSessionsChange}
                assignments={assignments}
                nurses={nurses}
              />
            )}

            {activeTab === 'coverage' && (
              <CoverageSheet
                blockDates={blockDates}
                sessions={sessions}
                assignments={assignments}
                dutyWindows={dutyWindows}
                roles={roles}
                nurses={nurses}
                seniorityLevels={seniorityLevels}
              />
            )}

            {activeTab === 'warnings' && (
              <WarningsSheet
                validationReport={validationReport}
                onGoToCell={handleJumpToCell}
              />
            )}

            {activeTab === 'leave' && (
              <LeaveAndLocksSheet
                scheduleStartDate={activeSchedule.startDate}
                scheduleEndDate={activeSchedule.endDate}
                leaveEntries={leaveEntries}
                locks={locks}
                nurses={nurses}
                leaveTypes={leaveTypes}
                dutyWindows={dutyWindows}
                onGoToCell={handleJumpToCell}
              />
            )}

            {activeTab === 'hours' && (
              <HoursAccountingSheet
                schedule={activeSchedule}
                assignments={assignments}
                nurses={nurses}
                dutyWindows={dutyWindows}
                leaveEntries={leaveEntries}
                leaveTypes={leaveTypes}
                seniorityLevels={seniorityLevels}
                doctors={doctors}
                roles={roles}
                specialties={specialties}
                quotas={quotas}
              />
            )}

            {activeTab === 'legend' && (
              <div className="p-6 max-w-4xl mx-auto space-y-4 text-xs">
                <h2 className="text-base font-bold text-slate-800">
                  Clinic Workbook Acronyms, Rules &amp; Color Coding Legend
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-white border border-slate-200 rounded space-y-2">
                    <span className="font-semibold text-slate-700 block">Duty Windows:</span>
                    {dutyWindows.map((dw) => (
                      <div key={dw.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white px-2 py-0.5 rounded font-mono" style={{ backgroundColor: dw.color }}>
                            {dw.acronym}
                          </span>
                          <span className="font-medium text-slate-800">{dw.name}</span>
                          {dw.isPriority ? (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                              <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                              Priority Duty
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-400 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                              Standard
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-slate-500">{dw.startTime}–{dw.endTime}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-white border border-slate-200 rounded space-y-2">
                    <span className="font-semibold text-slate-700 block">Leave Types:</span>
                    {leaveTypes.map((lt) => (
                      <div key={lt.id} className="flex items-center justify-between">
                        <span className="font-bold text-white px-2 py-0.5 rounded font-mono" style={{ backgroundColor: lt.color }}>
                          {lt.acronym}
                        </span>
                        <span className="font-medium text-slate-800">{lt.name}</span>
                        <span className="font-mono text-slate-500">{typeof lt.creditedHours === 'number' ? `${lt.creditedHours}h` : 'match'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Sheet Tabs (Excel Workbook Metaphor) */}
      <div className="h-9 bg-slate-200 border-t border-slate-300 px-2 flex items-center gap-1 shrink-0 overflow-x-auto select-none">
        {[
          { id: 'roster', label: 'Roster Grid' },
          { id: 'doctors', label: "Doctors' Schedule" },
          { id: 'coverage', label: 'Hourly Coverage' },
          { id: 'warnings', label: `Warnings (${validationReport.errorCount + validationReport.warnCount})` },
          { id: 'leave', label: 'Leave & Locks' },
          { id: 'hours', label: 'Hours & Equity' },
          { id: 'legend', label: 'Legend' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-1 text-xs font-medium rounded-t transition-colors cursor-pointer border-t border-x ${
              activeTab === tab.id
                ? 'bg-white text-indigo-700 border-slate-300 shadow-xs font-bold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-50 border-transparent hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* --- SAVE VERSION WITH NOTE MODAL --- */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-sm w-full p-4 space-y-3 text-xs">
            <h3 className="font-bold text-slate-900 text-sm">Save Roster Version</h3>
            <p className="text-[11px] text-slate-500">
              Creates an immutable version checkpoint with a snapshot of all assignments, locks, and leave.
            </p>
            <input
              type="text"
              value={saveNote}
              onChange={(e) => setSaveNote(e.target.value)}
              placeholder="e.g. Swapped Dr. Ali's Thursday session"
              className="w-full px-3 py-1.5 border border-slate-300 rounded font-medium"
            />
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveVersion}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium cursor-pointer"
              >
                Save Version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- LOCK OVERRIDE MODAL --- */}
      {isOverrideModalOpen && activeLockToOverride && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-red-200 shadow-2xl max-w-md w-full p-5 space-y-4 text-xs animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-red-600">
              <Shield className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">
                Non-Changeable Day Override Protocol
              </h3>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-900 space-y-1.5 leading-relaxed">
              <p className="font-semibold text-xs">
                Non-changeable day. This was pinned on {formatDate(activeLockToOverride.date)} and will not be overwritten by generation.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-slate-700">
                  To remove this lock and permit re-scheduling, confirm below:
                </label>
                <button
                  type="button"
                  onClick={() => setOverrideInput('OVERRIDE')}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline"
                >
                  Quick-fill OVERRIDE
                </button>
              </div>
              <input
                type="text"
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleExecuteLockOverride();
                  }
                }}
                placeholder="OVERRIDE"
                className="w-full px-3 py-2 border-2 border-red-300 rounded font-mono font-bold text-center tracking-wider text-sm focus:outline-none focus:border-red-500 uppercase"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOverrideModalOpen(false)}
                className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded cursor-pointer"
              >
                Keep Pinned
              </button>
              <button
                type="button"
                onClick={handleExecuteLockOverride}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold cursor-pointer transition-colors shadow-xs"
              >
                Confirm OVERRIDE &amp; Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- PRE-FLIGHT GENERATION MODAL --- */}
      {isPreflightModalOpen && preflightSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-xl w-full p-5 space-y-4 text-xs animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Generation Pre-flight: {preflightSummary.scheduleName}
                </h3>
              </div>
              {!isGenerating && (
                <button
                  onClick={() => setIsPreflightModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Pre-flight Diagnostic Metrics / Clear Mode Details */}
            {activeGenerationMode === 'CLEAR_GENERATED' ? (
              <div className="space-y-3">
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-900 text-xs flex items-start gap-2.5">
                  <Trash2 className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-red-950">Clear Active Schedule Shifts</p>
                    <p className="text-red-800 text-[11px] leading-relaxed">
                      This action will wipe generated shift assignments ({assignments.filter((a) => a.source === 'GENERATED').length} shifts) from the active schedule database and persistence. Pinned locks and approved leave days are protected and will remain intact.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 text-[10px] block">Active Shifts</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {assignments.length} Shifts
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 text-[10px] block">Pinned Locks</span>
                    <span className="font-bold text-amber-700 font-mono">
                      {preflightSummary.existingLocksCount} Pinned (Safe)
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 text-[10px] block">Approved Leave</span>
                    <span className="font-bold text-blue-700 font-mono">
                      {preflightSummary.existingLeaveDaysCount} Days Off
                    </span>
                  </div>
                </div>

                <label className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded cursor-pointer text-slate-800 font-medium text-[11px]">
                  <input
                    type="checkbox"
                    checked={clearIncludeManual}
                    onChange={(e) => setClearIncludeManual(e.target.checked)}
                    className="rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer"
                  />
                  <span>
                    Also clear manual cell edits ({assignments.filter((a) => a.source === 'MANUAL').length} manual cells)
                  </span>
                </label>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded text-indigo-900 text-xs flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Doctor Recurring Schedule Populated First · Nurses Paired to Assigned Doctors</span>
                  </span>
                  <span className="text-[10px] text-indigo-700 bg-white/80 px-2 py-0.5 rounded font-medium border border-indigo-200">
                    Deterministic Pairing
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 text-[10px] block">Period Span</span>
                    <span className="font-bold text-slate-900 font-mono text-xs">
                      {preflightSummary.totalDays} Days ({preflightSummary.totalBlocks} Blocks)
                    </span>
                  </div>
                  <div className="p-2 bg-emerald-50/80 rounded border border-emerald-200">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-emerald-800 font-semibold">Doctor Demand</span>
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1 rounded">PRE-FILLED ✓</span>
                    </div>
                    <span className="font-bold text-emerald-950 font-mono text-xs block mt-0.5">
                      {preflightSummary.doctorSessionsCount} Slots
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 text-[10px] block">Nurse Clinic Quota</span>
                    <span className="font-bold text-teal-700 font-mono text-xs">
                      {preflightSummary.nurseClinicSlotsCount ?? 0} Slots ({preflightSummary.nurseClinicRuleEnabled ? preflightSummary.nurseClinicRuleSeverity : 'OFF'})
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 text-[10px] block">Phlebotomy Quota</span>
                    <span className="font-bold text-slate-900 font-mono text-xs">
                      {preflightSummary.phlebotomySlotsCount} Slots
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 text-[10px] block">Active Staff</span>
                    <span className="font-bold text-slate-900 font-mono text-xs">
                      {preflightSummary.activeNursesCount} Nurses
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 text-[10px] block">Pinned Locks</span>
                    <span className="font-bold text-amber-700 font-mono text-xs">
                      {preflightSummary.existingLocksCount} Pinned (Safe)
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 text-[10px] block">Approved Leave</span>
                    <span className="font-bold text-blue-700 font-mono text-xs">
                      {preflightSummary.existingLeaveDaysCount} Days Off
                    </span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-500 text-[10px] block">Est. Assignments</span>
                    <span className="font-bold text-indigo-700 font-mono text-xs">
                      ~{preflightSummary.estimatedTotalAssignments} Shifts
                    </span>
                  </div>
                  <div className="p-2 bg-amber-50/70 rounded border border-amber-200">
                    <span className="text-amber-800 text-[10px] font-semibold flex items-center gap-1 block">
                      <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                      <span>Priority Duties</span>
                    </span>
                    <span className="font-bold text-amber-900 font-mono text-xs">
                      {preflightSummary.priorityDutiesCount ?? 0} Priority / {preflightSummary.standardDutiesCount ?? 0} Std
                    </span>
                  </div>
                  <div className="p-2 bg-indigo-50/80 rounded border border-indigo-200">
                    <span className="text-indigo-800 text-[10px] font-semibold block flex items-center gap-1">
                      <Clock className="w-3 h-3 text-indigo-600" />
                      <span>Target Hours (FT)</span>
                    </span>
                    <span className="font-bold text-indigo-950 font-mono text-xs">
                      {preflightSummary.targetWorkingHoursFullTime ?? 160}h FT
                    </span>
                    <span className="text-[10px] text-indigo-700 block truncate font-medium mt-0.5">
                      {preflightSummary.detectedPeriodName
                        ? `${preflightSummary.detectedPeriodName} (${preflightSummary.isProratedPeriod ? 'Prorated' : 'Dedicated'})`
                        : `${preflightSummary.totalDays}d Span`}
                    </span>
                  </div>
                </div>

                {preflightSummary.hoursTargetDescription && (
                  <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded text-indigo-950 text-xs flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>
                      <strong className="font-semibold">Period Contract Baseline:</strong> {preflightSummary.hoursTargetDescription}
                    </span>
                  </div>
                )}

                <div className="p-2.5 bg-amber-50/60 border border-amber-200 rounded text-amber-950 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-600 shrink-0" />
                    <span>
                      <strong className="font-semibold">Priority Duty Scheduling:</strong> {preflightSummary.priorityDutiesCount ?? 0} active priority windows are evaluated first for all clinic sessions and pool requirements. If rest limits or hours targets require, the engine automatically falls back to standard windows ({preflightSummary.standardDutiesCount ?? 0}).
                    </span>
                  </div>
                </div>

                {/* Dedicated Nurse Clinic Rule Selection: Hard vs Soft vs Off */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-teal-700 font-bold text-sm">🩺</span>
                      <div>
                        <span className="font-semibold text-slate-900 text-xs">
                          Dedicated Nurse Clinic Rule
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          Guarantee a nurse dedicated solely to Nurse Clinic (walk-ins, dressings, triage &amp; injections) who is not assigned to a doctor.
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        !preflightSummary.nurseClinicRuleEnabled
                          ? 'bg-slate-200 text-slate-600'
                          : preflightSummary.nurseClinicRuleSeverity === 'HARD'
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {!preflightSummary.nurseClinicRuleEnabled
                        ? 'DISABLED'
                        : `${preflightSummary.nurseClinicRuleSeverity} RULE`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleUpdateNurseClinicRule('HARD', true)}
                      className={`p-2 rounded border text-left cursor-pointer transition-all ${
                        preflightSummary.nurseClinicRuleEnabled &&
                        preflightSummary.nurseClinicRuleSeverity === 'HARD'
                          ? 'bg-rose-50 border-rose-400 text-rose-950 font-bold shadow-2xs ring-1 ring-rose-400'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0" />
                        <span>Hard Rule (Mandatory)</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-normal mt-0.5 leading-tight">
                        High priority: Dedicated nurse assigned first. Doctor pairings cannot override. Gaps trigger hard violations.
                      </p>
                    </button>

                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleUpdateNurseClinicRule('SOFT', true)}
                      className={`p-2 rounded border text-left cursor-pointer transition-all ${
                        preflightSummary.nurseClinicRuleEnabled &&
                        preflightSummary.nurseClinicRuleSeverity === 'SOFT'
                          ? 'bg-amber-50 border-amber-400 text-amber-950 font-bold shadow-2xs ring-1 ring-amber-400'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <span>Soft Rule (Flexible)</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-normal mt-0.5 leading-tight">
                        Optimized: Doctor clinics staffed first; remaining available nurse dedicated to Nurse Clinic. Unmet flags as warning.
                      </p>
                    </button>

                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleUpdateNurseClinicRule('SOFT', false)}
                      className={`p-2 rounded border text-left cursor-pointer transition-all ${
                        !preflightSummary.nurseClinicRuleEnabled
                          ? 'bg-slate-200 border-slate-400 text-slate-900 font-bold shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                        <span>Disabled</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-normal mt-0.5 leading-tight">
                        Do not schedule dedicated Nurse Clinic shifts during roster generation.
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Alerts & Progress Container */}
            <div>
              {preflightSummary.eveningCoverageAlert && activeGenerationMode !== 'CLEAR_GENERATED' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{preflightSummary.eveningCoverageAlert}</span>
                </div>
              )}

              {isGenerating && generationProgress && (
                <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-slate-700 font-bold">{generationProgress.statusText}</span>
                    <span className="text-indigo-600 font-bold">{generationProgress.percent}%</span>
                  </div>
                  <div className="w-full h-2 rounded bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-100"
                      style={{ width: `${generationProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setIsPreflightModalOpen(false)}
                className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleExecuteGeneration}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 ${
                  activeGenerationMode === 'CLEAR_GENERATED'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                } rounded font-medium cursor-pointer shadow-xs disabled:opacity-50 transition-colors`}
              >
                {activeGenerationMode === 'CLEAR_GENERATED' ? (
                  <Trash2 className="w-3.5 h-3.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>
                  {isGenerating
                    ? activeGenerationMode === 'CLEAR_GENERATED'
                      ? 'Clearing...'
                      : 'Generating...'
                    : activeGenerationMode === 'CLEAR_GENERATED'
                    ? 'Confirm & Clear Schedule'
                    : `Confirm & Run ${activeGenerationMode}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- VERSION COMPARE & DIFF MODAL (Phase 10) --- */}
      {activeSchedule && (
        <VersionCompareModal
          schedule={activeSchedule}
          versions={versions}
          activeAssignments={assignments}
          nurses={nurses}
          dutyWindows={dutyWindows}
          doctors={doctors}
          roles={roles}
          specialties={specialties}
          isOpen={isCompareModalOpen}
          onClose={() => setIsCompareModalOpen(false)}
        />
      )}

      {/* --- EXPORT & PRINT CENTER MODAL (Phase 11) --- */}
      {activeSchedule && (
        <ExportModal
          clinicName={context.clinicName}
          schedule={activeSchedule}
          assignments={assignments}
          nurses={nurses}
          dutyWindows={dutyWindows}
          leaveEntries={leaveEntries}
          leaveTypes={leaveTypes}
          seniorityLevels={seniorityLevels}
          doctors={doctors}
          sessions={sessions}
          roles={roles}
          specialties={specialties}
          rules={rules}
          currentBlockIndex={selectedBlockIndex}
          blockDates={blockDates}
          versionNumber={activeSchedule.activeVersionNumber || 1}
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
        />
      )}

      {/* --- SHARE & INVITE MODAL (Phase 12) --- */}
      {activeSchedule && (
        <ShareModal
          schedule={activeSchedule}
          latestPublishedVersion={versions.find((v) => v.isPublished) || null}
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          onOpenPreview={(token) => onOpenSharePreview?.(token)}
        />
      )}

      {/* --- PUBLISH WIZARD MODAL (Phase 13) --- */}
      {activeSchedule && (
        <PublishModal
          context={context}
          schedule={activeSchedule}
          assignments={assignments}
          nurses={nurses}
          dutyWindows={dutyWindows}
          doctors={doctors}
          sessions={sessions}
          roles={roles}
          specialties={specialties}
          seniorityLevels={seniorityLevels}
          rules={rules}
          leaveEntries={leaveEntries}
          leaveTypes={leaveTypes}
          versions={versions}
          workingHoursPeriods={workingHoursPeriods}
          locks={locks}
          isOpen={isPublishModalOpen}
          onClose={() => setIsPublishModalOpen(false)}
          onPublishComplete={() => {
            loadData();
            setToastMessage('Schedule published and broadcast dispatched!');
            setTimeout(() => setToastMessage(null), 3000);
          }}
          initialMode={publishWizardMode}
        />
      )}

      {/* --- SCHEDULE PICKER & "SHARED WITH ME" MODAL (Phase 12) --- */}
      {isSchedulePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-lg w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Manage &amp; Switch Schedules</h3>
              </div>
              <button
                onClick={() => setIsSchedulePickerOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* My Schedules Section */}
            <div className="space-y-2">
              <span className="font-bold text-slate-800 text-xs block">My Clinic Schedules:</span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {schedules.map((s) => {
                  const isActive = s.id === activeSchedule?.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => {
                        setActiveSchedule(s);
                        repo.list('assignments').then((asgns) => {
                          setAssignments(asgns.filter((a) => a.scheduleId === s.id));
                        });
                        repo.list('versions').then((vList) => {
                          setVersions(vList.filter((v) => v.scheduleId === s.id).sort((a, b) => b.number - a.number));
                        });
                        setIsSchedulePickerOpen(false);
                      }}
                      className={`p-3 rounded border cursor-pointer transition-colors flex items-center justify-between ${
                        isActive
                          ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold">{s.name}</span>
                          {isActive && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold text-[10px]">
                              ACTIVE
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                            {s.status} v{s.activeVersionNumber || 1}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {formatDate(s.startDate)} to {formatDate(s.endDate)} ({s.blockWeeks * 7}d blocks · {s.hoursTargetFullTime}h target)
                        </p>
                        {(() => {
                          const chip = getSchedulePeriodChip(s);
                          return (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${
                                  chip.isExact
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                }`}
                                title={chip.tooltip}
                              >
                                {chip.label}
                              </span>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setScheduleToDelete(s);
                            setIsDeleteScheduleModalOpen(true);
                          }}
                          className="p-1.5 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title={`Permanently delete schedule "${s.name}"`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Shared With Me Section (Phase 12) */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs block">
                  Shared With Me (Collaborative Rosters):
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {invitations.length} invite{invitations.length === 1 ? '' : 's'}
                </span>
              </div>

              {invitations.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {invitations.map((inv) => {
                    const linkedSched = schedules.find((s) => s.id === inv.scheduleId);
                    return (
                      <div
                        key={inv.id}
                        onClick={() => {
                          if (linkedSched) {
                            setActiveSchedule(linkedSched);
                            setIsSchedulePickerOpen(false);
                          }
                        }}
                        className="p-2.5 rounded border border-purple-200 bg-purple-50/40 hover:bg-purple-100/50 cursor-pointer transition-colors flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {linkedSched ? linkedSched.name : `Shared Schedule (${inv.scheduleId})`}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                inv.role === 'EDITOR'
                                  ? 'bg-purple-200 text-purple-900'
                                  : 'bg-slate-200 text-slate-800'
                              }`}
                            >
                              {inv.role}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Invited: {inv.email} · {inv.status}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-purple-400" />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-500 text-[11px] text-center">
                  No rosters shared with your email yet. Ask the schedule owner to invite you via the "Share" button.
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsSchedulePickerOpen(false);
                  setIsNewModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Schedule</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSchedulePickerOpen(false)}
                className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- FAIRNESS & PARITY MODAL (Phase 14.1) --- */}
      {isFairnessModalOpen && activeSchedule && (
        <FairnessModal
          schedule={activeSchedule}
          assignments={assignments}
          nurses={nurses}
          dutyWindows={dutyWindows}
          holidays={holidays}
          seniorityLevels={seniorityLevels}
          leaveEntries={leaveEntries}
          locks={locks}
          isOpen={isFairnessModalOpen}
          onClose={() => setIsFairnessModalOpen(false)}
          onApplyAssignments={(updated, note) => {
            handleAssignmentsChange(updated);
            setToastMessage(note);
          }}
        />
      )}

      {/* --- ROSTER TEMPLATES & COPY PERIOD MODAL (Phase 14.2) --- */}
      {isTemplateModalOpen && activeSchedule && (
        <TemplateModal
          schedule={activeSchedule}
          assignments={assignments}
          nurses={nurses}
          dutyWindows={dutyWindows}
          leaveEntries={leaveEntries}
          locks={locks}
          allSchedules={schedules}
          isOpen={isTemplateModalOpen}
          onClose={() => setIsTemplateModalOpen(false)}
          onApplyAssignments={(updated, note) => {
            handleAssignmentsChange(updated);
            setToastMessage(note);
          }}
        />
      )}

      {/* --- SHIFT SWAP MANAGER MODAL (Phase 14.3) --- */}
      {isSwapModalOpen && activeSchedule && (
        <SwapManagerModal
          schedule={activeSchedule}
          assignments={assignments}
          nurses={nurses}
          dutyWindows={dutyWindows}
          seniorityLevels={seniorityLevels}
          roles={roles}
          doctors={doctors}
          specialties={specialties}
          leaveEntries={leaveEntries}
          locks={locks}
          isOpen={isSwapModalOpen}
          onClose={() => setIsSwapModalOpen(false)}
          onApplySwap={(updated, note) => {
            handleAssignmentsChange(updated);
            setToastMessage(note);
          }}
        />
      )}

      {/* --- CREATE SCHEDULE MODAL --- */}
      {isNewModalOpen && (
        <CreateScheduleModal
          isOpen={isNewModalOpen}
          onClose={() => setIsNewModalOpen(false)}
          onScheduleCreated={handleScheduleCreated}
          clinicName={context.clinicName}
          existingSchedules={schedules}
        />
      )}

      {/* --- DELETE SCHEDULE VERIFICATION MODAL --- */}
      <DeleteScheduleModal
        isOpen={isDeleteScheduleModalOpen}
        schedule={scheduleToDelete}
        shiftCount={assignments.length}
        versionCount={versions.length}
        onClose={() => {
          setIsDeleteScheduleModalOpen(false);
          setScheduleToDelete(null);
        }}
        onConfirmDelete={handleConfirmDeleteSchedule}
      />
    </div>
  );
};
