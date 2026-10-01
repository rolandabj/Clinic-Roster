/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Roster Template Manager & "Copy Previous Period" (Phase 14.2)
 * Save schedule as recurring template · Apply template · Copy last month
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  Copy,
  Save,
  CheckCircle2,
  Trash2,
  Calendar,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  Schedule,
  Assignment,
  Nurse,
  DutyWindow,
  RosterTemplate,
  TemplateSlotPattern,
  LeaveEntry,
  LockEntry,
} from '../../types';
import { getRepository } from '../../services/repository';

interface TemplateModalProps {
  schedule: Schedule;
  assignments: Assignment[];
  nurses: Nurse[];
  dutyWindows: DutyWindow[];
  leaveEntries: LeaveEntry[];
  locks: LockEntry[];
  allSchedules: Schedule[];
  isOpen: boolean;
  onClose: () => void;
  onApplyAssignments: (updated: Assignment[], note: string) => void;
}

export const TemplateModal: React.FC<TemplateModalProps> = ({
  schedule,
  assignments,
  nurses,
  dutyWindows,
  leaveEntries,
  locks,
  allSchedules,
  isOpen,
  onClose,
  onApplyAssignments,
}) => {
  const [activeTab, setActiveTab] = useState<'SAVE' | 'APPLY' | 'COPY_PERIOD'>('SAVE');
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<RosterTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedSourceScheduleId, setSelectedSourceScheduleId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const repo = getRepository();

  const loadTemplates = async () => {
    try {
      const list = await repo.list('templates');
      setSavedTemplates(list);
      if (list.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(list[0].id);
      }
    } catch (e) {
      console.error('Error loading templates:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setTemplateName(`${schedule.name} Baseline Pattern`);
      const otherSchedules = allSchedules.filter((s) => s.id !== schedule.id);
      if (otherSchedules.length > 0) {
        setSelectedSourceScheduleId(otherSchedules[0].id);
      }
    }
  }, [isOpen, schedule.id]);

  if (!isOpen) return null;

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // 1. SAVE CURRENT AS TEMPLATE
  const handleSaveAsTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim()) return;

    try {
      const patterns: TemplateSlotPattern[] = [];
      const seen = new Set<string>();

      for (const a of assignments) {
        const dObj = new Date(a.date);
        const weekday = dObj.getUTCDay();
        const key = `${a.nurseId}_${weekday}`;

        if (!seen.has(key)) {
          seen.add(key);
          patterns.push({
            nurseId: a.nurseId,
            weekday,
            dutyWindowId: a.dutyWindowId,
            kind: a.kind,
            targetRefId: a.doctorId || a.clinicalRoleId || a.specialtyId,
          });
        }
      }

      const newTemplate: RosterTemplate = {
        id: uuidv4(),
        name: templateName.trim(),
        description: templateDescription.trim(),
        patterns,
        sourceScheduleId: schedule.id,
        createdAt: new Date().toISOString(),
      };

      await repo.create('templates', newTemplate);
      triggerToast('Template saved successfully!');
      loadTemplates();
      setActiveTab('APPLY');
    } catch (err: any) {
      alert(`Save template failed: ${err.message}`);
    }
  };

  // 2. APPLY TEMPLATE TO CURRENT SCHEDULE
  const handleApplyTemplate = async () => {
    const template = savedTemplates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    setIsProcessing(true);
    try {
      const lockedNurseDates = new Set(locks.map((l) => `${l.nurseId}_${l.date}`));
      const leaveNurseDates = new Set(
        leaveEntries.flatMap((le) => {
          const dates: string[] = [];
          const cur = new Date(le.startDate);
          const end = new Date(le.endDate);
          while (cur <= end) {
            dates.push(`${le.nurseId}_${cur.toISOString().split('T')[0]}`);
            cur.setUTCDate(cur.getUTCDate() + 1);
          }
          return dates;
        })
      );

      // Keep locked and manual assignments
      const kept = assignments.filter((a) => a.source === 'LOCK' || a.locked);
      const keptKeys = new Set(kept.map((a) => `${a.nurseId}_${a.date}`));

      const start = new Date(schedule.startDate);
      const end = new Date(schedule.endDate);
      const cur = new Date(start);
      const newAssignments: Assignment[] = [...kept];

      while (cur <= end) {
        const dateStr = cur.toISOString().split('T')[0];
        const weekday = cur.getUTCDay();

        for (const pattern of template.patterns) {
          const key = `${pattern.nurseId}_${dateStr}`;
          if (keptKeys.has(key)) continue;
          if (lockedNurseDates.has(key)) continue;
          if (leaveNurseDates.has(key)) continue;

          newAssignments.push({
            id: uuidv4(),
            scheduleId: schedule.id,
            nurseId: pattern.nurseId,
            date: dateStr,
            dutyWindowId: pattern.dutyWindowId,
            kind: pattern.kind,
            doctorId: pattern.kind === 'DOCTOR' ? pattern.targetRefId : undefined,
            clinicalRoleId: pattern.kind === 'CLINICAL_ROLE' ? pattern.targetRefId : undefined,
            specialtyId: pattern.kind === 'SPECIALTY' ? pattern.targetRefId : undefined,
            locked: false,
            source: 'GENERATED',
            note: `From template "${template.name}"`,
          });
        }

        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      await repo.create('audit', {
        actor: 'Roster Planner',
        action: 'TEMPLATE_APPLY',
        entity: 'Schedule',
        entityId: schedule.id,
        note: `Applied roster template "${template.name}".`,
        timestamp: new Date().toISOString(),
      });

      onApplyAssignments(newAssignments, `Applied template "${template.name}"`);
      onClose();
    } catch (err: any) {
      alert(`Apply template failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. COPY PREVIOUS PERIOD / COPY LAST MONTH
  const handleCopyPreviousPeriod = async () => {
    if (!selectedSourceScheduleId) return;
    setIsProcessing(true);

    try {
      const allAsgns = await repo.list('assignments');
      const sourceAsgns = allAsgns.filter((a) => a.scheduleId === selectedSourceScheduleId);
      const sourceSchedule = allSchedules.find((s) => s.id === selectedSourceScheduleId);

      // Build weekday pattern from source schedule
      const patternsByNurseWeekday = new Map<string, Assignment>();
      for (const a of sourceAsgns) {
        const d = new Date(a.date);
        const w = d.getUTCDay();
        const key = `${a.nurseId}_${w}`;
        if (!patternsByNurseWeekday.has(key)) {
          patternsByNurseWeekday.set(key, a);
        }
      }

      const lockedNurseDates = new Set(locks.map((l) => `${l.nurseId}_${l.date}`));
      const leaveNurseDates = new Set(
        leaveEntries.flatMap((le) => {
          const dates: string[] = [];
          const cur = new Date(le.startDate);
          const end = new Date(le.endDate);
          while (cur <= end) {
            dates.push(`${le.nurseId}_${cur.toISOString().split('T')[0]}`);
            cur.setUTCDate(cur.getUTCDate() + 1);
          }
          return dates;
        })
      );

      const kept = assignments.filter((a) => a.source === 'LOCK' || a.locked);
      const keptKeys = new Set(kept.map((a) => `${a.nurseId}_${a.date}`));

      const start = new Date(schedule.startDate);
      const end = new Date(schedule.endDate);
      const cur = new Date(start);
      const copiedAssignments: Assignment[] = [...kept];

      while (cur <= end) {
        const dateStr = cur.toISOString().split('T')[0];
        const weekday = cur.getUTCDay();

        for (const nurse of nurses) {
          const key = `${nurse.id}_${dateStr}`;
          if (keptKeys.has(key)) continue;
          if (lockedNurseDates.has(key)) continue;
          if (leaveNurseDates.has(key)) continue;

          const pattern = patternsByNurseWeekday.get(`${nurse.id}_${weekday}`);
          if (pattern) {
            copiedAssignments.push({
              id: uuidv4(),
              scheduleId: schedule.id,
              nurseId: nurse.id,
              date: dateStr,
              dutyWindowId: pattern.dutyWindowId,
              kind: pattern.kind,
              doctorId: pattern.doctorId,
              clinicalRoleId: pattern.clinicalRoleId,
              specialtyId: pattern.specialtyId,
              locked: false,
              source: 'GENERATED',
              note: `Copied from ${sourceSchedule?.name || 'previous period'}`,
            });
          }
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      await repo.create('audit', {
        actor: 'Roster Planner',
        action: 'UPDATE',
        entity: 'Schedule',
        entityId: schedule.id,
        note: `Copied assignments from ${sourceSchedule?.name}.`,
        timestamp: new Date().toISOString(),
      });

      onApplyAssignments(copiedAssignments, `Copied from ${sourceSchedule?.name}`);
      onClose();
    } catch (err: any) {
      alert(`Copy previous period failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this template?')) return;
    await repo.remove('templates', id);
    loadTemplates();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs font-sans text-slate-800">
        {/* Toast */}
        {toastMsg && (
          <div className="absolute top-4 right-4 z-50 bg-slate-900 text-white px-3 py-1.5 rounded shadow text-xs flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Roster Templates &amp; Period Replication
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                Save recurring weekly patterns or clone previous rosters
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

        {/* Tabs Bar */}
        <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center gap-3">
          <button
            onClick={() => setActiveTab('SAVE')}
            className={`px-3 py-1.5 rounded font-bold transition-colors cursor-pointer ${
              activeTab === 'SAVE'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            Save as Template
          </button>

          <button
            onClick={() => setActiveTab('APPLY')}
            className={`px-3 py-1.5 rounded font-bold transition-colors cursor-pointer ${
              activeTab === 'APPLY'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            Apply Saved Template ({savedTemplates.length})
          </button>

          <button
            onClick={() => setActiveTab('COPY_PERIOD')}
            className={`px-3 py-1.5 rounded font-bold transition-colors cursor-pointer ${
              activeTab === 'COPY_PERIOD'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            Copy Previous Month
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: SAVE */}
          {activeTab === 'SAVE' && (
            <form onSubmit={handleSaveAsTemplate} className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-600 text-[11px] leading-relaxed">
                Extracts the weekday duty &amp; pairing pattern from <strong>{schedule.name}</strong> ({assignments.length} assignments) into a reusable template.
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-800 text-xs">
                  Template Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-medium text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-800 text-xs">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Standard 2-week outpatient rotation pattern for clinic"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold cursor-pointer shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Roster Template</span>
              </button>
            </form>
          )}

          {/* TAB 2: APPLY */}
          {activeTab === 'APPLY' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-600 text-[11px] leading-relaxed">
                Pre-fills the active schedule from a saved template. Existing locked cells and approved leave days are strictly protected and never overwritten.
              </div>

              {savedTemplates.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {savedTemplates.map((t) => {
                    const isSelected = t.id === selectedTemplateId;
                    return (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTemplateId(t.id)}
                        className={`p-3 rounded border cursor-pointer transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div>
                          <div className="font-bold">{t.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {t.patterns.length} weekly slot rules · Created {new Date(t.createdAt).toLocaleDateString()}
                          </div>
                          {t.description && (
                            <p className="text-[11px] text-slate-600 mt-1 italic">{t.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => handleDeleteTemplate(t.id, e)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Delete template"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 border border-slate-200 rounded text-center text-slate-400 text-xs">
                  No saved templates found. Use "Save as Template" to capture the current schedule.
                </div>
              )}

              {savedTemplates.length > 0 && (
                <button
                  type="button"
                  disabled={!selectedTemplateId || isProcessing}
                  onClick={handleApplyTemplate}
                  className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold cursor-pointer shadow-xs disabled:opacity-40"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Apply Selected Template to Schedule</span>
                </button>
              )}
            </div>
          )}

          {/* TAB 3: COPY PREVIOUS MONTH */}
          {activeTab === 'COPY_PERIOD' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-slate-600 text-[11px] leading-relaxed">
                Copies the assignments from an earlier schedule (e.g. last month's approved roster) into the current period, mapping by day-of-week and protecting current leave/locks.
              </div>

              <div className="space-y-2">
                <label className="block font-bold text-slate-800 text-xs">
                  Select Source Schedule to Copy:
                </label>
                <select
                  value={selectedSourceScheduleId}
                  onChange={(e) => setSelectedSourceScheduleId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-medium text-xs bg-white"
                >
                  {allSchedules
                    .filter((s) => s.id !== schedule.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.startDate} to {s.endDate} · {s.status})
                      </option>
                    ))}
                </select>
              </div>

              <button
                type="button"
                disabled={!selectedSourceScheduleId || isProcessing}
                onClick={handleCopyPreviousPeriod}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold cursor-pointer shadow-xs disabled:opacity-40"
              >
                <Copy className="w-4 h-4" />
                <span>Clone Previous Period Pattern</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
