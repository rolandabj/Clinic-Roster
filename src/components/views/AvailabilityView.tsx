import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarCheck2,
  Lock,
  Unlock,
  Plus,
  Upload,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Flag,
  Trash2,
  Edit2,
  Shield,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Filter,
  Save,
  X,
  Droplets,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import { ClinicContextState } from '../../types/navigation';
import { getRepository } from '../../services/repository';
import {
  Nurse,
  LeaveType,
  LeaveEntry,
  LockEntry,
  DutyWindow,
  Doctor,
  Specialty,
  ClinicalRole,
  PublicHoliday,
  IsoDateString,
  LockMode,
} from '../../types';
import { formatDate } from '../../utils/dateUtils';
import { authService } from '../../services/auth/authService';
import { ApprovalsQueuePanel } from './ApprovalsQueuePanel';
import { NurseSelfServicePanel } from './NurseSelfServicePanel';

interface AvailabilityViewProps {
  context: ClinicContextState;
}

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const AvailabilityView: React.FC<AvailabilityViewProps> = ({ context }) => {
  const currentUser = authService.getCurrentUser();
  const isMasterAdmin = currentUser?.email?.toLowerCase() === 'rolandabj@gmail.com' || currentUser?.role === 'OWNER';
  const isManager = Boolean(currentUser?.isManager) || isMasterAdmin;

  const [activeTab, setActiveTab] = useState<'calendar' | 'self-service' | 'approvals'>('calendar');
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveEntries, setLeaveEntries] = useState<LeaveEntry[]>([]);
  const [locks, setLocks] = useState<LockEntry[]>([]);
  const [dutyWindows, setDutyWindows] = useState<DutyWindow[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [clinicalRoles, setClinicalRoles] = useState<ClinicalRole[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);

  // Active Month & Period
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentMonthIndex, setCurrentMonthIndex] = useState(9); // 0-based: 9 = October

  // Drag selection state for date range leave creation
  const [dragStart, setDragStart] = useState<{ nurseId: string; day: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ nurseId: string; day: number } | null>(null);

  // Leave Entry Modal
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [editingLeaveEntry, setEditingLeaveEntry] = useState<Partial<LeaveEntry> | null>(null);
  const [selectedCellDate, setSelectedCellDate] = useState<string | null>(null);

  // Lock Entry Modal
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [editingLockEntry, setEditingLockEntry] = useState<Partial<LockEntry> | null>(null);

  // Lock Override Modal (when user clicks an existing lock)
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [activeLockToOverride, setActiveLockToOverride] = useState<LockEntry | null>(null);
  const [overrideInput, setOverrideInput] = useState('');

  // CSV Import Modal
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [csvImportLog, setCsvImportLog] = useState<string | null>(null);

  // Notification Toast
  const [notification, setNotification] = useState<string | null>(null);
  const [isDeletingLeave, setIsDeletingLeave] = useState(false);
  const [isOverridingLock, setIsOverridingLock] = useState(false);

  const repo = getRepository();

  const loadData = async () => {
    try {
      const [nList, ltList, leList, lkList, dwList, dList, spList, crList, hList] =
        await Promise.all([
          repo.list('nurses'),
          repo.list('leaveTypes'),
          repo.list('leaveEntries'),
          repo.list('locks'),
          repo.list('dutyWindows'),
          repo.list('doctors'),
          repo.list('specialties'),
          repo.list('clinicalRoles'),
          repo.list('holidays'),
        ]);
      setNurses(nList.filter((n) => n.active));
      setLeaveTypes(ltList);
      setLeaveEntries(leList);
      setLocks(lkList);
      setDutyWindows(dwList);
      setDoctors(dList);
      setSpecialties(spList);
      setClinicalRoles(crList);
      setHolidays(hList);

      // If user is manager or admin, fetch pending approvals count
      if (isManager) {
        try {
          const token = authService.getToken();
          const res = await fetch('/api/approvals/pending', {
            headers: { Authorization: `Bearer ${token || 'local-owner'}` },
          });
          if (res.ok) {
            const j = await res.json();
            setPendingApprovalsCount(j.count || 0);
          }
        } catch {
          // ignore background count error
        }
      }
    } catch (err) {
      console.error('Failed to load availability data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Month date helpers
  const daysInMonth = new Date(Date.UTC(currentYear, currentMonthIndex + 1, 0)).getUTCDate();
  const monthName = new Date(Date.UTC(currentYear, currentMonthIndex, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });

  const todayObj = new Date();
  const todayYear = todayObj.getFullYear();
  const todayMonthIndex = todayObj.getMonth();
  const todayDateNumber = todayObj.getDate();
  const isViewingCurrentMonth = currentYear === todayYear && currentMonthIndex === todayMonthIndex;

  const handleGoToToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonthIndex(now.getMonth());
    setTimeout(() => {
      const todayEl = document.getElementById(`availability-day-${now.getDate()}`);
      if (todayEl) {
        todayEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }, 60);
  };

  const getIsoDate = (day: number): IsoDateString => {
    const dStr = String(day).padStart(2, '0');
    const mStr = String(currentMonthIndex + 1).padStart(2, '0');
    return `${currentYear}-${mStr}-${dStr}`;
  };

  const addDaysToIso = (dateStr: string, days: number): string => {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
  };

  const countDaysBetween = (startStr: string, endStr: string): number => {
    const s = new Date(startStr + 'T00:00:00Z').getTime();
    const e = new Date(endStr + 'T00:00:00Z').getTime();
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
  };

  // Find leave for nurse on a specific date
  const findLeaveForNurseDate = (nurseId: string, isoDate: string): LeaveEntry | undefined => {
    return leaveEntries.find(
      (le) => le.nurseId === nurseId && isoDate >= le.startDate && isoDate <= le.endDate
    );
  };

  // Find lock for nurse on a specific date
  const findLockForNurseDate = (nurseId: string, isoDate: string): LockEntry | undefined => {
    return locks.find((lk) => lk.nurseId === nurseId && lk.date === isoDate);
  };

  // Calculate annual leave quota usage for a nurse in DAYS
  const getLeaveQuotaBadge = (nurse: Nurse, leaveType: LeaveType) => {
    const rawQuota = nurse.leaveQuotas?.[leaveType.id];
    if (typeof rawQuota !== 'number' || rawQuota <= 0) return null;
    const quotaDays = rawQuota > 40 && rawQuota % 8 === 0 ? rawQuota / 8 : rawQuota;

    // Sum scheduled days for this nurse and leave type across the year
    const yearPrefix = `${currentYear}-`;
    const usedDays = leaveEntries
      .filter((le) => le.nurseId === nurse.id && le.leaveTypeId === leaveType.id && le.startDate.startsWith(yearPrefix))
      .reduce((sum, le) => sum + countDaysBetween(le.startDate, le.endDate), 0);

    const isExceeded = usedDays > quotaDays;
    const isFull = usedDays === quotaDays;

    return {
      text: `${usedDays}/${quotaDays}d`,
      usedDays,
      quotaDays,
      isExceeded,
      isFull,
    };
  };

  // Real-time quota analysis for the active Leave Entry modal
  const selectedNurseForLeave = nurses.find((n) => n.id === editingLeaveEntry?.nurseId);
  const selectedTypeForLeave = leaveTypes.find((l) => l.id === editingLeaveEntry?.leaveTypeId);

  const leaveQuotaInfo = useMemo(() => {
    if (!editingLeaveEntry || !selectedNurseForLeave || !selectedTypeForLeave) return null;
    const rawQuota = selectedNurseForLeave.leaveQuotas?.[selectedTypeForLeave.id];
    if (typeof rawQuota !== 'number' || rawQuota <= 0) return null;

    const quotaDays = rawQuota > 40 && rawQuota % 8 === 0 ? rawQuota / 8 : rawQuota;
    const start = editingLeaveEntry.startDate || '';
    const end = editingLeaveEntry.endDate || start;
    const year = start ? start.slice(0, 4) : String(currentYear);
    const yearPrefix = `${year}-`;

    const otherLeaves = leaveEntries.filter(
      (le) =>
        le.nurseId === selectedNurseForLeave.id &&
        le.leaveTypeId === selectedTypeForLeave.id &&
        le.startDate.startsWith(yearPrefix) &&
        le.id !== editingLeaveEntry.id
    );

    const alreadyUsedDays = otherLeaves.reduce(
      (sum, le) => sum + countDaysBetween(le.startDate, le.endDate),
      0
    );

    const requestedDays = start && end && start <= end ? countDaysBetween(start, end) : 0;
    const totalDaysAfter = alreadyUsedDays + requestedDays;
    const remainingDays = Math.max(0, quotaDays - alreadyUsedDays);
    const isExceeded = totalDaysAfter > quotaDays;
    const excessDays = totalDaysAfter - quotaDays;

    return {
      quotaDays,
      alreadyUsedDays,
      requestedDays,
      remainingDays,
      totalDaysAfter,
      isExceeded,
      excessDays,
      year,
    };
  }, [editingLeaveEntry, selectedNurseForLeave, selectedTypeForLeave, leaveEntries, currentYear]);

  // --- LEAVE ACTIONS ---
  const handleSaveLeaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLeaveEntry || !editingLeaveEntry.nurseId || !editingLeaveEntry.leaveTypeId) return;

    const start = editingLeaveEntry.startDate!;
    const end = editingLeaveEntry.endDate || start;
    if (start > end) {
      triggerToast('Start date must be before or equal to end date.');
      return;
    }

    const lt = leaveTypes.find((l) => l.id === editingLeaveEntry.leaveTypeId);
    const daySpan = countDaysBetween(start, end);
    const dailyCredit = lt ? (typeof lt.creditedHours === 'number' ? lt.creditedHours : 8) : 8;
    const totalCredits = dailyCredit * daySpan;

    // Strict Quota Ceiling Enforcement: Block save if quota would be exceeded
    if (leaveQuotaInfo && leaveQuotaInfo.isExceeded) {
      triggerToast(
        `Cannot schedule leave: ${selectedNurseForLeave?.fullName || 'Staff'} has already scheduled ${leaveQuotaInfo.alreadyUsedDays} of ${leaveQuotaInfo.quotaDays} allowed ${selectedTypeForLeave?.name || 'leave'} days for ${leaveQuotaInfo.year}. Requesting ${leaveQuotaInfo.requestedDays} day(s) exceeds the annual limit by ${leaveQuotaInfo.excessDays} day(s).`
      );
      return;
    }

    try {
      if (editingLeaveEntry.id) {
        await repo.update('leaveEntries', editingLeaveEntry.id, {
          nurseId: editingLeaveEntry.nurseId,
          leaveTypeId: editingLeaveEntry.leaveTypeId,
          startDate: start,
          endDate: end,
          note: editingLeaveEntry.note,
          approved: editingLeaveEntry.approved ?? true,
          hoursCredited: totalCredits,
        });
        triggerToast(`Updated leave entry (${daySpan} day(s), ${totalCredits}h credited).`);
      } else {
        await repo.create('leaveEntries', {
          nurseId: editingLeaveEntry.nurseId,
          leaveTypeId: editingLeaveEntry.leaveTypeId,
          startDate: start,
          endDate: end,
          note: editingLeaveEntry.note || '',
          approved: true,
          hoursCredited: totalCredits,
        });
        triggerToast(`Recorded ${lt?.name} for ${daySpan} day(s) (${totalCredits}h credited).`);
      }
      setIsLeaveModalOpen(false);
      setEditingLeaveEntry(null);
      setSelectedCellDate(null);
      loadData();
    } catch (err: any) {
      triggerToast(`Error saving leave: ${err.message}`);
    }
  };

  const handleToggleApproveLeave = async (entry: LeaveEntry) => {
    const nextApproved = !entry.approved;
    await repo.update('leaveEntries', entry.id, { approved: nextApproved });
    triggerToast(nextApproved ? 'Leave approved.' : 'Leave marked unapproved.');
    loadData();
  };

  const handleDeleteLeave = async (entry: LeaveEntry) => {
    if (!entry || !entry.id || isDeletingLeave) return;
    setIsDeletingLeave(true);
    try {
      await repo.remove('leaveEntries', entry.id);
      setIsLeaveModalOpen(false);
      setEditingLeaveEntry(null);
      setSelectedCellDate(null);
      await loadData();
      triggerToast('Selected leave entry removed successfully. Other leaves remain untouched.');
    } catch (err: any) {
      console.error('Failed to delete leave entry:', err);
      triggerToast(`Failed to delete leave entry: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsDeletingLeave(false);
    }
  };

  /**
   * Deletes ONLY the clicked single day from a multi-day leave span,
   * preserving all other days of the leave (by advancing startDate,
   * regressing endDate, or splitting into two valid records).
   */
  const handleDeleteSingleDayFromLeave = async (entry: LeaveEntry, targetDate: string) => {
    if (!entry || !entry.id || isDeletingLeave) return;
    setIsDeletingLeave(true);
    try {
      const totalSpanDays = countDaysBetween(entry.startDate, entry.endDate);
      const hoursPerDay = entry.hoursCredited ? entry.hoursCredited / totalSpanDays : 8;

      if (entry.startDate === entry.endDate || totalSpanDays <= 1) {
        // Single day leave: simply remove this entry
        await repo.remove('leaveEntries', entry.id);
      } else if (entry.startDate === targetDate) {
        // Target is the first day: advance startDate by 1 day
        const newStart = addDaysToIso(entry.startDate, 1);
        const remainingDays = countDaysBetween(newStart, entry.endDate);
        await repo.update('leaveEntries', entry.id, {
          startDate: newStart,
          hoursCredited: Math.round(remainingDays * hoursPerDay),
        });
      } else if (entry.endDate === targetDate) {
        // Target is the last day: regress endDate by 1 day
        const newEnd = addDaysToIso(entry.endDate, -1);
        const remainingDays = countDaysBetween(entry.startDate, newEnd);
        await repo.update('leaveEntries', entry.id, {
          endDate: newEnd,
          hoursCredited: Math.round(remainingDays * hoursPerDay),
        });
      } else {
        // Target is in the middle: split into two distinct records
        const end1 = addDaysToIso(targetDate, -1);
        const days1 = countDaysBetween(entry.startDate, end1);
        await repo.update('leaveEntries', entry.id, {
          endDate: end1,
          hoursCredited: Math.round(days1 * hoursPerDay),
        });

        const start2 = addDaysToIso(targetDate, 1);
        const days2 = countDaysBetween(start2, entry.endDate);
        await repo.create('leaveEntries', {
          nurseId: entry.nurseId,
          leaveTypeId: entry.leaveTypeId,
          startDate: start2,
          endDate: entry.endDate,
          note: entry.note,
          approved: entry.approved,
          hoursCredited: Math.round(days2 * hoursPerDay),
        });
      }

      setIsLeaveModalOpen(false);
      setEditingLeaveEntry(null);
      setSelectedCellDate(null);
      await loadData();
      triggerToast(`Removed leave on ${targetDate}. All other days remain active.`);
    } catch (err: any) {
      console.error('Failed to remove date from leave:', err);
      triggerToast(`Failed to update leave: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsDeletingLeave(false);
    }
  };

  // --- LOCK ACTIONS ---
  const handleSaveLockEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLockEntry || !editingLockEntry.nurseId || !editingLockEntry.date) return;

    try {
      if (editingLockEntry.id) {
        await repo.update('locks', editingLockEntry.id, {
          mode: editingLockEntry.mode || 'ASSIGNMENT',
          dutyWindowId: editingLockEntry.dutyWindowId,
          assignmentKind: editingLockEntry.assignmentKind,
          targetRefId: editingLockEntry.targetRefId,
          note: editingLockEntry.note,
        });
        triggerToast('Lock entry updated.');
      } else {
        await repo.create('locks', {
          nurseId: editingLockEntry.nurseId,
          date: editingLockEntry.date,
          mode: editingLockEntry.mode || 'ASSIGNMENT',
          dutyWindowId: editingLockEntry.dutyWindowId,
          assignmentKind: editingLockEntry.assignmentKind,
          targetRefId: editingLockEntry.targetRefId,
          note: editingLockEntry.note || '',
          createdAt: new Date().toISOString(),
        });
        triggerToast('Day locked — generation will never overwrite this.');
      }
      setIsLockModalOpen(false);
      setEditingLockEntry(null);
      loadData();
    } catch (err: any) {
      triggerToast(`Failed to save lock: ${err.message}`);
    }
  };

  // Override Lock (Executes lock removal protocol and records audit event)
  const handleExecuteLockOverride = async () => {
    if (!activeLockToOverride || isOverridingLock) return;
    setIsOverridingLock(true);

    try {
      await repo.remove('locks', activeLockToOverride.id);
      // Write an AuditEvent for lock removal
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
      await loadData();
    } catch (err: any) {
      console.error('Lock override failed:', err);
      triggerToast(`Override failed: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsOverridingLock(false);
    }
  };

  // --- PUBLIC HOLIDAY AUTO-LEAVE ---
  const handleApplyAllPublicHolidaysAsPH = async () => {
    try {
      const monthPrefix = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
      const monthHolidays = holidays.filter((h) => h.date.startsWith(monthPrefix));

      if (monthHolidays.length === 0) {
        triggerToast(`No public holidays found for ${monthName} ${currentYear}. You can add them in Settings → Public Holidays.`);
        return;
      }

      const phLeaveType = leaveTypes.find((l) => l.acronym === 'PH') || leaveTypes[0];
      let createdCount = 0;

      for (const hol of monthHolidays) {
        for (const nurse of nurses) {
          // Check if leave already exists
          const existing = leaveEntries.find(
            (le) => le.nurseId === nurse.id && hol.date >= le.startDate && hol.date <= le.endDate
          );
          if (!existing) {
            await repo.create('leaveEntries', {
              nurseId: nurse.id,
              leaveTypeId: phLeaveType.id,
              startDate: hol.date,
              endDate: hol.date,
              note: `Public Holiday: ${hol.name}`,
              approved: true,
              hoursCredited: 8,
            });
            createdCount++;
          }
        }
      }

      triggerToast(
        `Applied Public Holiday (PH) leave: Created ${createdCount} leave entries for ${monthHolidays.length} holiday(s) across all active nurses.`
      );
      loadData();
    } catch (err: any) {
      triggerToast(`Error applying holiday leave: ${err.message}`);
    }
  };

  // --- CSV IMPORT LEAVE ---
  const handleProcessLeaveCsv = async () => {
    if (!csvContent.trim()) {
      triggerToast('Please paste CSV content.');
      return;
    }

    try {
      const lines = csvContent.trim().split('\n');
      let successCount = 0;
      let errorCount = 0;
      const logs: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('gmail') || line.startsWith('Gmail')) continue; // Skip header

        const parts = line.split(',').map((p) => p.trim());
        if (parts.length < 4) {
          logs.push(`Row ${i + 1}: Insufficient columns (expected: gmail, acronym, startDate, endDate)`);
          errorCount++;
          continue;
        }

        const [gmail, acronym, startDate, endDate] = parts;
        const nurse = nurses.find((n) => n.gmail.toLowerCase() === gmail.toLowerCase());
        if (!nurse) {
          logs.push(`Row ${i + 1}: Nurse with Gmail "${gmail}" not found.`);
          errorCount++;
          continue;
        }

        const lt = leaveTypes.find((l) => l.acronym.toUpperCase() === acronym.toUpperCase());
        if (!lt) {
          logs.push(`Row ${i + 1}: Leave type with acronym "${acronym}" not found.`);
          errorCount++;
          continue;
        }

        const daySpan =
          Math.round(
            (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
          ) + 1;
        const totalCredits = (typeof lt.creditedHours === 'number' ? lt.creditedHours : 8) * daySpan;

        // Quota Check
        const rawQuota = nurse.leaveQuotas?.[lt.id];
        if (typeof rawQuota === 'number' && rawQuota > 0) {
          const quotaDays = rawQuota > 40 && rawQuota % 8 === 0 ? rawQuota / 8 : rawQuota;
          const year = startDate.slice(0, 4);
          const yearPrefix = `${year}-`;
          const used = leaveEntries
            .filter((le) => le.nurseId === nurse.id && le.leaveTypeId === lt.id && le.startDate.startsWith(yearPrefix))
            .reduce((sum, le) => sum + countDaysBetween(le.startDate, le.endDate), 0);
          if (used + daySpan > quotaDays) {
            logs.push(`Row ${i + 1}: Quota exceeded for ${nurse.fullName} (${used + daySpan}/${quotaDays} days of ${lt.name}). Skipped.`);
            errorCount++;
            continue;
          }
        }

        await repo.create('leaveEntries', {
          nurseId: nurse.id,
          leaveTypeId: lt.id,
          startDate,
          endDate,
          note: 'Imported via CSV',
          approved: true,
          hoursCredited: totalCredits,
        });
        successCount++;
      }

      setCsvImportLog(`Import complete: ${successCount} entries added, ${errorCount} errors.`);
      triggerToast(`Imported ${successCount} leave records.`);
      loadData();
    } catch (err: any) {
      triggerToast(`CSV Import failed: ${err.message}`);
    }
  };

  // Drag selection helpers
  const handleCellMouseDown = (nurseId: string, day: number) => {
    setDragStart({ nurseId, day });
    setDragCurrent({ nurseId, day });
  };

  const handleCellMouseEnter = (nurseId: string, day: number) => {
    if (dragStart && dragStart.nurseId === nurseId) {
      setDragCurrent({ nurseId, day });
    }
  };

  const handleCellMouseUp = (nurseId: string, day: number) => {
    if (dragStart && dragStart.nurseId === nurseId) {
      const minDay = Math.min(dragStart.day, day);
      const maxDay = Math.max(dragStart.day, day);

      const startDate = getIsoDate(minDay);
      const endDate = getIsoDate(maxDay);

      setEditingLeaveEntry({
        nurseId,
        leaveTypeId: leaveTypes[0]?.id || '',
        startDate,
        endDate,
        note: '',
        approved: true,
      });
      setIsLeaveModalOpen(true);
    }
    setDragStart(null);
    setDragCurrent(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-none">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Availability, Leave &amp; Locks</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Record pre-approved staff leave (Annual, Sick, Birthday, PH) and pinned non-changeable locks. Drag across date ranges to quickly record leave.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleGoToToday}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            title="Jump calendar view to today"
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-600" />
            <span>Go to Today</span>
          </button>

          <button
            onClick={handleApplyAllPublicHolidaysAsPH}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium transition-colors cursor-pointer"
            title="Auto-grant 8h PH leave on holidays to all active staff"
          >
            <Flag className="w-3.5 h-3.5 text-cyan-600" />
            <span>Apply Public Holidays as PH</span>
          </button>

          <button
            onClick={() => {
              setCsvImportLog(null);
              setIsCsvModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>Import Leave CSV</span>
          </button>

          <button
            onClick={() => {
              setEditingLockEntry({
                nurseId: nurses[0]?.id || '',
                date: getIsoDate(isViewingCurrentMonth ? todayDateNumber : 1),
                mode: 'ASSIGNMENT',
                dutyWindowId: dutyWindows[0]?.id || '',
                assignmentKind: 'DOCTOR',
                targetRefId: doctors[0]?.id || '',
                note: '',
              });
              setIsLockModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded text-xs font-medium transition-colors cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5 text-amber-700" />
            <span>Pin Shift Lock</span>
          </button>

          <button
            onClick={() => {
              const defaultDate = getIsoDate(isViewingCurrentMonth ? todayDateNumber : 1);
              setEditingLeaveEntry({
                nurseId: nurses[0]?.id || '',
                leaveTypeId: leaveTypes[0]?.id || '',
                startDate: defaultDate,
                endDate: defaultDate,
                note: '',
                approved: true,
              });
              setIsLeaveModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Leave</span>
          </button>
        </div>
      </div>

      {/* Sub Navigation Ribbon */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2 pb-px">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'calendar'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>31-Day Master Grid</span>
        </button>

        <button
          onClick={() => setActiveTab('self-service')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'self-service'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>My Availability &amp; Leave Requests</span>
        </button>

        {isManager && (
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'approvals'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <CalendarCheck2 className="w-3.5 h-3.5" />
            <span>Pending Approvals</span>
            {pendingApprovalsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-bold text-[10px] animate-pulse">
                {pendingApprovalsCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* VIEW PANEL 1: MANAGER APPROVALS QUEUE */}
      {activeTab === 'approvals' && isManager && (
        <ApprovalsQueuePanel currentUser={currentUser || undefined} onRequestDecided={loadData} />
      )}

      {/* VIEW PANEL 2: NURSE SELF-SERVICE PORTAL */}
      {activeTab === 'self-service' && (
        <NurseSelfServicePanel
          currentUser={currentUser || undefined}
          nurses={nurses}
          leaveTypes={leaveTypes}
          dutyWindows={dutyWindows}
          onDataChanged={loadData}
        />
      )}

      {/* VIEW PANEL 3: 31-DAY MASTER CALENDAR & LOCK GRID */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          {/* Month Navigator & Legend Bar */}
      <div className="bg-white border border-slate-200 rounded p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (currentMonthIndex === 0) {
                  setCurrentMonthIndex(11);
                  setCurrentYear(currentYear - 1);
                } else {
                  setCurrentMonthIndex(currentMonthIndex - 1);
                }
              }}
              className="p-1 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-slate-800 text-sm font-mono tabular-nums">
              {monthName} {currentYear}
            </span>
            <button
              onClick={() => {
                if (currentMonthIndex === 11) {
                  setCurrentMonthIndex(0);
                  setCurrentYear(currentYear + 1);
                } else {
                  setCurrentMonthIndex(currentMonthIndex + 1);
                }
              }}
              className="p-1 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleGoToToday}
              className={`ml-1.5 px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border shadow-2xs ${
                isViewingCurrentMonth
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title="Jump to today's date"
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>Today</span>
            </button>
          </div>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 font-mono text-[11px]">
            {daysInMonth} Days · Drag horizontally across cells to set leave span
          </span>
        </div>

        {/* Live Legend for Leave & Locks */}
        <div className="flex flex-wrap items-center gap-2">
          {leaveTypes.map((lt) => (
            <span
              key={lt.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-white font-bold"
              style={{ backgroundColor: lt.color }}
              title={`${lt.name}: ${typeof lt.creditedHours === 'number' ? `${lt.creditedHours}h` : 'match'} credits`}
            >
              <span>{lt.acronym}</span>
              <span className="font-normal opacity-90 text-[9px]">
                ({typeof lt.creditedHours === 'number' ? `${lt.creditedHours}h` : 'match'})
              </span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-100 text-amber-900 border border-amber-300 font-bold">
            <Lock className="w-2.5 h-2.5" />
            <span>LOCK</span>
          </span>
        </div>
      </div>

      {/* MATRIX GRID: Nurses (Rows) × Dates (Columns) */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              {/* Header Row: Days & Weekdays */}
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                <th className="py-2 px-3 text-left font-semibold sticky left-0 bg-slate-100 z-10 w-48 border-r border-slate-200">
                  Nurse Staff / Quota
                </th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const isoDate = getIsoDate(day);
                  const dateObj = new Date(Date.UTC(currentYear, currentMonthIndex, day));
                  const weekday = dateObj.getUTCDay();
                  const isWeekend = weekday === 5 || weekday === 6; // Fri/Sat or Sun
                  const holiday = holidays.find((h) => h.date === isoDate);
                  const isToday = isViewingCurrentMonth && day === todayDateNumber;

                  return (
                    <th
                      id={`availability-day-${day}`}
                      key={day}
                      className={`py-1.5 px-1 text-center font-mono border-r min-w-[36px] transition-colors relative ${
                        isToday
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs z-10'
                          : holiday
                          ? 'bg-cyan-50/80 text-cyan-900 border-slate-200'
                          : isWeekend
                          ? 'bg-slate-200/60 text-slate-800 border-slate-200'
                          : 'text-slate-600 border-slate-200'
                      }`}
                    >
                      <div className="text-[10px] font-normal leading-tight flex items-center justify-center gap-0.5">
                        {WEEKDAY_ABBR[weekday]}
                        {isToday && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Today" />}
                      </div>
                      <div className="font-bold flex items-center justify-center gap-0.5">
                        <span>{day}</span>
                        {holiday && (
                          <span title={`Public Holiday: ${holiday.name}`}>
                            <Flag className={`w-2.5 h-2.5 ${isToday ? 'text-amber-300' : 'text-cyan-600'}`} />
                          </span>
                        )}
                      </div>
                      {isToday && (
                        <div className="text-[8px] font-sans font-bold uppercase tracking-wider text-indigo-100 -mt-0.5">
                          Today
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {nurses.map((nurse) => {
                // Capped leave quota badges if configured
                const alType = leaveTypes.find((l) => l.acronym === 'AL');
                const alBadge = alType ? getLeaveQuotaBadge(nurse, alType) : null;
                const phType = leaveTypes.find((l) => l.acronym === 'PH');
                const phBadge = phType ? getLeaveQuotaBadge(nurse, phType) : null;
                const blType = leaveTypes.find((l) => l.acronym === 'BL');
                const blBadge = blType ? getLeaveQuotaBadge(nurse, blType) : null;

                return (
                  <tr key={nurse.id} className="hover:bg-slate-50/50">
                    {/* Sticky Nurse Header */}
                    <td className="py-2 px-3 sticky left-0 bg-white z-10 border-r border-slate-200">
                      <div className="flex items-center justify-between gap-1">
                        <div>
                          <span className="font-semibold text-slate-900 block truncate max-w-[120px]">
                            {nurse.fullName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {nurse.employeeCode}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          {alBadge && (
                            <span
                              className={`text-[9px] font-mono px-1 py-0.2 rounded border ${
                                alBadge.isExceeded
                                  ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold'
                                  : alBadge.isFull
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}
                              title={`Annual Leave: ${alBadge.usedDays} of ${alBadge.quotaDays} days scheduled (${currentYear})`}
                            >
                              AL: {alBadge.text}
                            </span>
                          )}
                          {phBadge && (
                            <span
                              className={`text-[9px] font-mono px-1 py-0.2 rounded border ${
                                phBadge.isExceeded
                                  ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold'
                                  : 'bg-cyan-50 text-cyan-800 border-cyan-200'
                              }`}
                              title={`Public Holiday: ${phBadge.usedDays} of ${phBadge.quotaDays} days scheduled (${currentYear})`}
                            >
                              PH: {phBadge.text}
                            </span>
                          )}
                          {blBadge && (
                            <span
                              className="text-[9px] font-mono px-1 py-0.2 rounded bg-pink-50 text-pink-800 border border-pink-200"
                              title={`Birthday Leave: ${blBadge.usedDays} of ${blBadge.quotaDays} days scheduled (${currentYear})`}
                            >
                              BL: {blBadge.text}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Matrix Cells */}
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                      const isoDate = getIsoDate(day);
                      const leave = findLeaveForNurseDate(nurse.id, isoDate);
                      const lock = findLockForNurseDate(nurse.id, isoDate);

                      const dateObj = new Date(Date.UTC(currentYear, currentMonthIndex, day));
                      const weekday = dateObj.getUTCDay();
                      const isWeekend = weekday === 5 || weekday === 6;
                      const isToday = isViewingCurrentMonth && day === todayDateNumber;

                      // Check if inside active drag span
                      let isDragSelected = false;
                      if (dragStart && dragCurrent && dragStart.nurseId === nurse.id) {
                        const minDay = Math.min(dragStart.day, dragCurrent.day);
                        const maxDay = Math.max(dragStart.day, dragCurrent.day);
                        if (day >= minDay && day <= maxDay) {
                          isDragSelected = true;
                        }
                      }

                      return (
                        <td
                          key={day}
                          onMouseDown={() => handleCellMouseDown(nurse.id, day)}
                          onMouseEnter={() => handleCellMouseEnter(nurse.id, day)}
                          onMouseUp={() => handleCellMouseUp(nurse.id, day)}
                          className={`py-1.5 px-0.5 text-center border-r cursor-pointer select-none transition-colors relative ${
                            isDragSelected
                              ? 'bg-indigo-100 ring-2 ring-indigo-400 z-10 border-slate-200'
                              : isToday
                              ? 'bg-indigo-50/25 border-r-indigo-200 border-l-indigo-200'
                              : isWeekend
                              ? 'bg-slate-50/70 border-slate-100'
                              : 'bg-white border-slate-100'
                          }`}
                        >
                          {/* 1. Render Lock (padlock + hatched border) */}
                          {lock ? (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveLockToOverride(lock);
                                setOverrideInput('');
                                setIsOverrideModalOpen(true);
                              }}
                              className="w-full h-7 rounded border border-dashed border-amber-400 bg-amber-50 flex items-center justify-center gap-0.5 text-amber-900 shadow-2xs font-mono font-bold text-[10px]"
                              title={`Locked day: ${lock.mode === 'OFF' ? 'PINNED OFF' : 'PINNED DUTY'}. Click to manage/override.`}
                            >
                              <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>{lock.mode === 'OFF' ? 'OFF' : 'PIN'}</span>
                            </div>
                          ) : leave ? (
                            // 2. Render Leave Entry (acronym + color)
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingLeaveEntry(leave);
                                setSelectedCellDate(isoDate);
                                setIsLeaveModalOpen(true);
                              }}
                              className="w-full h-7 rounded flex items-center justify-center font-mono font-bold text-[11px] text-white shadow-2xs cursor-pointer"
                              style={{
                                backgroundColor:
                                  leaveTypes.find((l) => l.id === leave.leaveTypeId)?.color ||
                                  '#f59e0b',
                              }}
                              title={`${leaveTypes.find((l) => l.id === leave.leaveTypeId)?.name} (${leave.hoursCredited}h credited). Click to edit.`}
                            >
                              {leaveTypes.find((l) => l.id === leave.leaveTypeId)?.acronym || 'L'}
                            </div>
                          ) : (
                            // Empty Cell
                            <div className="h-7 w-full flex items-center justify-center text-slate-300 hover:bg-slate-100/80 rounded">
                              —
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
      </div>

      {/* Bottom Information Callout */}
      <div className="p-3 bg-slate-100/80 border border-slate-200 rounded text-xs text-slate-600 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Deterministic Invariant:</strong> Pinned shift locks (🔒) and approved leave entries are strictly non-changeable — generation passes will <strong>never overwrite</strong> these cells.
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-500">
          {locks.length} active locks · {leaveEntries.length} leave entries
        </span>
      </div>
        </div>
      )}

      {/* --- MODAL 1: RECORD / EDIT LEAVE ENTRY --- */}
      {isLeaveModalOpen && editingLeaveEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <CalendarCheck2 className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingLeaveEntry.id ? 'Edit Leave Entry' : 'Record Staff Leave'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsLeaveModalOpen(false);
                  setEditingLeaveEntry(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLeaveEntry} className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nurse</label>
                <select
                  value={editingLeaveEntry.nurseId}
                  onChange={(e) =>
                    setEditingLeaveEntry({ ...editingLeaveEntry, nurseId: e.target.value })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-medium"
                >
                  {nurses.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.fullName} ({n.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Leave Type</label>
                <select
                  value={editingLeaveEntry.leaveTypeId}
                  onChange={(e) =>
                    setEditingLeaveEntry({ ...editingLeaveEntry, leaveTypeId: e.target.value })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-medium"
                >
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name} [{lt.acronym}] —{' '}
                      {typeof lt.creditedHours === 'number' ? `${lt.creditedHours}h` : 'Match duty'}{' '}
                      credit {lt.countsTowardHoursTarget ? '(Counts toward target)' : '(0h)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={editingLeaveEntry.startDate}
                    onChange={(e) =>
                      setEditingLeaveEntry({ ...editingLeaveEntry, startDate: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={editingLeaveEntry.endDate}
                    onChange={(e) =>
                      setEditingLeaveEntry({ ...editingLeaveEntry, endDate: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>

              {/* Real-time Annual Quota Status & Ceiling Banner */}
              {leaveQuotaInfo && (
                <div
                  className={`p-2.5 rounded-lg border text-xs space-y-1.5 transition-colors ${
                    leaveQuotaInfo.isExceeded
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : leaveQuotaInfo.remainingDays === 0
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5">
                      {leaveQuotaInfo.isExceeded ? (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      <span>
                        {selectedTypeForLeave?.name} Annual Quota ({leaveQuotaInfo.year})
                      </span>
                    </span>
                    <span className="font-mono font-bold">
                      {leaveQuotaInfo.alreadyUsedDays} / {leaveQuotaInfo.quotaDays} days used
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60">
                    <span>
                      This request: <strong>{leaveQuotaInfo.requestedDays} day(s)</strong>
                    </span>
                    <span>
                      {leaveQuotaInfo.isExceeded ? (
                        <strong className="text-rose-700">
                          Exceeds annual quota by {leaveQuotaInfo.excessDays} day{leaveQuotaInfo.excessDays > 1 ? 's' : ''}!
                        </strong>
                      ) : (
                        <span>
                          Remaining after: <strong>{leaveQuotaInfo.quotaDays - leaveQuotaInfo.totalDaysAfter} day(s)</strong>
                        </span>
                      )}
                    </span>
                  </div>

                  {leaveQuotaInfo.isExceeded && (
                    <div className="text-[11px] text-rose-700 font-medium bg-rose-100/70 p-1.5 rounded border border-rose-200">
                      Scheduling blocked: {selectedNurseForLeave?.fullName} cannot be allocated more than {leaveQuotaInfo.quotaDays} days of {selectedTypeForLeave?.name} in {leaveQuotaInfo.year}.
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes / Reason</label>
                <input
                  type="text"
                  value={editingLeaveEntry.note || ''}
                  onChange={(e) =>
                    setEditingLeaveEntry({ ...editingLeaveEntry, note: e.target.value })
                  }
                  placeholder="e.g. Annual holiday or medical certificate"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded"
                />
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800">Approval Status</span>
                  <p className="text-[10px] text-slate-500">
                    Approved leave is honored strictly by the scheduling engine.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEditingLeaveEntry({
                      ...editingLeaveEntry,
                      approved: !editingLeaveEntry.approved,
                    })
                  }
                  className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                    editingLeaveEntry.approved !== false
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {editingLeaveEntry.approved !== false ? 'Approved ✓' : 'Pending'}
                </button>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                {editingLeaveEntry.id && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* If multi-day span and user clicked a specific cell */}
                    {editingLeaveEntry.startDate !== editingLeaveEntry.endDate &&
                    selectedCellDate &&
                    selectedCellDate >= (editingLeaveEntry.startDate || '') &&
                    selectedCellDate <= (editingLeaveEntry.endDate || '') ? (
                      <>
                        <button
                          type="button"
                          disabled={isDeletingLeave}
                          onClick={() =>
                            handleDeleteSingleDayFromLeave(
                              editingLeaveEntry as LeaveEntry,
                              selectedCellDate
                            )
                          }
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors border border-red-200 text-xs"
                          title="Deletes ONLY this selected day, keeping all other days of this leave intact"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Only {formatDate(selectedCellDate)}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isDeletingLeave}
                          onClick={() => handleDeleteLeave(editingLeaveEntry as LeaveEntry)}
                          className="text-slate-500 hover:text-red-600 hover:bg-slate-100 px-2 py-1.5 rounded text-[11px] cursor-pointer disabled:opacity-50 transition-colors"
                          title="Deletes the entire multi-day leave"
                        >
                          Delete Full Range ({formatDate(editingLeaveEntry.startDate)} – {formatDate(editingLeaveEntry.endDate)})
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={isDeletingLeave}
                        onClick={() => handleDeleteLeave(editingLeaveEntry as LeaveEntry)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors border border-red-200 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isDeletingLeave ? 'Deleting...' : 'Delete Leave Entry'}</span>
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLeaveModalOpen(false);
                      setEditingLeaveEntry(null);
                      setSelectedCellDate(null);
                    }}
                    className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded cursor-pointer font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={leaveQuotaInfo?.isExceeded || isDeletingLeave}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded font-medium cursor-pointer shadow-xs"
                    title={leaveQuotaInfo?.isExceeded ? 'Leave quota exceeded for this staff member' : undefined}
                  >
                    Save Leave Entry
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: PIN SHIFT LOCK --- */}
      {isLockModalOpen && editingLockEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">Pin Non-Changeable Lock</h3>
              </div>
              <button
                onClick={() => setIsLockModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900 text-[11px] leading-relaxed">
              <strong>Non-changeable day:</strong> The scheduling engine will never overwrite this assignment. Editing or removing it later requires explicit typed confirmation.
            </div>

            <form onSubmit={handleSaveLockEntry} className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nurse</label>
                <select
                  value={editingLockEntry.nurseId}
                  onChange={(e) =>
                    setEditingLockEntry({ ...editingLockEntry, nurseId: e.target.value })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white font-medium"
                >
                  {nurses.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.fullName} ({n.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={editingLockEntry.date}
                  onChange={(e) =>
                    setEditingLockEntry({ ...editingLockEntry, date: e.target.value })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Lock Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingLockEntry({ ...editingLockEntry, mode: 'ASSIGNMENT' })
                    }
                    className={`py-1.5 px-3 rounded border font-medium text-xs cursor-pointer ${
                      editingLockEntry.mode === 'ASSIGNMENT'
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                        : 'border-slate-300 text-slate-600'
                    }`}
                  >
                    ASSIGNMENT (Pin Shift)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingLockEntry({ ...editingLockEntry, mode: 'OFF' })}
                    className={`py-1.5 px-3 rounded border font-medium text-xs cursor-pointer ${
                      editingLockEntry.mode === 'OFF'
                        ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold'
                        : 'border-slate-300 text-slate-600'
                    }`}
                  >
                    OFF (Pin Fixed Rest)
                  </button>
                </div>
              </div>

              {editingLockEntry.mode === 'ASSIGNMENT' && (
                <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Duty Window</label>
                    <select
                      value={editingLockEntry.dutyWindowId}
                      onChange={(e) =>
                        setEditingLockEntry({
                          ...editingLockEntry,
                          dutyWindowId: e.target.value,
                        })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      {dutyWindows.map((dw) => (
                        <option key={dw.id} value={dw.id}>
                          {dw.name} [{dw.acronym}] ({dw.startTime}–{dw.endTime})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Target Assignment Pairing
                    </label>
                    <select
                      value={editingLockEntry.targetRefId}
                      onChange={(e) => {
                        const targetId = e.target.value;
                        const isDoc = doctors.some((d) => d.id === targetId);
                        const isRole = clinicalRoles.some((r) => r.id === targetId);
                        setEditingLockEntry({
                          ...editingLockEntry,
                          targetRefId: targetId,
                          assignmentKind: isDoc ? 'DOCTOR' : isRole ? 'CLINICAL_ROLE' : 'SPECIALTY',
                        });
                      }}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      <optgroup label="Doctors">
                        {doctors.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.fullName}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Clinical Roles">
                        {clinicalRoles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} ({r.acronym})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Specialties (Pool)">
                        {specialties.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">Lock Note / Reason</label>
                <input
                  type="text"
                  value={editingLockEntry.note || ''}
                  onChange={(e) =>
                    setEditingLockEntry({ ...editingLockEntry, note: e.target.value })
                  }
                  placeholder="e.g. Requested VIP coverage or fixed off"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLockModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium cursor-pointer shadow-xs"
                >
                  Pin Lock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 3: LOCK OVERRIDE PROTOCOL --- */}
      {isOverrideModalOpen && activeLockToOverride && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-red-200 shadow-2xl max-w-md w-full p-5 space-y-4 text-xs animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">
                Non-Changeable Day Override Protocol
              </h3>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-900 space-y-1.5 leading-relaxed">
              <p className="font-semibold text-xs">
                Non-changeable day. This was pinned on {formatDate(activeLockToOverride.date)} and will not be overwritten by generation.
              </p>
              <p className="text-[11px] text-red-800">
                Nurse:{' '}
                <strong>
                  {nurses.find((n) => n.id === activeLockToOverride.nurseId)?.fullName}
                </strong>{' '}
                · Mode: <strong>{activeLockToOverride.mode}</strong>
              </p>
              {activeLockToOverride.note && (
                <p className="text-[10px] text-red-700 italic">
                  Note: "{activeLockToOverride.note}"
                </p>
              )}
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
                disabled={isOverridingLock}
                onClick={() => {
                  setIsOverrideModalOpen(false);
                  setActiveLockToOverride(null);
                  setOverrideInput('');
                }}
                className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded cursor-pointer disabled:opacity-50"
              >
                Keep Pinned
              </button>
              <button
                type="button"
                disabled={isOverridingLock}
                onClick={handleExecuteLockOverride}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold cursor-pointer transition-colors shadow-xs disabled:opacity-50"
              >
                {isOverridingLock ? 'Unlocking...' : 'Confirm OVERRIDE & Unlock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 4: CSV LEAVE IMPORT --- */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Import Leave via CSV</h3>
              </div>
              <button
                onClick={() => setIsCsvModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-slate-600 text-[11px]">
                Paste CSV rows with the following column headers:
                <br />
                <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-slate-800 text-[10px]">
                  gmail, leaveType acronym, startDate, endDate
                </code>
              </p>
              <textarea
                rows={6}
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder="maryam.nuaimi.rn@gmail.com, AL, 2026-10-12, 2026-10-16&#10;fatima.alzahra.nurse@gmail.com, SL, 2026-10-05, 2026-10-06"
                className="w-full p-2.5 border border-slate-300 rounded font-mono text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {csvImportLog && (
              <div className="p-2.5 bg-slate-100 border border-slate-200 rounded font-mono text-[11px] text-slate-800">
                {csvImportLog}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCsvModalOpen(false)}
                className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleProcessLeaveCsv}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium cursor-pointer shadow-xs"
              >
                Import Entries
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
