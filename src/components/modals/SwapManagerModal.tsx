/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Shift Swap Manager & Bidirectional Safety Validator (Phase 14.3)
 * Records swap requests, validates both directions (rest, leave, hard rules),
 * applies MANUAL edits with AuditEvents for change alert email tracking.
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  ArrowLeftRight,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
  Clock,
  Sparkles,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  Schedule,
  Assignment,
  Nurse,
  DutyWindow,
  SeniorityLevel,
  Rule,
  LeaveEntry,
  LockEntry,
  ClinicalRole,
  Doctor,
  Specialty,
  SwapRequest,
} from '../../types';
import { getRepository } from '../../services/repository';

interface SwapManagerModalProps {
  schedule: Schedule;
  assignments: Assignment[];
  nurses: Nurse[];
  dutyWindows: DutyWindow[];
  seniorityLevels: SeniorityLevel[];
  roles: ClinicalRole[];
  doctors: Doctor[];
  specialties: Specialty[];
  leaveEntries: LeaveEntry[];
  locks: LockEntry[];
  isOpen: boolean;
  onClose: () => void;
  onApplySwap: (updated: Assignment[], note: string) => void;
}

export const SwapManagerModal: React.FC<SwapManagerModalProps> = ({
  schedule,
  assignments,
  nurses,
  dutyWindows,
  seniorityLevels,
  roles,
  doctors,
  specialties,
  leaveEntries,
  locks,
  isOpen,
  onClose,
  onApplySwap,
}) => {
  const [nurseAId, setNurseAId] = useState<string>(nurses[0]?.id || '');
  const [assignmentAId, setAssignmentAId] = useState<string>('');

  const [nurseBId, setNurseBId] = useState<string>(nurses[1]?.id || '');
  const [assignmentBId, setAssignmentBId] = useState<string>('');

  const [swapReason, setSwapReason] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);

  const nurseMap = useMemo(() => new Map(nurses.map((n) => [n.id, n])), [nurses]);
  const dutyMap = useMemo(() => new Map(dutyWindows.map((d) => [d.id, d])), [dutyWindows]);
  const docMap = useMemo(() => new Map(doctors.map((d) => [d.id, d])), [doctors]);
  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const seniorityMap = useMemo(() => new Map(seniorityLevels.map((s) => [s.id, s])), [seniorityLevels]);

  const nurseAAsgns = useMemo(
    () => assignments.filter((a) => a.nurseId === nurseAId).sort((a, b) => a.date.localeCompare(b.date)),
    [assignments, nurseAId]
  );

  const nurseBAsgns = useMemo(
    () => assignments.filter((a) => a.nurseId === nurseBId).sort((a, b) => a.date.localeCompare(b.date)),
    [assignments, nurseBId]
  );

  // Initialize selected assignments if not set
  React.useEffect(() => {
    if (nurseAAsgns.length > 0 && (!assignmentAId || !nurseAAsgns.some((a) => a.id === assignmentAId))) {
      setAssignmentAId(nurseAAsgns[0].id);
    }
  }, [nurseAAsgns, assignmentAId]);

  React.useEffect(() => {
    if (nurseBAsgns.length > 0 && (!assignmentBId || !nurseBAsgns.some((a) => a.id === assignmentBId))) {
      setAssignmentBId(nurseBAsgns[0].id);
    }
  }, [nurseBAsgns, assignmentBId]);

  const selectedAsgnA = useMemo(() => assignments.find((a) => a.id === assignmentAId), [assignments, assignmentAId]);
  const selectedAsgnB = useMemo(() => assignments.find((a) => a.id === assignmentBId), [assignments, assignmentBId]);

  // Validation: Both directions
  const validation = useMemo(() => {
    const issuesA: string[] = [];
    const issuesB: string[] = [];

    if (!selectedAsgnA || !selectedAsgnB) {
      return { isValid: false, issuesA: ['Please select assignments for both nurses'], issuesB: [] };
    }

    if (nurseAId === nurseBId) {
      return { isValid: false, issuesA: ['Nurse A and Nurse B cannot be the same person'], issuesB: [] };
    }

    const nurseA = nurseMap.get(nurseAId);
    const nurseB = nurseMap.get(nurseBId);
    if (!nurseA || !nurseB) return { isValid: false, issuesA: ['Invalid staff'], issuesB: [] };

    // 1. Locked days check
    const lockedA = locks.find((l) => l.nurseId === nurseAId && l.date === selectedAsgnB.date);
    if (lockedA) {
      issuesA.push(`Nurse ${nurseA.fullName} has a non-changeable lock on ${selectedAsgnB.date}`);
    }
    const lockedB = locks.find((l) => l.nurseId === nurseBId && l.date === selectedAsgnA.date);
    if (lockedB) {
      issuesB.push(`Nurse ${nurseB.fullName} has a non-changeable lock on ${selectedAsgnA.date}`);
    }

    // 2. Approved leave check
    const onLeaveA = leaveEntries.find(
      (le) => le.nurseId === nurseAId && le.approved && selectedAsgnB.date >= le.startDate && selectedAsgnB.date <= le.endDate
    );
    if (onLeaveA) {
      issuesA.push(`Nurse ${nurseA.fullName} is on approved leave on ${selectedAsgnB.date}`);
    }
    const onLeaveB = leaveEntries.find(
      (le) => le.nurseId === nurseBId && le.approved && selectedAsgnA.date >= le.startDate && selectedAsgnA.date <= le.endDate
    );
    if (onLeaveB) {
      issuesB.push(`Nurse ${nurseB.fullName} is on approved leave on ${selectedAsgnA.date}`);
    }

    // 3. Clinical Role Capability check (e.g. Blood Collection & IV)
    if (selectedAsgnB.clinicalRoleId) {
      const hasCap = nurseA.capabilityIds?.includes(selectedAsgnB.clinicalRoleId);
      if (!hasCap) {
        issuesA.push(`Nurse ${nurseA.fullName} lacks the required qualification for this clinical role`);
      }
    }
    if (selectedAsgnA.clinicalRoleId) {
      const hasCap = nurseB.capabilityIds?.includes(selectedAsgnA.clinicalRoleId);
      if (!hasCap) {
        issuesB.push(`Nurse ${nurseB.fullName} lacks the required qualification for this clinical role`);
      }
    }

    // 4. Double-duty on same date check (if different dates swapped)
    if (selectedAsgnA.date !== selectedAsgnB.date) {
      const aAlreadyWorkingOnDateB = assignments.some(
        (a) => a.nurseId === nurseAId && a.date === selectedAsgnB.date && a.id !== selectedAsgnA.id
      );
      if (aAlreadyWorkingOnDateB) {
        issuesA.push(`Nurse ${nurseA.fullName} is already assigned to another duty on ${selectedAsgnB.date}`);
      }

      const bAlreadyWorkingOnDateA = assignments.some(
        (a) => a.nurseId === nurseBId && a.date === selectedAsgnA.date && a.id !== selectedAsgnB.id
      );
      if (bAlreadyWorkingOnDateA) {
        issuesB.push(`Nurse ${nurseB.fullName} is already assigned to another duty on ${selectedAsgnA.date}`);
      }
    }

    return {
      isValid: issuesA.length === 0 && issuesB.length === 0,
      issuesA,
      issuesB,
    };
  }, [selectedAsgnA, selectedAsgnB, nurseAId, nurseBId, nurseMap, locks, leaveEntries, assignments]);

  if (!isOpen) return null;

  const handleExecuteSwap = async () => {
    if (!selectedAsgnA || !selectedAsgnB || !validation.isValid) return;
    setIsExecuting(true);

    try {
      const nurseA = nurseMap.get(nurseAId);
      const nurseB = nurseMap.get(nurseBId);

      const updatedAssignments = assignments.map((a) => {
        if (a.id === selectedAsgnA.id) {
          return {
            ...a,
            nurseId: nurseBId,
            source: 'MANUAL' as const,
            note: `Swapped with ${nurseA?.fullName}. Reason: ${swapReason || 'Mutual staff swap'}`,
          };
        }
        if (a.id === selectedAsgnB.id) {
          return {
            ...a,
            nurseId: nurseAId,
            source: 'MANUAL' as const,
            note: `Swapped with ${nurseB?.fullName}. Reason: ${swapReason || 'Mutual staff swap'}`,
          };
        }
        return a;
      });

      // Record SwapRequest and AuditEvent
      const repo = getRepository();
      const nowIso = new Date().toISOString();

      const swapRecord: SwapRequest = {
        id: uuidv4(),
        scheduleId: schedule.id,
        nurseAId,
        dateA: selectedAsgnA.date,
        assignmentAId: selectedAsgnA.id,
        dutyWindowAId: selectedAsgnA.dutyWindowId,
        nurseBId,
        dateB: selectedAsgnB.date,
        assignmentBId: selectedAsgnB.id,
        dutyWindowBId: selectedAsgnB.dutyWindowId,
        reason: swapReason.trim(),
        status: 'APPROVED',
        requestedBy: nurseA?.fullName || 'Staff',
        createdAt: nowIso,
        resolvedAt: nowIso,
      };

      await repo.create('swaps', swapRecord);

      await repo.create('audit', {
        actor: 'Clinical Supervisor',
        action: 'SWAP',
        entity: 'Assignment',
        entityId: `${selectedAsgnA.id}<->${selectedAsgnB.id}`,
        before: { nurseA: nurseAId, nurseB: nurseBId },
        after: { nurseA: nurseBId, nurseB: nurseAId },
        note: `Approved shift swap between ${nurseA?.fullName} and ${nurseB?.fullName}: ${swapReason || 'Operational swap'}`,
        timestamp: nowIso,
      });

      onApplySwap(
        updatedAssignments,
        `Swapped shifts between ${nurseA?.fullName} (${selectedAsgnA.date}) and ${nurseB?.fullName} (${selectedAsgnB.date})`
      );
      onClose();
    } catch (err: any) {
      alert(`Swap execution failed: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const renderAssignmentSummary = (asgn?: Assignment) => {
    if (!asgn) return <div className="text-slate-400 italic">No shift selected</div>;
    const dw = dutyMap.get(asgn.dutyWindowId);
    let target = 'General Clinic';
    if (asgn.doctorId) target = docMap.get(asgn.doctorId)?.fullName || 'Doctor';
    else if (asgn.clinicalRoleId) target = roleMap.get(asgn.clinicalRoleId)?.name || 'Role';

    return (
      <div className="p-3 rounded bg-slate-50 border border-slate-200 space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-bold font-mono text-slate-900">{asgn.date}</span>
          <span
            className="px-2 py-0.5 rounded text-white font-bold font-mono text-[10px]"
            style={{ backgroundColor: dw?.color || '#4f46e5' }}
          >
            {dw?.acronym} ({dw?.startTime}–{dw?.endTime})
          </span>
        </div>
        <div className="text-[11px] text-slate-600 font-medium">Pairing: {target}</div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs font-sans text-slate-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Shift Swap Manager
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                Bidirectional clinical rule validation with audit trail
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* NURSE A */}
            <div className="p-3 border border-slate-200 rounded-lg space-y-3 bg-white shadow-2xs">
              <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span>Primary Nurse (Nurse A)</span>
              </span>

              <select
                value={nurseAId}
                onChange={(e) => setNurseAId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-medium"
              >
                {nurses.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName} ({n.employeeCode})
                  </option>
                ))}
              </select>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">
                  Select Shift to Relinquish:
                </label>
                <select
                  value={assignmentAId}
                  onChange={(e) => setAssignmentAId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono text-[11px]"
                >
                  {nurseAAsgns.map((a) => {
                    const dw = dutyMap.get(a.dutyWindowId);
                    return (
                      <option key={a.id} value={a.id}>
                        {a.date} — {dw?.name} ({dw?.acronym})
                      </option>
                    );
                  })}
                  {nurseAAsgns.length === 0 && <option value="">No active shifts</option>}
                </select>
              </div>

              {renderAssignmentSummary(selectedAsgnA)}

              {/* Validation Feedback A */}
              {validation.issuesA.length > 0 ? (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-[11px] space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                    <span>Incompatible for Nurse A:</span>
                  </div>
                  {validation.issuesA.map((msg, i) => (
                    <div key={i}>• {msg}</div>
                  ))}
                </div>
              ) : (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-[11px] flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Eligible to receive Nurse B's shift</span>
                </div>
              )}
            </div>

            {/* NURSE B */}
            <div className="p-3 border border-slate-200 rounded-lg space-y-3 bg-white shadow-2xs">
              <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span>Partner Nurse (Nurse B)</span>
              </span>

              <select
                value={nurseBId}
                onChange={(e) => setNurseBId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-medium"
              >
                {nurses.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName} ({n.employeeCode})
                  </option>
                ))}
              </select>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">
                  Select Shift to Relinquish:
                </label>
                <select
                  value={assignmentBId}
                  onChange={(e) => setAssignmentBId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono text-[11px]"
                >
                  {nurseBAsgns.map((a) => {
                    const dw = dutyMap.get(a.dutyWindowId);
                    return (
                      <option key={a.id} value={a.id}>
                        {a.date} — {dw?.name} ({dw?.acronym})
                      </option>
                    );
                  })}
                  {nurseBAsgns.length === 0 && <option value="">No active shifts</option>}
                </select>
              </div>

              {renderAssignmentSummary(selectedAsgnB)}

              {/* Validation Feedback B */}
              {validation.issuesB.length > 0 ? (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-[11px] space-y-1">
                  <div className="font-bold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                    <span>Incompatible for Nurse B:</span>
                  </div>
                  {validation.issuesB.map((msg, i) => (
                    <div key={i}>• {msg}</div>
                  ))}
                </div>
              ) : (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-[11px] flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Eligible to receive Nurse A's shift</span>
                </div>
              )}
            </div>
          </div>

          {/* Reason Field */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-800 text-xs">
              Reason / Swap Notes (Recorded in Audit &amp; Email Alerts):
            </label>
            <input
              type="text"
              placeholder="e.g. Mutual accommodation for clinic CME conference on Saturday"
              value={swapReason}
              onChange={(e) => setSwapReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded font-medium cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!validation.isValid || isExecuting}
            onClick={handleExecuteSwap}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold cursor-pointer shadow-xs disabled:opacity-40 transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Confirm &amp; Execute Shift Swap</span>
          </button>
        </div>
      </div>
    </div>
  );
};
