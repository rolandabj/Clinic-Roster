/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Version Compare & Diff Modal (Phase 10)
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  Diff,
  ArrowRight,
  Filter,
  Search,
  Download,
  RotateCcw,
  CheckCircle2,
  Calendar,
  User,
  Layers,
  Sparkles,
  Lock,
} from 'lucide-react';
import {
  ScheduleVersion,
  Assignment,
  Nurse,
  DutyWindow,
  Doctor,
  ClinicalRole,
  Specialty,
  Schedule,
} from '../../types';
import {
  computeScheduleDiff,
  ScheduleVersionDiff,
  AssignmentDiffItem,
} from '../../services/history/diffEngine';

interface VersionCompareModalProps {
  schedule: Schedule;
  versions: ScheduleVersion[];
  activeAssignments: Assignment[];
  nurses: Nurse[];
  dutyWindows: DutyWindow[];
  doctors: Doctor[];
  roles: ClinicalRole[];
  specialties: Specialty[];
  initialBaseVersionId?: string;
  initialTargetVersionId?: string;
  isOpen: boolean;
  onClose: () => void;
  onRestoreVersion?: (version: ScheduleVersion) => void;
}

export const VersionCompareModal: React.FC<VersionCompareModalProps> = ({
  schedule,
  versions,
  activeAssignments,
  nurses,
  dutyWindows,
  doctors,
  roles,
  specialties,
  initialBaseVersionId,
  initialTargetVersionId,
  isOpen,
  onClose,
  onRestoreVersion,
}) => {
  // 'DRAFT' represents active current draft
  const [baseId, setBaseId] = useState<string>(() => {
    if (initialBaseVersionId) return initialBaseVersionId;
    if (versions.length > 1) return versions[1].id;
    if (versions.length === 1) return versions[0].id;
    return 'DRAFT';
  });

  const [targetId, setTargetId] = useState<string>(() => {
    if (initialTargetVersionId) return initialTargetVersionId;
    return 'DRAFT';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [changeTypeFilter, setChangeTypeFilter] = useState<'ALL' | 'ADDED' | 'REMOVED' | 'MODIFIED'>('ALL');
  const [nurseFilter, setNurseFilter] = useState<string>('ALL');

  // Compute diff
  const diffResult: ScheduleVersionDiff = useMemo(() => {
    const baseVer = versions.find((v) => v.id === baseId);
    const targetVer = versions.find((v) => v.id === targetId);

    const baseAsgns = baseId === 'DRAFT' ? activeAssignments : baseVer?.snapshot.assignments || [];
    const targetAsgns = targetId === 'DRAFT' ? activeAssignments : targetVer?.snapshot.assignments || [];

    const baseLabel = baseId === 'DRAFT' ? `Active Draft (Current)` : `Version v${baseVer?.number || '?'}`;
    const targetLabel = targetId === 'DRAFT' ? `Active Draft (Current)` : `Version v${targetVer?.number || '?'}`;

    return computeScheduleDiff(
      baseAsgns,
      targetAsgns,
      nurses,
      dutyWindows,
      doctors,
      roles,
      specialties,
      baseLabel,
      targetLabel,
      baseVer?.number,
      targetVer?.number
    );
  }, [
    baseId,
    targetId,
    versions,
    activeAssignments,
    nurses,
    dutyWindows,
    doctors,
    roles,
    specialties,
  ]);

  if (!isOpen) return null;

  const filteredChanges = diffResult.allChanges.filter((item) => {
    const matchesSearch =
      item.nurseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.date.includes(searchQuery) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType =
      changeTypeFilter === 'ALL' || item.changeType === changeTypeFilter;

    const matchesNurse =
      nurseFilter === 'ALL' || item.nurseId === nurseFilter;

    return matchesSearch && matchesType && matchesNurse;
  });

  const handleExportDiffCsv = () => {
    const headers = [
      'Date',
      'Day of Week',
      'Nurse Name',
      'Change Type',
      'Before Duty',
      'Before Times',
      'Before Paired',
      'After Duty',
      'After Times',
      'After Paired',
      'Change Summary',
    ];

    const lines = [headers.join(',')];
    diffResult.allChanges.forEach((c) => {
      lines.push(
        [
          c.date,
          c.weekday,
          `"${c.nurseName}"`,
          c.changeType,
          c.before ? `"${c.before.dutyAcronym}"` : '""',
          c.before ? `"${c.before.dutyTimes}"` : '""',
          c.before ? `"${c.before.targetName}"` : '""',
          c.after ? `"${c.after.dutyAcronym}"` : '""',
          c.after ? `"${c.after.dutyTimes}"` : '""',
          c.after ? `"${c.after.targetName}"` : '""',
          `"${c.description}"`,
        ].join(',')
      );
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `diff-${diffResult.baseVersionLabel}-vs-${diffResult.targetVersionLabel}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Diff className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Compare Schedule Versions</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                  DIFF ENGINE
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                Side-by-side audit of cell assignment changes, doctor re-pairings, and duty swaps.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportDiffCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-100 rounded text-xs font-medium text-slate-700 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export Diff CSV</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Version Pickers Bar */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Base Selector */}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Base (Older):</span>
              <select
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded font-semibold text-slate-800 bg-white"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.number} — {v.note || 'Snapshot'} ({new Date(v.timestamp).toLocaleDateString()})
                  </option>
                ))}
                <option value="DRAFT">Active Current Draft</option>
              </select>
            </div>

            <ArrowRight className="w-4 h-4 text-slate-400" />

            {/* Target Selector */}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Target (Newer):</span>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded font-semibold text-slate-800 bg-white"
              >
                <option value="DRAFT">Active Current Draft</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.number} — {v.note || 'Snapshot'} ({new Date(v.timestamp).toLocaleDateString()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2 font-mono">
            <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-bold">
              {diffResult.totalChangesCount} Total Changes
            </span>
            <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 font-bold">
              +{diffResult.addedCount} Added
            </span>
            <span className="px-2 py-1 rounded bg-rose-50 text-rose-700 font-bold">
              -{diffResult.removedCount} Removed
            </span>
            <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 font-bold">
              ~{diffResult.modifiedCount} Modified
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-1 items-center gap-2 max-w-sm">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search changed nurse, date, doctor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Nurse:</span>
              <select
                value={nurseFilter}
                onChange={(e) => setNurseFilter(e.target.value)}
                className="px-2 py-1 border border-slate-200 rounded bg-white text-slate-700"
              >
                <option value="ALL">All Staff</option>
                {nurses.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Change:</span>
              <select
                value={changeTypeFilter}
                onChange={(e) => setChangeTypeFilter(e.target.value as any)}
                className="px-2 py-1 border border-slate-200 rounded bg-white text-slate-700"
              >
                <option value="ALL">All Changes ({diffResult.totalChangesCount})</option>
                <option value="MODIFIED">Modified Only ({diffResult.modifiedCount})</option>
                <option value="ADDED">Added Only ({diffResult.addedCount})</option>
                <option value="REMOVED">Removed Only ({diffResult.removedCount})</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table of Changes */}
        <div className="flex-1 overflow-y-auto">
          {filteredChanges.length > 0 ? (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-600 font-mono text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-3">Nurse Staff</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">{diffResult.baseVersionLabel} (Before)</th>
                  <th className="py-2.5 px-2 text-center"></th>
                  <th className="py-2.5 px-3">{diffResult.targetVersionLabel} (After)</th>
                  <th className="py-2.5 px-4 text-right">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredChanges.map((change) => {
                  const isMod = change.changeType === 'MODIFIED';
                  const isAdd = change.changeType === 'ADDED';
                  const isRem = change.changeType === 'REMOVED';

                  return (
                    <tr
                      key={change.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isAdd
                          ? 'bg-emerald-50/20'
                          : isRem
                          ? 'bg-rose-50/20'
                          : 'bg-indigo-50/15'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                        <span>{change.date}</span>
                        <span className="text-slate-400 font-normal ml-1">({change.weekday})</span>
                      </td>

                      <td className="py-2.5 px-3 font-sans font-medium text-slate-900">
                        {change.nurseName}
                      </td>

                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isAdd
                              ? 'bg-emerald-100 text-emerald-800'
                              : isRem
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {change.changeType}
                        </span>
                      </td>

                      {/* Before State */}
                      <td className="py-2.5 px-3">
                        {change.before ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="px-1.5 py-0.5 rounded text-white font-bold text-[10px]"
                              style={{ backgroundColor: change.before.dutyColor }}
                            >
                              {change.before.dutyAcronym}
                            </span>
                            <div>
                              <span className="font-semibold text-slate-800 block">
                                {change.before.targetName}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {change.before.dutyTimes}
                              </span>
                            </div>
                            {change.before.locked && (
                              <Lock className="w-3 h-3 text-amber-600 ml-1" />
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">None / Off</span>
                        )}
                      </td>

                      {/* Arrow */}
                      <td className="py-2.5 px-2 text-center text-slate-400">
                        <ArrowRight className="w-3.5 h-3.5 mx-auto" />
                      </td>

                      {/* After State */}
                      <td className="py-2.5 px-3">
                        {change.after ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="px-1.5 py-0.5 rounded text-white font-bold text-[10px]"
                              style={{ backgroundColor: change.after.dutyColor }}
                            >
                              {change.after.dutyAcronym}
                            </span>
                            <div>
                              <span className="font-semibold text-slate-900 block">
                                {change.after.targetName}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {change.after.dutyTimes}
                              </span>
                            </div>
                            {change.after.locked && (
                              <Lock className="w-3 h-3 text-amber-600 ml-1" />
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">None / Off</span>
                        )}
                      </td>

                      {/* Description */}
                      <td className="py-2.5 px-4 text-right font-sans text-[11px] text-slate-600">
                        {change.description}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="font-medium text-slate-700">No assignment differences detected.</p>
              <p className="text-[11px]">
                Both versions share identical nurse assignments across all dates.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            Showing {filteredChanges.length} of {diffResult.totalChangesCount} differences
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded font-medium cursor-pointer"
            >
              Close Diff
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
