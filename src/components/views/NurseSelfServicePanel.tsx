/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Nurse Self-Service Availability & Leave Interface (Phase 4.3)
 * Allows any nurse to view their personal leave schedule, submit new leave & day-off requests,
 * and monitor live approval statuses from clinical managers.
 */

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  CalendarCheck,
  Clock,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  Check,
  X,
  FileText,
  User,
  Heart,
  Droplets,
  Plane,
} from 'lucide-react';
import { authService, UserProfile } from '../../services/auth/authService';
import { LeaveEntry, AvailabilityRequest, LeaveType, Nurse, DutyWindow } from '../../types';

interface NurseSelfServicePanelProps {
  currentUser?: UserProfile;
  nurses?: Nurse[];
  leaveTypes?: LeaveType[];
  dutyWindows?: DutyWindow[];
  onDataChanged?: () => void;
}

export const NurseSelfServicePanel: React.FC<NurseSelfServicePanelProps> = ({
  currentUser,
  nurses = [],
  leaveTypes = [],
  dutyWindows = [],
  onDataChanged,
}) => {
  const [myLeaves, setMyLeaves] = useState<LeaveEntry[]>([]);
  const [myAvailability, setMyAvailability] = useState<AvailabilityRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Submit Request Modals
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isAvailModalOpen, setIsAvailModalOpen] = useState(false);

  // Leave Form
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id || 'leave-annual');
  const [leaveStartDate, setLeaveStartDate] = useState('2026-10-15');
  const [leaveEndDate, setLeaveEndDate] = useState('2026-10-18');
  const [leaveNote, setLeaveNote] = useState('');

  // Availability Form
  const [availDate, setAvailDate] = useState('2026-10-20');
  const [availIsAvailable, setAvailIsAvailable] = useState(false); // default to requesting day off
  const [availPreferredDutyId, setAvailPreferredDutyId] = useState('');
  const [availNote, setAvailNote] = useState('');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchMyData = async () => {
    setIsLoading(true);
    try {
      const token = authService.getToken();
      const [leaveRes, availRes] = await Promise.all([
        fetch('/api/leave/my', {
          headers: { Authorization: `Bearer ${token || 'local-staff'}` },
        }),
        fetch('/api/availability/my', {
          headers: { Authorization: `Bearer ${token || 'local-staff'}` },
        }),
      ]);

      if (leaveRes.ok) {
        const json = await leaveRes.json();
        setMyLeaves(json.data || []);
      }
      if (availRes.ok) {
        const json = await availRes.json();
        setMyAvailability(json.data || []);
      }
    } catch (err: any) {
      console.error('[NurseSelfService] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMyData();
  }, []);

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveStartDate || !leaveEndDate) return;
    setIsBusy(true);
    try {
      const token = authService.getToken();
      const res = await fetch('/api/leave/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || 'local-staff'}`,
        },
        body: JSON.stringify({
          leaveTypeId,
          startDate: leaveStartDate,
          endDate: leaveEndDate,
          note: leaveNote.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to submit leave request.');

      triggerToast('Leave request submitted successfully and is pending manager review.');
      setIsLeaveModalOpen(false);
      setLeaveNote('');
      await fetchMyData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      alert(`Leave submission error: ${err.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmitAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!availDate) return;
    setIsBusy(true);
    try {
      const token = authService.getToken();
      const res = await fetch('/api/availability/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || 'local-staff'}`,
        },
        body: JSON.stringify({
          date: availDate,
          available: availIsAvailable,
          preferredDutyWindowId: availPreferredDutyId || undefined,
          note: availNote.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to submit availability.');

      triggerToast(
        `${availIsAvailable ? 'Duty preference' : 'Day-off request'} submitted and pending review.`
      );
      setIsAvailModalOpen(false);
      setAvailNote('');
      await fetchMyData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      alert(`Availability submission error: ${err.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCancelLeave = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this pending leave request?')) return;
    setIsBusy(true);
    try {
      const token = authService.getToken();
      const res = await fetch(`/api/leave/request/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token || 'local-staff'}` },
      });
      if (!res.ok) throw new Error('Failed to cancel leave.');
      triggerToast('Leave request cancelled.');
      await fetchMyData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      alert(`Cancel error: ${err.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCancelAvailability = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this pending availability request?')) return;
    setIsBusy(true);
    try {
      const token = authService.getToken();
      const res = await fetch(`/api/availability/request/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token || 'local-staff'}` },
      });
      if (!res.ok) throw new Error('Failed to cancel request.');
      triggerToast('Availability request cancelled.');
      await fetchMyData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      alert(`Cancel error: ${err.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
            {currentUser?.name ? currentUser.name.charAt(0) : 'N'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                Staff Self-Service: {currentUser?.name || 'Nurse Portal'}
              </h2>
              {currentUser?.nurseCode && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-mono font-bold">
                  {currentUser.nurseCode}
                </span>
              )}
            </div>
            <p className="text-slate-600 text-[11px] mt-0.5 max-w-xl">
              Submit your upcoming annual leave, emergency time off, or preferred shift dates. Clinical managers will review and approve your submissions before the final schedule is published.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsAvailModalOpen(true)}
            className="px-3 py-1.5 rounded border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-700 font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Request Day Off</span>
          </button>
          <button
            onClick={() => setIsLeaveModalOpen(true)}
            className="px-3.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Request Leave</span>
          </button>
        </div>
      </div>

      {/* 1. MY SUBMITTED LEAVE REQUESTS */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
            <Plane className="w-4 h-4 text-indigo-600" />
            <span>My Leave Submissions ({myLeaves.length})</span>
          </h3>
          <span className="text-[11px] text-slate-500">Live Status &amp; Manager Decisions</span>
        </div>

        {myLeaves.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded">
            You haven't submitted any leave requests yet. Click "Request Leave" above to plan time off.
          </div>
        ) : (
          <div className="border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                  <th className="py-2.5 px-3">Leave Type</th>
                  <th className="py-2.5 px-3">Date Window</th>
                  <th className="py-2.5 px-3">Hours</th>
                  <th className="py-2.5 px-3">My Note</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Manager Feedback</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myLeaves.map((l) => {
                  const lt = leaveTypes.find((t) => t.id === l.leaveTypeId);
                  const isPending = l.status === 'PENDING' || (!l.approved && l.status !== 'REJECTED');
                  const isApproved = l.status === 'APPROVED' || l.approved === true;
                  const isRejected = l.status === 'REJECTED';

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-2xs"
                          style={{ backgroundColor: lt?.color || '#3b82f6' }}
                        >
                          {lt?.name || 'Leave'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                        {l.startDate} {l.startDate !== l.endDate ? `→ ${l.endDate}` : ''}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-700">
                        {l.hoursCredited || 8}h
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                        {l.note || <span className="text-slate-400 italic">None</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" />
                            <span>Pending Review ⏳</span>
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Approved ✓</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3" />
                            <span>Declined ✗</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {l.reviewedByUserName ? (
                          <div className="text-[11px]">
                            <span className="font-semibold text-slate-800">{l.reviewedByUserName}: </span>
                            <span>{l.reviewNotes || 'Decided'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Awaiting manager</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {isPending && (
                          <button
                            onClick={() => handleCancelLeave(l.id)}
                            disabled={isBusy}
                            className="text-rose-600 hover:text-rose-800 font-semibold cursor-pointer underline text-[11px]"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. MY AVAILABILITY & DAY-OFF PREFERENCES */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>My Shift Preferences &amp; Requested Days Off ({myAvailability.length})</span>
          </h3>
          <span className="text-[11px] text-slate-500">Scheduled Shifts &amp; Rest Days</span>
        </div>

        {myAvailability.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded">
            No shift preferences recorded. Click "Request Day Off" above if you need specific dates off.
          </div>
        ) : (
          <div className="border border-slate-200 rounded overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Requested Status</th>
                  <th className="py-2.5 px-3">My Reason / Note</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Manager Feedback</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {myAvailability.map((a) => {
                  const isPending = a.status === 'PENDING';
                  const isApproved = a.status === 'APPROVED';
                  const isRejected = a.status === 'REJECTED';

                  return (
                    <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-800">
                        {a.date}
                      </td>
                      <td className="py-2.5 px-3">
                        {a.available ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Available / Preferred Duty
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Requested Day OFF
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                        {a.note || <span className="text-slate-400 italic">None</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" />
                            <span>Pending Review ⏳</span>
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Approved ✓</span>
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3" />
                            <span>Declined ✗</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {a.reviewedByUserName ? (
                          <div className="text-[11px]">
                            <span className="font-semibold text-slate-800">{a.reviewedByUserName}: </span>
                            <span>{a.reviewNotes || 'Decided'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Awaiting manager</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {isPending && (
                          <button
                            onClick={() => handleCancelAvailability(a.id)}
                            disabled={isBusy}
                            className="text-rose-600 hover:text-rose-800 font-semibold cursor-pointer underline text-[11px]"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. REQUEST LEAVE MODAL */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden text-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Plane className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Request Time Off / Leave</h3>
              </div>
              <button
                onClick={() => setIsLeaveModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitLeave} className="p-5 space-y-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Leave Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={leaveTypeId}
                  onChange={(e) => setLeaveTypeId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs"
                >
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name} ({lt.acronym})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={leaveStartDate}
                    onChange={(e) => setLeaveStartDate(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    End Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={leaveEndDate}
                    onChange={(e) => setLeaveEndDate(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Reason / Submission Note
                </label>
                <textarea
                  rows={3}
                  value={leaveNote}
                  onChange={(e) => setLeaveNote(e.target.value)}
                  placeholder="e.g. Annual family vacation, medical appointment, etc."
                  className="w-full p-2.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Submit Leave Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. REQUEST DAY OFF / AVAILABILITY MODAL */}
      {isAvailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden text-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Shift Preference / Day-Off Request</h3>
              </div>
              <button
                onClick={() => setIsAvailModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAvailability} className="p-5 space-y-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Target Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={availDate}
                  onChange={(e) => setAvailDate(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Request Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAvailIsAvailable(false)}
                    className={`p-2.5 rounded border text-left cursor-pointer transition-colors ${
                      !availIsAvailable
                        ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-bold">Request Day OFF</span>
                    <span className="text-[10px] text-slate-500 block">Do not schedule on this day</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAvailIsAvailable(true)}
                    className={`p-2.5 rounded border text-left cursor-pointer transition-colors ${
                      availIsAvailable
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="block font-bold">Preferred Shift Duty</span>
                    <span className="text-[10px] text-slate-500 block">Available for specific window</span>
                  </button>
                </div>
              </div>

              {availIsAvailable && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Preferred Duty Window (Optional)
                  </label>
                  <select
                    value={availPreferredDutyId}
                    onChange={(e) => setAvailPreferredDutyId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs"
                  >
                    <option value="">-- Any Suitable Duty Window --</option>
                    {dutyWindows.map((dw) => (
                      <option key={dw.id} value={dw.id}>
                        {dw.name} ({dw.startTime} - {dw.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">Reason / Note</label>
                <textarea
                  rows={3}
                  value={availNote}
                  onChange={(e) => setAvailNote(e.target.value)}
                  placeholder="e.g. Personal appointment, university exam, etc."
                  className="w-full p-2.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAvailModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Submit Preference</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
