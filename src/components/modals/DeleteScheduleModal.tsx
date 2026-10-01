/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Delete Schedule Verification Modal
 * Provides safe, explicit confirmation before permanently deleting an entire schedule
 * along with its assignments, versions, and publication links.
 */

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Trash2,
  X,
  Calendar,
  Layers,
  Clock,
  ShieldAlert,
  History,
} from 'lucide-react';
import { Schedule } from '../../types';

interface DeleteScheduleModalProps {
  isOpen: boolean;
  schedule: Schedule | null;
  shiftCount?: number;
  versionCount?: number;
  onClose: () => void;
  onConfirmDelete: (schedule: Schedule) => Promise<void> | void;
}

export const DeleteScheduleModal: React.FC<DeleteScheduleModalProps> = ({
  isOpen,
  schedule,
  shiftCount,
  versionCount,
  onClose,
  onConfirmDelete,
}) => {
  const [confirmed, setConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfirmed(false);
      setIsDeleting(false);
    }
  }, [isOpen, schedule]);

  if (!isOpen || !schedule) return null;

  const handleDelete = async () => {
    if (!confirmed || isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirmDelete(schedule);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-xl border border-rose-200 shadow-2xl max-w-lg w-full overflow-hidden text-xs">
        {/* Header */}
        <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Trash2 className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Delete Schedule
                </h2>
                <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold font-mono text-[10px]">
                  {schedule.status}
                </span>
              </div>
              <p className="text-[11px] text-rose-800 mt-0.5 font-medium">
                Permanent schedule deletion verification
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <p className="text-slate-700 leading-relaxed text-xs">
            Are you sure you want to permanently delete the schedule <strong className="text-slate-900">&ldquo;{schedule.name}&rdquo;</strong>?
          </p>

          {/* Schedule Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2 text-xs">
            <div className="flex items-start justify-between gap-2 border-b border-slate-200/80 pb-2">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Schedule Roster Name
                </span>
                <span className="font-semibold text-slate-900 text-xs">
                  {schedule.name}
                </span>
              </div>
              <span className="font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px]">
                {schedule.startDate} → {schedule.endDate}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1 font-mono">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{schedule.blockWeeks * 7}d block cycles</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{schedule.hoursTargetFullTime}h full-time target</span>
              </div>
            </div>

            {/* Counts */}
            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] font-mono text-slate-600">
              {shiftCount !== undefined && (
                <span className="flex items-center gap-1">
                  <Layers className="w-3 h-3 text-slate-400" />
                  <strong>{shiftCount}</strong> assigned shifts
                </span>
              )}
              {versionCount !== undefined && (
                <span className="flex items-center gap-1">
                  <History className="w-3 h-3 text-slate-400" />
                  <strong>{versionCount}</strong> version checkpoints
                </span>
              )}
            </div>
          </div>

          {/* High Impact Warning */}
          <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-snug space-y-1">
              <strong className="font-bold">Cascading Deletion:</strong>
              <p>
                Deleting this schedule will permanently erase all associated shift assignments, version history snapshots, share links, and publish logs. It will be removed from the schedule switcher and all clinic reports.
              </p>
            </div>
          </div>

          {/* Explicit Verification Checkbox */}
          <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={isDeleting}
              className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
            />
            <span className="text-slate-800 text-xs font-medium leading-relaxed">
              I confirm that I want to permanently delete schedule &ldquo;{schedule.name}&rdquo; and all of its associated shifts and history.
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 border border-slate-300 hover:bg-white text-slate-700 rounded-lg font-medium cursor-pointer transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={!confirmed || isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Deleting Schedule...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Permanently Delete Schedule</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
