/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Delete Version Verification Modal
 * Provides safe, explicit confirmation before permanently deleting a roster version checkpoint.
 */

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Trash2,
  X,
  Calendar,
  Clock,
  User,
  ShieldAlert,
  Layers,
  Lock,
} from 'lucide-react';
import { ScheduleVersion } from '../../types';

interface DeleteVersionModalProps {
  isOpen: boolean;
  version: ScheduleVersion | null;
  scheduleName: string;
  isCurrentActiveDraft: boolean;
  isOnlyVersion?: boolean;
  onClose: () => void;
  onConfirmDelete: (version: ScheduleVersion) => Promise<void> | void;
  onDeleteScheduleInstead?: () => void;
}

export const DeleteVersionModal: React.FC<DeleteVersionModalProps> = ({
  isOpen,
  version,
  scheduleName,
  isCurrentActiveDraft,
  isOnlyVersion = false,
  onClose,
  onConfirmDelete,
  onDeleteScheduleInstead,
}) => {
  const [confirmed, setConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset confirmation state whenever modal opens or version changes
  useEffect(() => {
    if (isOpen) {
      setConfirmed(false);
      setIsDeleting(false);
    }
  }, [isOpen, version]);

  if (!isOpen || !version) return null;

  const assignmentCount = version.snapshot.assignments?.length || 0;
  const leaveCount = version.snapshot.leaveEntries?.length || 0;
  const lockCount = version.snapshot.locks?.length || 0;

  const handleDelete = async () => {
    if (!confirmed || isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirmDelete(version);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none animate-in fade-in duration-150">
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
                  Delete Version v{version.number}
                </h2>
                {version.isPublished && (
                  <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold font-mono text-[10px]">
                    PUBLISHED
                  </span>
                )}
                {isCurrentActiveDraft && (
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px]">
                    ACTIVE DRAFT
                  </span>
                )}
              </div>
              <p className="text-[11px] text-rose-800 mt-0.5 font-medium">
                Irreversible deletion verification prompt
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
            Are you sure you want to permanently delete this roster version checkpoint? This action cannot be undone.
          </p>

          {/* Version Snapshot Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2 text-xs">
            <div className="flex items-start justify-between gap-2 border-b border-slate-200/80 pb-2">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Checkpoint Note
                </span>
                <span className="font-semibold text-slate-900 text-xs">
                  {version.note || 'Manual save checkpoint'}
                </span>
              </div>
              <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[11px]">
                v{version.number}.0
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1">
              <div className="flex items-center gap-1.5 truncate">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{scheduleName}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{version.author}</span>
              </div>
              <div className="flex items-center gap-1.5 col-span-2 text-slate-500 font-mono text-[10px]">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Saved {new Date(version.timestamp).toLocaleString()}</span>
              </div>
            </div>

            {/* Records contained */}
            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] font-mono text-slate-600">
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-slate-400" />
                <strong>{assignmentCount}</strong> shifts
              </span>
              <span>
                <strong>{leaveCount}</strong> approved leaves
              </span>
              <span className="flex items-center gap-1 text-amber-700">
                <Lock className="w-3 h-3" />
                <strong>{lockCount}</strong> locks
              </span>
            </div>
          </div>

          {/* High Impact Warnings */}
          {version.isPublished && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-start gap-2.5 text-xs text-purple-900">
              <ShieldAlert className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
              <div className="leading-snug">
                <strong className="font-bold">Published Version Warning:</strong> This version was officially published. Deleting it may impact links and notification receipts referenced by clinical staff.
              </div>
            </div>
          )}

          {isCurrentActiveDraft && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="leading-snug">
                <strong className="font-bold">Active Draft Number:</strong> This version matches the schedule&apos;s current active version number. Deleting it will keep the active assignments intact but remove this checkpoint.
              </div>
            </div>
          )}

          {/* Irreversible Notice */}
          <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              Once deleted, this snapshot cannot be recovered, diffed against, or used as a restore point.
            </span>
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
              I understand this action is permanent and cannot be undone. Please permanently delete version checkpoint v{version.number}.
            </span>
          </label>

          {/* Option to delete entire schedule */}
          {onDeleteScheduleInstead && (
            <div className="p-3 bg-slate-100/90 border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-semibold text-slate-800 block">Looking to delete the entire schedule?</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  {isOnlyVersion
                    ? 'This is the only version checkpoint for this schedule.'
                    : 'Deletes the schedule roster period, all its shifts, and all versions.'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDeleteScheduleInstead();
                }}
                className="px-2.5 py-1.5 bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 font-semibold rounded-lg shrink-0 text-xs shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Delete Schedule</span>
              </button>
            </div>
          )}
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
                <span>Deleting Version...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Permanently Delete Version v{version.number}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
