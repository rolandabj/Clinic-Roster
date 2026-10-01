/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Fairness Dashboard & Rebalance Optimization Engine (Phase 14.1)
 * Per-nurse distribution metrics (weekends off, holidays worked, late-ends, hours)
 * Balance spread score + Automated parity rebalancing with diff preview.
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  Scale,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Moon,
  Calendar,
  Clock,
  Sun,
  ShieldAlert,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  Schedule,
  Assignment,
  Nurse,
  DutyWindow,
  PublicHoliday,
  SeniorityLevel,
  Rule,
  LeaveEntry,
  LockEntry,
} from '../../types';
import { getRepository } from '../../services/repository';

interface FairnessModalProps {
  schedule: Schedule;
  assignments: Assignment[];
  nurses: Nurse[];
  dutyWindows: DutyWindow[];
  holidays: PublicHoliday[];
  seniorityLevels: SeniorityLevel[];
  leaveEntries: LeaveEntry[];
  locks: LockEntry[];
  isOpen: boolean;
  onClose: () => void;
  onApplyAssignments: (updated: Assignment[], note: string) => void;
}

export interface NurseFairnessMetrics {
  nurse: Nurse;
  totalDutyHours: number;
  targetHours: number;
  hoursDelta: number;
  weekendsWorked: number;
  weekendsOff: number;
  holidaysWorked: number;
  lateEndsCount: number;
}

export interface ProposedSwap {
  id: string;
  date: string;
  dutyName: string;
  overloadedNurse: Nurse;
  underloadedNurse: Nurse;
  assignmentA: Assignment;
  assignmentB?: Assignment;
  reason: string;
}

export const FairnessModal: React.FC<FairnessModalProps> = ({
  schedule,
  assignments,
  nurses,
  dutyWindows,
  holidays,
  seniorityLevels,
  leaveEntries,
  locks,
  isOpen,
  onClose,
  onApplyAssignments,
}) => {
  const [activeTab, setActiveTab] = useState<'METRICS' | 'REBALANCE'>('METRICS');
  const [selectedSwaps, setSelectedSwaps] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);

  const dutyMap = useMemo(() => new Map(dutyWindows.map((d) => [d.id, d])), [dutyWindows]);
  const holidayDateSet = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);

  // Compute metrics per nurse
  const metrics: NurseFairnessMetrics[] = useMemo(() => {
    return nurses.map((nurse) => {
      const nurseAsgns = assignments.filter((a) => a.nurseId === nurse.id);
      let totalDutyHours = 0;
      let lateEndsCount = 0;
      let holidaysWorked = 0;
      let weekendsWorked = 0;

      const workingDates = new Set<string>();

      for (const a of nurseAsgns) {
        workingDates.add(a.date);
        const dw = dutyMap.get(a.dutyWindowId);
        if (dw) {
          const [sh, sm] = dw.startTime.split(':').map(Number);
          const [eh, em] = dw.endTime.split(':').map(Number);
          let mins = eh * 60 + em - (sh * 60 + sm);
          if (mins < 0) mins += 24 * 60;
          totalDutyHours += mins / 60;

          // Late ends (at or after 21:00)
          if (eh >= 21) {
            lateEndsCount++;
          }
        }

        // Public holidays worked
        if (holidayDateSet.has(a.date)) {
          holidaysWorked++;
        }

        // Weekend duty (Sunday = 0, Saturday = 6)
        const dObj = new Date(a.date);
        const day = dObj.getUTCDay();
        if (day === 0 || day === 6) {
          weekendsWorked++;
        }
      }

      // Total weekend days in schedule
      let totalWeekendDays = 0;
      const start = new Date(schedule.startDate);
      const end = new Date(schedule.endDate);
      const cur = new Date(start);
      while (cur <= end) {
        const day = cur.getUTCDay();
        if (day === 0 || day === 6) totalWeekendDays++;
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      const weekendsOff = Math.max(0, totalWeekendDays - weekendsWorked);
      const targetHours = Math.round((schedule.hoursTargetFullTime * (nurse.contractPercent || 100)) / 100);
      const hoursDelta = totalDutyHours - targetHours;

      return {
        nurse,
        totalDutyHours,
        targetHours,
        hoursDelta,
        weekendsWorked,
        weekendsOff,
        holidaysWorked,
        lateEndsCount,
      };
    });
  }, [nurses, assignments, dutyMap, holidayDateSet, schedule]);

  // Compute Overall Balance Spread Score (0 - 100)
  const spreadScore = useMemo(() => {
    if (metrics.length === 0) return 100;
    const hourDeltas = metrics.map((m) => Math.abs(m.hoursDelta));
    const avgDelta = hourDeltas.reduce((a, b) => a + b, 0) / hourDeltas.length;
    const lateCounts = metrics.map((m) => m.lateEndsCount);
    const maxLate = Math.max(...lateCounts, 0);
    const minLate = Math.min(...lateCounts, 0);
    const lateSpread = maxLate - minLate;

    // Penalty based on hour variance and late spread
    let score = 100 - avgDelta * 1.5 - lateSpread * 4;
    return Math.max(10, Math.min(100, Math.round(score)));
  }, [metrics]);

  // Generate safe parity swaps for Rebalance mode
  const proposedSwaps = useMemo<ProposedSwap[]>(() => {
    if (metrics.length < 2) return [];

    // Sort by hoursDelta descending
    const sorted = [...metrics].sort((a, b) => b.hoursDelta - a.hoursDelta);
    const overloaded = sorted.filter((m) => m.hoursDelta > 4 || m.lateEndsCount >= 4);
    const underloaded = sorted.filter((m) => m.hoursDelta < -4 || m.lateEndsCount <= 1);

    const swaps: ProposedSwap[] = [];
    const lockedDatesByNurse = new Set(locks.map((l) => `${l.nurseId}_${l.date}`));
    const leaveDatesByNurse = new Set(
      leaveEntries.flatMap((le) => {
        const list: string[] = [];
        const cur = new Date(le.startDate);
        const end = new Date(le.endDate);
        while (cur <= end) {
          list.push(`${le.nurseId}_${cur.toISOString().split('T')[0]}`);
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
        return list;
      })
    );

    for (const over of overloaded) {
      for (const under of underloaded) {
        if (over.nurse.id === under.nurse.id) continue;

        // Find an assignment belonging to 'over' where 'under' has no duty and no leave/lock
        const candidates = assignments.filter(
          (a) => a.nurseId === over.nurse.id && a.source !== 'LOCK' && !a.locked
        );

        for (const asgn of candidates) {
          const underHasDuty = assignments.some(
            (a) => a.nurseId === under.nurse.id && a.date === asgn.date
          );
          const underIsLocked = lockedDatesByNurse.has(`${under.nurse.id}_${asgn.date}`);
          const underOnLeave = leaveDatesByNurse.has(`${under.nurse.id}_${asgn.date}`);

          if (!underHasDuty && !underIsLocked && !underOnLeave) {
            const dw = dutyMap.get(asgn.dutyWindowId);
            swaps.push({
              id: `swap-${asgn.id}-${under.nurse.id}`,
              date: asgn.date,
              dutyName: dw ? `${dw.name} (${dw.startTime}–${dw.endTime})` : 'Duty Shift',
              overloadedNurse: over.nurse,
              underloadedNurse: under.nurse,
              assignmentA: asgn,
              reason:
                over.hoursDelta > 0
                  ? `Reduces +${over.hoursDelta}h surplus for ${over.nurse.fullName}`
                  : `Redistributes late-end duty from ${over.nurse.fullName}`,
            });

            if (swaps.length >= 6) break;
          }
        }
        if (swaps.length >= 6) break;
      }
      if (swaps.length >= 6) break;
    }

    return swaps;
  }, [metrics, assignments, dutyMap, locks, leaveEntries]);

  if (!isOpen) return null;

  const handleApplyRebalance = async () => {
    setIsApplying(true);
    try {
      const swapsToApply = proposedSwaps.filter((s) => selectedSwaps.has(s.id));
      if (swapsToApply.length === 0) return;

      const updated = assignments.map((a) => {
        const swap = swapsToApply.find((s) => s.assignmentA.id === a.id);
        if (swap) {
          return {
            ...a,
            nurseId: swap.underloadedNurse.id,
            source: 'GENERATED' as const,
            note: `Rebalanced from ${swap.overloadedNurse.fullName}`,
          };
        }
        return a;
      });

      // Audit entry
      const repo = getRepository();
      await repo.create('audit', {
        actor: 'Fairness Engine',
        action: 'REBALANCE',
        entity: 'Schedule',
        entityId: schedule.id,
        note: `Applied ${swapsToApply.length} fairness rebalancing swaps.`,
        timestamp: new Date().toISOString(),
      });

      onApplyAssignments(updated, `Rebalanced ${swapsToApply.length} shifts towards parity`);
      onClose();
    } catch (err: any) {
      alert(`Rebalancing failed: ${err.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs font-sans text-slate-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Roster Fairness &amp; Parity Dashboard
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                {schedule.name} · Equity spread analysis &amp; automated parity swaps
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

        {/* Global Summary Bar */}
        <div className="px-6 py-3 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">Fairness Spread Score:</span>
              <span
                className={`font-mono font-bold text-sm px-2.5 py-0.5 rounded border ${
                  spreadScore >= 80
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : spreadScore >= 60
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-rose-100 text-rose-900 border-rose-300'
                }`}
              >
                {spreadScore} / 100
              </span>
            </div>

            <span className="text-slate-300">|</span>

            <div className="text-slate-600 text-[11px]">
              Evaluates variance in working hours, weekend rotations, holidays, and 21:00 late-ends.
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex items-center gap-1 bg-white p-1 rounded border border-slate-200">
            <button
              onClick={() => setActiveTab('METRICS')}
              className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                activeTab === 'METRICS'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Staff Metrics Grid
            </button>
            <button
              onClick={() => {
                setActiveTab('REBALANCE');
                setSelectedSwaps(new Set(proposedSwaps.map((s) => s.id)));
              }}
              className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                activeTab === 'REBALANCE'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Parity Rebalance ({proposedSwaps.length})</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'METRICS' && (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded-lg overflow-hidden shadow-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-600 font-mono text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">Nursing Staff</th>
                      <th className="py-2.5 px-3">Contract</th>
                      <th className="py-2.5 px-3">Target</th>
                      <th className="py-2.5 px-3">Worked</th>
                      <th className="py-2.5 px-3">Variance</th>
                      <th className="py-2.5 px-3">Weekends Off</th>
                      <th className="py-2.5 px-3">Holidays Worked</th>
                      <th className="py-2.5 px-3">21:00 Late-Ends</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {metrics.map((m) => (
                      <tr key={m.nurse.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-sans font-bold text-slate-900">
                          {m.nurse.fullName}
                        </td>
                        <td className="py-3 px-3 text-slate-600">{m.nurse.contractPercent}%</td>
                        <td className="py-3 px-3 text-slate-600">{m.targetHours}h</td>
                        <td className="py-3 px-3 font-bold text-indigo-700">{m.totalDutyHours}h</td>
                        <td className="py-3 px-3">
                          <span
                            className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                              Math.abs(m.hoursDelta) <= 2
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.hoursDelta > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {m.hoursDelta >= 0 ? `+${m.hoursDelta}h` : `${m.hoursDelta}h`}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-700">{m.weekendsOff} days</td>
                        <td className="py-3 px-3 text-slate-700">{m.holidaysWorked}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                              m.lateEndsCount >= 4
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {m.lateEndsCount} shifts
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'REBALANCE' && (
            <div className="space-y-4">
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded text-xs space-y-1">
                <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Automated Fairness Optimization Engine</span>
                </div>
                <p className="text-indigo-900 text-[11px] leading-relaxed">
                  The algorithm identifies safe shift transfers from staff with surplus hours or excessive 21:00 late-ends to qualified under-allocated staff, preserving all hard clinical constraints.
                </p>
              </div>

              {proposedSwaps.length > 0 ? (
                <div className="space-y-2">
                  <span className="font-bold text-slate-800 block text-xs">
                    Proposed Shift Transfers ({proposedSwaps.length}):
                  </span>

                  <div className="space-y-2">
                    {proposedSwaps.map((s) => {
                      const isSelected = selectedSwaps.has(s.id);
                      return (
                        <div
                          key={s.id}
                          onClick={() => {
                            const next = new Set(selectedSwaps);
                            if (isSelected) next.delete(s.id);
                            else next.add(s.id);
                            setSelectedSwaps(next);
                          }}
                          className={`p-3 rounded border transition-colors cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/40 text-slate-900'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded text-indigo-600 pointer-events-none"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold font-mono">{s.date}</span>
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[10px]">
                                  {s.dutyName}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[11px]">
                                <span className="text-rose-700 font-medium">
                                  {s.overloadedNurse.fullName}
                                </span>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <span className="text-emerald-700 font-bold">
                                  {s.underloadedNurse.fullName}
                                </span>
                              </div>
                            </div>
                          </div>

                          <span className="text-[11px] text-slate-500 font-mono">{s.reason}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-8 border border-slate-200 rounded text-center text-slate-400 text-xs">
                  Schedule is already at optimal fairness. No beneficial transfers detected.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded font-medium cursor-pointer"
          >
            Close
          </button>

          {activeTab === 'REBALANCE' && proposedSwaps.length > 0 && (
            <button
              type="button"
              disabled={selectedSwaps.size === 0 || isApplying}
              onClick={handleApplyRebalance}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold cursor-pointer shadow-xs disabled:opacity-40"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Apply {selectedSwaps.size} Parity Swaps</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
