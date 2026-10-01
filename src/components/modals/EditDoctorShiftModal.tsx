/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Edit Doctor Shift Modal
 * Allows manually editing doctor clinic shifts by clicking on any matrix cell,
 * including options to update a single-day override or modify a recurring weekly shift.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Calendar,
  MapPin,
  Stethoscope,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { Doctor, DoctorSession, Schedule, Specialty } from '../../types';
import {
  WEEKDAY_FULL_NAMES,
  getWeekdayFromIsoDate,
} from '../../services/schedule/doctorScheduleService';

export interface EditDoctorShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  doctor: Doctor | null;
  date: string; // YYYY-MM-DD
  existingSession: DoctorSession | null;
  specialties: Specialty[];
  schedule: Schedule | null;
  onSaveShift: (params: {
    doctorId: string;
    date: string;
    startTime: string;
    endTime: string;
    room: string;
    specialtyId: string;
    updateScope: 'THIS_DATE_ONLY' | 'RECURRING_ALL_MATCHING_DAYS';
  }) => Promise<void>;
  onDeleteShift: (params: {
    sessionId?: string;
    doctorId: string;
    date: string;
    deleteScope: 'THIS_DATE_ONLY' | 'REMOVE_RECURRING_PATTERN';
  }) => Promise<void>;
}

const TIME_PRESETS = [
  { label: 'Morning', start: '09:00', end: '13:00', desc: '4 hrs (09:00–13:00)' },
  { label: 'Afternoon', start: '13:00', end: '17:00', desc: '4 hrs (13:00–17:00)' },
  { label: 'Standard Day', start: '09:00', end: '17:00', desc: '8 hrs (09:00–17:00)' },
  { label: 'Evening', start: '17:00', end: '21:00', desc: '4 hrs (17:00–21:00)' },
  { label: 'Full Day', start: '09:00', end: '21:00', desc: '12 hrs (09:00–21:00)' },
];

const ROOM_PRESETS = [
  'Suite 101',
  'Suite 102',
  'Suite 103',
  'Clinic 1',
  'Clinic 2',
  'Consultation Room',
];

export const EditDoctorShiftModal: React.FC<EditDoctorShiftModalProps> = ({
  isOpen,
  onClose,
  doctor,
  date,
  existingSession,
  specialties,
  schedule,
  onSaveShift,
  onDeleteShift,
}) => {
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('13:00');
  const [room, setRoom] = useState<string>('Suite 101');
  const [specialtyId, setSpecialtyId] = useState<string>('');
  const [updateScope, setUpdateScope] = useState<'THIS_DATE_ONLY' | 'RECURRING_ALL_MATCHING_DAYS'>('THIS_DATE_ONLY');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteScope, setDeleteScope] = useState<'THIS_DATE_ONLY' | 'REMOVE_RECURRING_PATTERN'>('THIS_DATE_ONLY');

  const weekdayIndex = date ? getWeekdayFromIsoDate(date) : 0;
  const weekdayName = WEEKDAY_FULL_NAMES[weekdayIndex];

  // Check if doctor has a recurring pattern for this weekday
  const recurringPatternSlot = doctor?.weeklyPattern?.find((p) => p.weekday === weekdayIndex);
  const isExistingRecurring = existingSession?.source === 'PATTERN' || !!recurringPatternSlot;

  useEffect(() => {
    if (isOpen && doctor) {
      if (existingSession) {
        setStartTime(existingSession.startTime);
        setEndTime(existingSession.endTime);
        setRoom(existingSession.room || 'Suite 101');
        setSpecialtyId(existingSession.specialtyId || doctor.specialtyIds[0] || '');
        // If it was already a recurring pattern, default to showing the recurring option, but let user choose
        setUpdateScope(existingSession.source === 'PATTERN' ? 'RECURRING_ALL_MATCHING_DAYS' : 'THIS_DATE_ONLY');
      } else if (recurringPatternSlot) {
        setStartTime(recurringPatternSlot.startTime);
        setEndTime(recurringPatternSlot.endTime);
        setRoom(recurringPatternSlot.room || 'Suite 101');
        setSpecialtyId(doctor.specialtyIds[0] || (specialties[0]?.id ?? ''));
        setUpdateScope('RECURRING_ALL_MATCHING_DAYS');
      } else {
        setStartTime('09:00');
        setEndTime('13:00');
        setRoom('Suite 101');
        setSpecialtyId(doctor.specialtyIds[0] || (specialties[0]?.id ?? ''));
        setUpdateScope('THIS_DATE_ONLY');
      }
      setShowDeleteConfirm(false);
      setIsSaving(false);
      setIsDeleting(false);
    }
  }, [isOpen, doctor, date, existingSession, recurringPatternSlot, specialties]);

  if (!isOpen || !doctor || !date) return null;

  // Calculate duration in hours
  const calculateDuration = () => {
    try {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      return (diff / 60).toFixed(1);
    } catch {
      return '4.0';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startTime || !endTime) return;
    setIsSaving(true);
    try {
      await onSaveShift({
        doctorId: doctor.id,
        date,
        startTime,
        endTime,
        room: room.trim() || 'Suite 101',
        specialtyId: specialtyId || doctor.specialtyIds[0] || '',
        updateScope,
      });
      onClose();
    } catch (err: any) {
      console.error('Failed to save shift:', err);
      alert(`Failed to save doctor shift: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDeleteShift({
        sessionId: existingSession?.id,
        doctorId: doctor.id,
        date,
        deleteScope,
      });
      onClose();
    } catch (err: any) {
      console.error('Failed to delete shift:', err);
      alert(`Failed to remove shift: ${err.message || 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                <span>{existingSession ? 'Edit Doctor Shift' : 'Add Doctor Shift'}</span>
                {isExistingRecurring && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/30 border border-indigo-400/40 text-indigo-200">
                    Recurring Pattern
                  </span>
                )}
              </h2>
              <p className="text-xs text-indigo-200/80">
                {doctor.fullName} · {weekdayName}, {date}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
          {/* Status info bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between text-slate-700">
            <div>
              <span className="text-[11px] text-slate-500 block font-medium">Current Status on {date}:</span>
              <span className="font-semibold text-slate-800 text-xs">
                {existingSession
                  ? `${existingSession.startTime} – ${existingSession.endTime} (${existingSession.room || 'Suite 101'})`
                  : 'No shift scheduled'}
              </span>
            </div>
            <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              {calculateDuration()} hrs duration
            </span>
          </div>

          {/* Preset Shift Hours */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Quick Shift Presets
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {TIME_PRESETS.map((p) => {
                const isSelected = startTime === p.start && endTime === p.end;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setStartTime(p.start);
                      setEndTime(p.end);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold ring-1 ring-indigo-500'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-xs leading-none">{p.label}</div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5">{p.start}–{p.end}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Time inputs */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Start Time
              </label>
              <div className="relative">
                <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                End Time
              </label>
              <div className="relative">
                <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Room / Suite and Specialty */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Room / Clinic Suite
              </label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="e.g. Suite 101"
                  className="w-full pl-8 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {ROOM_PRESETS.slice(0, 4).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoom(r)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Clinical Specialty
              </label>
              <select
                value={specialtyId}
                onChange={(e) => setSpecialtyId(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {specialties.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name} ({sp.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Recurrence Scope Selector */}
          <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-3.5 space-y-2">
            <span className="block text-[11px] font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
              <span>Shift Scope &amp; Recurrence</span>
            </span>

            <div className="space-y-2">
              <label
                className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                  updateScope === 'THIS_DATE_ONLY'
                    ? 'bg-white border-indigo-500 shadow-2xs'
                    : 'bg-transparent border-transparent hover:bg-white/60'
                }`}
              >
                <input
                  type="radio"
                  name="updateScope"
                  value="THIS_DATE_ONLY"
                  checked={updateScope === 'THIS_DATE_ONLY'}
                  onChange={() => setUpdateScope('THIS_DATE_ONLY')}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-semibold text-slate-800 block text-xs">
                    This date only ({date})
                  </span>
                  <span className="text-[11px] text-slate-500 block leading-tight">
                    Apply change as an individual session override. Does not change other {weekdayName}s.
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                  updateScope === 'RECURRING_ALL_MATCHING_DAYS'
                    ? 'bg-white border-indigo-500 shadow-2xs'
                    : 'bg-transparent border-transparent hover:bg-white/60'
                }`}
              >
                <input
                  type="radio"
                  name="updateScope"
                  value="RECURRING_ALL_MATCHING_DAYS"
                  checked={updateScope === 'RECURRING_ALL_MATCHING_DAYS'}
                  onChange={() => setUpdateScope('RECURRING_ALL_MATCHING_DAYS')}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-semibold text-slate-800 block text-xs flex items-center gap-1.5">
                    <span>Update recurring pattern (Every {weekdayName})</span>
                    <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.2 rounded">
                      Recurrent
                    </span>
                  </span>
                  <span className="text-[11px] text-slate-500 block leading-tight">
                    Updates Dr. {doctor.fullName}&apos;s weekly pattern and syncs all {weekdayName} shifts across the entire schedule.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Delete confirmation section */}
          {showDeleteConfirm && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-900 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5 font-bold text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Confirm Shift Removal</span>
              </div>
              <p className="text-[11px] text-rose-700">
                Choose the removal scope for Dr. {doctor.fullName}&apos;s shift:
              </p>
              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="deleteScope"
                    value="THIS_DATE_ONLY"
                    checked={deleteScope === 'THIS_DATE_ONLY'}
                    onChange={() => setDeleteScope('THIS_DATE_ONLY')}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <span>Remove only on {date}</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="deleteScope"
                    value="REMOVE_RECURRING_PATTERN"
                    checked={deleteScope === 'REMOVE_RECURRING_PATTERN'}
                    onChange={() => setDeleteScope('REMOVE_RECURRING_PATTERN')}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <span>Remove recurring pattern (all {weekdayName}s)</span>
                </label>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? 'Removing...' : 'Confirm Remove'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <div>
              {existingSession && !showDeleteConfirm && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Shift</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save Shift'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
