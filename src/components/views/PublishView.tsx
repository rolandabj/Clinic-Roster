/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Publish & Email Operations Center (Phase 13)
 * Status Grid, Acknowledgment Tracking, Email Audit Log with HTML Viewer & CSV Export.
 */

import React, { useState, useEffect } from 'react';
import {
  Send,
  MailCheck,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  User,
  ExternalLink,
  Copy,
  Clock,
  Mail,
  AlertTriangle,
  History,
  FileSpreadsheet,
  Download,
  Info,
  Check,
  Eye,
  RotateCcw,
  Bell,
  Search,
  Filter,
  Layers,
  Sparkles,
  X,
} from 'lucide-react';
import { ClinicContextState } from '../../types/navigation';
import { getRepository } from '../../services/repository';
import {
  Schedule,
  ScheduleVersion,
  Assignment,
  Nurse,
  DutyWindow,
  Doctor,
  DoctorSession,
  ClinicalRole,
  Specialty,
  SeniorityLevel,
  Rule,
  LeaveEntry,
  LeaveType,
  PublishLog,
  EmailRecipientLog,
  Acknowledgment,
  ShareLink,
} from '../../types';
import { PublishModal } from '../modals/PublishModal';
import { RosterPublishService } from '../../services/publish/rosterPublishService';

interface PublishViewProps {
  context: ClinicContextState;
}

type PublishTab = 'status' | 'email_log' | 'personal_links';

export const PublishView: React.FC<PublishViewProps> = ({ context }) => {
  const [activeTab, setActiveTab] = useState<PublishTab>('status');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [dutyWindows, setDutyWindows] = useState<DutyWindow[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [sessions, setSessions] = useState<DoctorSession[]>([]);
  const [roles, setClinicalRoles] = useState<ClinicalRole[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [seniorityLevels, setSeniorityLevels] = useState<SeniorityLevel[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [leaveEntries, setLeaveEntries] = useState<LeaveEntry[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [versions, setVersions] = useState<ScheduleVersion[]>([]);
  const [publishLogs, setPublishLogs] = useState<PublishLog[]>([]);
  const [acknowledgments, setAcknowledgments] = useState<Acknowledgment[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);

  // Wizard state
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<'PUBLISH' | 'CHANGE'>('PUBLISH');

  // Email Viewer Modal
  const [viewingEmailHtml, setViewingEmailHtml] = useState<{
    subject: string;
    recipientName: string;
    recipientEmail: string;
    html: string;
  } | null>(null);

  // Filters for Email Log
  const [logFilterKind, setLogFilterKind] = useState<string>('ALL');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  // Personal link generator
  const [selectedNurseForLink, setSelectedNurseForLink] = useState<Nurse | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const [notification, setNotification] = useState<string | null>(null);

  const repo = getRepository();

  const loadData = async () => {
    try {
      const [
        schedList,
        asgnList,
        nList,
        dwList,
        dList,
        sessList,
        crList,
        spList,
        sList,
        rList,
        leList,
        ltList,
        vList,
        plList,
        ackList,
        linkList,
      ] = await Promise.all([
        repo.list('schedules'),
        repo.list('assignments'),
        repo.list('nurses'),
        repo.list('dutyWindows'),
        repo.list('doctors'),
        repo.list('doctorSessions'),
        repo.list('clinicalRoles'),
        repo.list('specialties'),
        repo.list('seniorityLevels'),
        repo.list('rules'),
        repo.list('leaveEntries'),
        repo.list('leaveTypes'),
        repo.list('versions'),
        repo.list('emailLog'),
        repo.list('acknowledgments'),
        repo.list('shareLinks'),
      ]);

      const uniqueSchedules = Array.from(new Map(schedList.map((s) => [s.id, s])).values());
      setSchedules(uniqueSchedules);
      setDutyWindows(dwList);
      setDoctors(dList);
      setSessions(sessList);
      setClinicalRoles(crList);
      setSpecialties(spList);
      setSeniorityLevels(sList);
      setRules(rList);
      setLeaveEntries(leList);
      setLeaveTypes(ltList);
      setNurses(nList.filter((n) => n.active));
      setVersions(vList.sort((a, b) => b.number - a.number));
      setPublishLogs(plList.sort((a, b) => b.sentAt.localeCompare(a.sentAt)));
      setAcknowledgments(ackList);
      setShareLinks(linkList);

      const current =
        uniqueSchedules.find((s) => s.id === context.activeScheduleId) || uniqueSchedules[0];
      if (current) {
        setActiveSchedule(current);
        const schedAsgns = asgnList.filter((a) => a.scheduleId === current.id);
        setAssignments(schedAsgns);
        if (nList.length > 0) setSelectedNurseForLink(nList[0]);
      }
    } catch (err) {
      console.error('Error loading publish view:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // --- ACKNOWLEDGMENT HELPERS ---
  const getLatestAckForNurse = (nurseId: string) => {
    if (!activeSchedule) return null;
    const acks = acknowledgments.filter(
      (a) => a.scheduleId === activeSchedule.id && a.nurseId === nurseId
    );
    if (acks.length === 0) return null;
    acks.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    return acks[0];
  };

  // Simulate / test acknowledging on behalf of nurse
  const handleSimulateAcknowledge = async (nurseId: string) => {
    const ack = getLatestAckForNurse(nurseId);
    if (ack) {
      await repo.update('acknowledgments', ack.id, {
        ackAt: new Date().toISOString(),
      });
      triggerToast('Acknowledged successfully!');
      loadData();
    } else {
      triggerToast('No active published transmission found for this nurse. Publish schedule first.');
    }
  };

  // Send Reminder to unacknowledged nurse
  const handleSendReminder = async (nurse: Nurse) => {
    if (!activeSchedule) return;
    try {
      const nowIso = new Date().toISOString();
      const newAck: Acknowledgment = {
        id: `ack-remind-${Date.now()}`,
        scheduleId: activeSchedule.id,
        nurseId: nurse.id,
        versionId: `v${activeSchedule.activeVersionNumber || 1}`,
        token: Math.random().toString(36).substring(2, 10),
        sentAt: nowIso,
      };

      await repo.create('acknowledgments', newAck);

      // Log in email log
      await repo.create('emailLog', {
        id: `remind-${Date.now()}`,
        scheduleId: activeSchedule.id,
        versionId: `v${activeSchedule.activeVersionNumber || 1}`,
        kind: 'CHANGE',
        recipients: [
          {
            email: nurse.gmail,
            nurseId: nurse.id,
            nurseName: nurse.fullName,
            subject: `REMINDER: Please acknowledge your duty roster — ${activeSchedule.name}`,
            bodyPreview: `Reminder notification dispatched to ${nurse.fullName}.`,
            fullBodyHtml: `<p>Dear ${nurse.fullName}, please confirm receipt of your roster.</p>`,
            status: 'MOCK_SENT',
          },
        ],
        status: 'MOCK_SENT',
        sentAt: nowIso,
      });

      triggerToast(`Reminder dispatched to ${nurse.fullName} (${nurse.gmail})`);
      loadData();
    } catch (err: any) {
      alert(`Reminder failed: ${err.message}`);
    }
  };

  // Generate Personalized Read-Only Link
  const handleGeneratePersonalLink = () => {
    if (!selectedNurseForLink || !activeSchedule) return;
    const origin = window.location.origin;
    const targetLink = shareLinks.find((l) => l.scheduleId === activeSchedule.id && !l.revoked);
    const token = targetLink?.token || 'preview';
    const link = `${origin}/#published?token=${token}&nurse=${selectedNurseForLink.id}`;
    setGeneratedLink(link);
    triggerToast('Generated personal secure link.');
  };

  // Export Recipients CSV
  const handleExportRecipientsCsv = () => {
    if (!activeSchedule) return;
    const rows = [
      ['Nurse Name', 'Employee Code', 'Gmail', 'Delivery Status', 'Dispatch Timestamp', 'Acknowledged Timestamp'],
    ];

    nurses.forEach((nurse) => {
      const ack = getLatestAckForNurse(nurse.id);
      rows.push([
        nurse.fullName,
        nurse.employeeCode,
        nurse.gmail,
        ack ? 'DISPATCHED' : 'NOT PUBLISHED',
        ack ? new Date(ack.sentAt).toLocaleString() : 'N/A',
        ack?.ackAt ? new Date(ack.ackAt).toLocaleString() : 'PENDING',
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeSchedule.name}_acknowledgments.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Resend specific recipient email
  const handleResendRecipient = async (rec: EmailRecipientLog) => {
    triggerToast(`Email re-sent to ${rec.nurseName} (${rec.email}).`);
  };

  // Flat transmissions list for Email Log
  const allTransmissions = publishLogs.flatMap((log) =>
    log.recipients.map((rec) => ({
      ...rec,
      kind: log.kind,
      versionId: log.versionId,
      sentAt: log.sentAt,
      logId: log.id,
    }))
  );

  const filteredTransmissions = allTransmissions.filter((item) => {
    if (logFilterKind !== 'ALL' && item.kind !== logFilterKind) return false;
    if (
      logSearchQuery &&
      !item.nurseName.toLowerCase().includes(logSearchQuery.toLowerCase()) &&
      !item.email.toLowerCase().includes(logSearchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // Calculate Acknowledgment stats
  const totalNurses = nurses.length;
  const acknowledgedCount = nurses.filter((n) => {
    const ack = getLatestAckForNurse(n.id);
    return ack && ack.ackAt;
  }).length;
  const ackPercentage = totalNurses > 0 ? Math.round((acknowledgedCount / totalNurses) * 100) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-none font-sans text-slate-800">
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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Publish &amp; Email Notifications
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Dispatches personalized rosters, tracks digital shift acknowledgments, and logs delivery audits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setWizardMode('CHANGE');
              setIsPublishModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
            title="Send change alerts highlighting individual shift modifications"
          >
            <History className="w-3.5 h-3.5 text-indigo-600" />
            <span>Send Change Alerts</span>
          </button>

          <button
            onClick={() => {
              setWizardMode('PUBLISH');
              setIsPublishModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Publish Official Roster</span>
          </button>
        </div>
      </div>

      {/* Schedule Info & Status Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              {activeSchedule?.name || context.activeScheduleName}
            </h2>
            <span
              className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                activeSchedule?.status === 'PUBLISHED'
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              STATUS: {activeSchedule?.status || 'DRAFT'} v{activeSchedule?.activeVersionNumber || 1}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">
            {activeSchedule?.startDate} to {activeSchedule?.endDate} · {assignments.length} total assignments · {nurses.length} active staff
          </p>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="text-center px-3 py-1 bg-slate-50 border border-slate-200 rounded">
            <div className="font-bold text-slate-900">{totalNurses}</div>
            <div className="text-[10px] text-slate-400">Total Staff</div>
          </div>
          <div className="text-center px-3 py-1 bg-emerald-50 border border-emerald-200 rounded text-emerald-900">
            <div className="font-bold">{acknowledgedCount} / {totalNurses}</div>
            <div className="text-[10px] text-emerald-700">Acknowledged ({ackPercentage}%)</div>
          </div>
          <div className="text-center px-3 py-1 bg-indigo-50 border border-indigo-200 rounded text-indigo-900">
            <div className="font-bold">{publishLogs.length}</div>
            <div className="text-[10px] text-indigo-700">Broadcasts</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200 flex items-center gap-6 bg-white px-2 text-xs">
        <button
          onClick={() => setActiveTab('status')}
          className={`py-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 cursor-pointer ${
            activeTab === 'status'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MailCheck className="w-4 h-4" />
          <span>Staff Acknowledgment Grid ({acknowledgedCount}/{totalNurses})</span>
        </button>

        <button
          onClick={() => setActiveTab('email_log')}
          className={`py-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 cursor-pointer ${
            activeTab === 'email_log'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Email Audit Ledger ({allTransmissions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('personal_links')}
          className={`py-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 cursor-pointer ${
            activeTab === 'personal_links'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ExternalLink className="w-4 h-4" />
          <span>Personal Read-Only Links</span>
        </button>
      </div>

      {/* --- TAB 1: ACKNOWLEDGMENT GRID --- */}
      {activeTab === 'status' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Staff Roster Receipt Verification</h3>
              <p className="text-xs text-slate-500">
                Live compliance grid tracking which nurses have opened and acknowledged their official duty timetable.
              </p>
            </div>

            <button
              onClick={handleExportRecipientsCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export Receipts CSV</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-600 font-mono text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Nursing Staff</th>
                  <th className="py-2.5 px-3">Gmail Address</th>
                  <th className="py-2.5 px-3">Dispatched Version</th>
                  <th className="py-2.5 px-3">Dispatch Date</th>
                  <th className="py-2.5 px-3">Digital Acknowledgment</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {nurses.map((nurse) => {
                  const ack = getLatestAckForNurse(nurse.id);
                  const isAcked = !!ack?.ackAt;

                  return (
                    <tr key={nurse.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{nurse.fullName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{nurse.employeeCode}</div>
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-700 text-[11px]">
                        {nurse.gmail}
                      </td>

                      <td className="py-3 px-3 font-mono text-[11px]">
                        {ack ? (
                          <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200">
                            {ack.versionId}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                        {ack ? new Date(ack.sentAt).toLocaleString() : 'Not Dispatched'}
                      </td>

                      <td className="py-3 px-3">
                        {isAcked ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>ACKNOWLEDGED {new Date(ack!.ackAt!).toLocaleDateString()}</span>
                          </div>
                        ) : ack ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>PENDING RECEIPT</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Awaiting First Publish</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isAcked && ack && (
                            <>
                              <button
                                onClick={() => handleSendReminder(nurse)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-semibold cursor-pointer"
                                title="Send reminder notification to this staff member"
                              >
                                <Bell className="w-3 h-3 text-amber-600" />
                                <span>Remind</span>
                              </button>

                              <button
                                onClick={() => handleSimulateAcknowledge(nurse.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 rounded text-[11px] font-semibold cursor-pointer"
                                title="Acknowledge receipt on behalf of staff (or test simulation)"
                              >
                                <Check className="w-3 h-3" />
                                <span>Simulate Ack</span>
                              </button>
                            </>
                          )}

                          {isAcked && (
                            <span className="text-emerald-700 text-[11px] font-mono font-medium">
                              Verified ✓
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB 2: EMAIL AUDIT LEDGER --- */}
      {activeTab === 'email_log' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-3 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-slate-700">Kind:</span>
                <select
                  value={logFilterKind}
                  onChange={(e) => setLogFilterKind(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded bg-white font-medium"
                >
                  <option value="ALL">All Broadcasts</option>
                  <option value="PUBLISH">Official Publish</option>
                  <option value="CHANGE">Change Alert</option>
                </select>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="Search recipient or email..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 border border-slate-300 rounded text-xs w-56"
                />
              </div>
            </div>

            <div className="font-mono text-slate-500 text-[11px]">
              Showing {filteredTransmissions.length} of {allTransmissions.length} logged transmissions
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-600 font-mono text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Sent At</th>
                  <th className="py-2.5 px-3">Recipient Staff</th>
                  <th className="py-2.5 px-3">Gmail Address</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Subject / Body Snapshot</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredTransmissions.map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 text-slate-500 text-[10px]">
                      {new Date(log.sentAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 font-sans">
                      {log.nurseName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 text-[11px]">
                      {log.email}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          log.kind === 'CHANGE'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {log.kind}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans max-w-xs truncate text-slate-600 text-[11px]">
                      {log.subject}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold text-[10px] border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>{log.status}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-sans">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() =>
                            setViewingEmailHtml({
                              subject: log.subject,
                              recipientName: log.nurseName,
                              recipientEmail: log.email,
                              html: log.fullBodyHtml,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 border border-slate-300 hover:bg-slate-50 text-indigo-700 rounded text-[11px] font-semibold cursor-pointer"
                          title="View exact HTML payload sent to staff"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View HTML</span>
                        </button>

                        <button
                          onClick={() => handleResendRecipient(log)}
                          className="p-1 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded cursor-pointer"
                          title="Resend this transmission"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredTransmissions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 text-xs font-sans">
                      No matching email logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB 3: PERSONAL READ-ONLY LINKS --- */}
      {activeTab === 'personal_links' && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4 text-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <ExternalLink className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-slate-800 text-sm">Personal Staff View Links</h3>
          </div>

          <p className="text-slate-600 leading-relaxed text-[11px]">
            Generate direct links filtered specifically to an individual nurse. Nurses can bookmark this URL on mobile devices to view only their assigned duties.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedNurseForLink?.id || ''}
              onChange={(e) => {
                const n = nurses.find((x) => x.id === e.target.value);
                setSelectedNurseForLink(n || null);
                setGeneratedLink(null);
              }}
              className="px-3 py-1.5 border border-slate-300 rounded bg-white text-xs font-medium"
            >
              {nurses.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.fullName} ({n.gmail})
                </option>
              ))}
            </select>

            <button
              onClick={handleGeneratePersonalLink}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold cursor-pointer shadow-xs"
            >
              Generate Personal Link
            </button>
          </div>

          {generatedLink && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-slate-800 truncate select-all">
                {generatedLink}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedLink);
                  triggerToast('Link copied to clipboard.');
                }}
                className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-50 shrink-0 cursor-pointer text-xs font-semibold"
              >
                <Copy className="w-3 h-3 text-slate-500" />
                <span>Copy</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- PUBLISH WIZARD MODAL COMPONENT (Phase 13) --- */}
      {activeSchedule && (
        <PublishModal
          context={context}
          schedule={activeSchedule}
          assignments={assignments}
          nurses={nurses}
          dutyWindows={dutyWindows}
          doctors={doctors}
          sessions={sessions}
          roles={roles}
          specialties={specialties}
          seniorityLevels={seniorityLevels}
          rules={rules}
          leaveEntries={leaveEntries}
          leaveTypes={leaveTypes}
          versions={versions}
          isOpen={isPublishModalOpen}
          onClose={() => setIsPublishModalOpen(false)}
          onPublishComplete={() => {
            loadData();
            triggerToast('Official publish broadcast finalized.');
          }}
          initialMode={wizardMode}
        />
      )}

      {/* --- HTML EMAIL VIEWER MODAL --- */}
      {viewingEmailHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Dispatched HTML Email Snapshot</h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  To: {viewingEmailHtml.recipientName} ({viewingEmailHtml.recipientEmail})
                </p>
              </div>

              <button
                onClick={() => setViewingEmailHtml(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-100 flex-1 overflow-y-auto">
              <div
                className="bg-white border border-slate-200 rounded shadow-xs max-w-xl mx-auto overflow-hidden pointer-events-none select-text"
                dangerouslySetInnerHTML={{ __html: viewingEmailHtml.html }}
              />
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                onClick={() => setViewingEmailHtml(null)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded font-bold cursor-pointer"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
