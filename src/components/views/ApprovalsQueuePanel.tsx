/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Manager Approvals & Requests Queue Panel (Phase 4.2)
 * Provides 1-click decision making for Leave and Shift Availability requests.
 * Accessible by rolandabj@gmail.com and designated Clinical Managers / Charge Nurses.
 */

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  CalendarCheck,
  User,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  Sparkles,
  Shield,
  FileText,
} from 'lucide-react';
import { authService, UserProfile } from '../../services/auth/authService';
import { LeaveEntry, AvailabilityRequest, Nurse, LeaveType } from '../../types';

interface ApprovalsQueuePanelProps {
  currentUser?: UserProfile;
  onRequestDecided?: () => void;
}

export const ApprovalsQueuePanel: React.FC<ApprovalsQueuePanelProps> = ({
  currentUser,
  onRequestDecided,
}) => {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Decision Modal
  const [activeDecision, setActiveDecision] = useState<{
    kind: 'LEAVE' | 'AVAILABILITY';
    requestId: string;
    decision: 'APPROVED' | 'REJECTED';
    title: string;
  } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchPendingApprovals = async () => {
    setIsLoading(true);
    try {
      const token = authService.getToken();
      const res = await fetch('/api/approvals/pending', {
        headers: {
          Authorization: `Bearer ${token || 'local-owner'}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch pending approvals: HTTP ${res.status}`);
      }

      const json = await res.json();
      setLeaves(json.data?.leaveRequests || []);
      setAvailability(json.data?.availabilityRequests || []);
    } catch (err: any) {
      console.error('[ApprovalsQueuePanel] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingApprovals();
  }, []);

  const handleExecuteDecision = async () => {
    if (!activeDecision) return;
    setIsBusy(true);
    try {
      const token = authService.getToken();
      const res = await fetch('/api/approvals/decide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || 'local-owner'}`,
        },
        body: JSON.stringify({
          kind: activeDecision.kind,
          requestId: activeDecision.requestId,
          decision: activeDecision.decision,
          notes: decisionNotes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to submit decision.');

      triggerToast(
        `${activeDecision.kind === 'LEAVE' ? 'Leave' : 'Availability'} request ${activeDecision.decision.toLowerCase()} successfully.`
      );
      setActiveDecision(null);
      setDecisionNotes('');
      await fetchPendingApprovals();
      if (onRequestDecided) onRequestDecided();
    } catch (err: any) {
      alert(`Decision error: ${err.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const totalCount = leaves.length + availability.length;

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
      <div className="bg-slate-900 text-white p-5 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight">Manager Approvals &amp; Requests Queue</h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30">
                {totalCount} PENDING
              </span>
            </div>
            <p className="text-slate-300 text-[11px] mt-0.5 max-w-2xl">
              Review and act on clinical leave submissions, annual holidays, and nurse day-off availability preferences before roster generation.
            </p>
          </div>
        </div>

        <button
          onClick={fetchPendingApprovals}
          disabled={isLoading || isBusy}
          className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {totalCount === 0 && !isLoading ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm">All Requests Resolved!</h3>
          <p className="text-slate-500 text-xs max-w-md mx-auto">
            There are no pending staff leave or availability requests awaiting review. All current submissions have been approved or processed.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. LEAVE REQUESTS */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-600" />
                <span>Pending Leave Submissions ({leaves.length})</span>
              </h3>
              <span className="text-[11px] text-slate-500">
                Annual Leave, Sick Leave, Public Holidays &amp; Special Leave
              </span>
            </div>

            {leaves.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-[11px] italic bg-slate-50 rounded">
                No pending leave requests.
              </div>
            ) : (
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                      <th className="py-2.5 px-3">Nurse / Staff Member</th>
                      <th className="py-2.5 px-3">Leave Type</th>
                      <th className="py-2.5 px-3">Date Span</th>
                      <th className="py-2.5 px-3">Hours Credited</th>
                      <th className="py-2.5 px-3">Staff Note</th>
                      <th className="py-2.5 px-3 text-right">Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaves.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{l.nurseName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {l.nurseCode} · {l.nurseEmail}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-2xs"
                            style={{ backgroundColor: l.leaveTypeColor || '#3b82f6' }}
                          >
                            {l.leaveTypeName}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono font-medium text-slate-800">
                          {l.startDate} {l.startDate !== l.endDate ? `→ ${l.endDate}` : ''}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-700">
                          {l.hoursCredited || 8}h
                        </td>
                        <td className="py-3 px-3 text-slate-600 max-w-xs truncate">
                          {l.note || <span className="text-slate-400 italic">None provided</span>}
                        </td>
                        <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() =>
                              setActiveDecision({
                                kind: 'LEAVE',
                                requestId: l.id,
                                decision: 'APPROVED',
                                title: `Approve Leave for ${l.nurseName} (${l.startDate} to ${l.endDate})`,
                              })
                            }
                            disabled={isBusy}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() =>
                              setActiveDecision({
                                kind: 'LEAVE',
                                requestId: l.id,
                                decision: 'REJECTED',
                                title: `Reject Leave for ${l.nurseName} (${l.startDate} to ${l.endDate})`,
                              })
                            }
                            disabled={isBusy}
                            className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Decline</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 2. AVAILABILITY & DAY-OFF REQUESTS */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>Pending Availability &amp; Day-Off Requests ({availability.length})</span>
              </h3>
              <span className="text-[11px] text-slate-500">
                Preferred duty windows and requested days off
              </span>
            </div>

            {availability.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-[11px] italic bg-slate-50 rounded">
                No pending availability requests.
              </div>
            ) : (
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                      <th className="py-2.5 px-3">Nurse / Staff Member</th>
                      <th className="py-2.5 px-3">Target Date</th>
                      <th className="py-2.5 px-3">Requested Status</th>
                      <th className="py-2.5 px-3">Staff Reason / Note</th>
                      <th className="py-2.5 px-3 text-right">Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {availability.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{a.nurseName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {a.nurseCode} · {a.nurseEmail}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono font-medium text-slate-800">
                          {a.date}
                        </td>
                        <td className="py-3 px-3">
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
                        <td className="py-3 px-3 text-slate-600 max-w-xs truncate">
                          {a.note || <span className="text-slate-400 italic">None provided</span>}
                        </td>
                        <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() =>
                              setActiveDecision({
                                kind: 'AVAILABILITY',
                                requestId: a.id,
                                decision: 'APPROVED',
                                title: `Approve ${a.available ? 'Duty Preference' : 'Day Off'} for ${a.nurseName} on ${a.date}`,
                              })
                            }
                            disabled={isBusy}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() =>
                              setActiveDecision({
                                kind: 'AVAILABILITY',
                                requestId: a.id,
                                decision: 'REJECTED',
                                title: `Reject Request for ${a.nurseName} on ${a.date}`,
                              })
                            }
                            disabled={isBusy}
                            className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Decline</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Decision Modal */}
      {activeDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden text-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                {activeDecision.decision === 'APPROVED' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600" />
                )}
                <h3 className="font-bold text-slate-900 text-sm">
                  Confirm Decision: {activeDecision.decision}
                </h3>
              </div>
              <button
                onClick={() => setActiveDecision(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-slate-700 font-medium">{activeDecision.title}</p>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Manager Review Note (Optional)
                </label>
                <textarea
                  rows={3}
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder="e.g. Approved per department staffing quotas..."
                  className="w-full p-2.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDecision(null)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDecision}
                  disabled={isBusy}
                  className={`px-4 py-1.5 rounded font-bold text-white flex items-center gap-1.5 cursor-pointer shadow-xs ${
                    activeDecision.decision === 'APPROVED'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm {activeDecision.decision}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
