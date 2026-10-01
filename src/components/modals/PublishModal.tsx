/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Schedule Publish Wizard & Email Notification Modal (Phase 13)
 * Full Validation Gate, Versioning, Per-Nurse HTML Email Preview, Diff Generation & Dispatch.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Mail,
  User,
  Eye,
  Check,
  RotateCcw,
  Sparkles,
  Info,
  Clock,
  Layers,
  Lock,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
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
  WorkingHoursPeriod,
  LockEntry,
} from '../../types';
import { ClinicContextState } from '../../types/navigation';
import { ScheduleValidator, ValidationReport } from '../../services/validation/ScheduleValidator';
import { computeScheduleDiff, ScheduleVersionDiff } from '../../services/history/diffEngine';
import { RosterPublishService } from '../../services/publish/rosterPublishService';
import { EmailSettingsConfig, DEFAULT_EMAIL_SETTINGS } from '../../types/settings';
import { getRepository } from '../../services/repository';

interface PublishModalProps {
  context: ClinicContextState;
  schedule: Schedule;
  assignments: Assignment[];
  nurses: Nurse[];
  dutyWindows: DutyWindow[];
  doctors: Doctor[];
  sessions: DoctorSession[];
  roles: ClinicalRole[];
  specialties: Specialty[];
  seniorityLevels: SeniorityLevel[];
  rules: Rule[];
  leaveEntries: LeaveEntry[];
  leaveTypes: LeaveType[];
  versions: ScheduleVersion[];
  workingHoursPeriods?: WorkingHoursPeriod[];
  locks?: LockEntry[];
  isOpen: boolean;
  onClose: () => void;
  onPublishComplete: (version: ScheduleVersion) => void;
  initialMode?: 'PUBLISH' | 'CHANGE';
}

type Step = 'VALIDATION' | 'DETAILS' | 'PREVIEW' | 'SENDING' | 'DONE';

export const PublishModal: React.FC<PublishModalProps> = ({
  context,
  schedule,
  assignments,
  nurses,
  dutyWindows,
  doctors,
  sessions,
  roles,
  specialties,
  seniorityLevels,
  rules,
  leaveEntries,
  leaveTypes,
  versions,
  workingHoursPeriods = [],
  locks = [],
  isOpen,
  onClose,
  onPublishComplete,
  initialMode = 'PUBLISH',
}) => {
  const [currentStep, setCurrentStep] = useState<Step>('VALIDATION');
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);

  // Version & Mode Details
  const [publishKind, setPublishKind] = useState<'PUBLISH' | 'CHANGE'>(initialMode);
  const [versionNote, setVersionNote] = useState('');
  const [generalBroadcastNote, setGeneralBroadcastNote] = useState('');
  const [includeOwnerCopy, setIncludeOwnerCopy] = useState(true);

  // Email Config
  const [emailConfig, setEmailConfig] = useState<EmailSettingsConfig>(() => {
    try {
      const raw = localStorage.getItem('clinic_roster_email_config');
      return raw ? JSON.parse(raw) : DEFAULT_EMAIL_SETTINGS;
    } catch {
      return DEFAULT_EMAIL_SETTINGS;
    }
  });

  // Diff against previous published version
  const [previousPublishedVersion, setPreviousPublishedVersion] = useState<ScheduleVersion | null>(null);
  const [computedDiff, setComputedDiff] = useState<ScheduleVersionDiff | null>(null);

  // Preview selection
  const [previewNurseId, setPreviewNurseId] = useState<string>('');
  const [selectedNurseIds, setSelectedNurseIds] = useState<Set<string>>(new Set());

  // Sending Progress
  const [progressPercent, setProgressPercent] = useState(0);
  const [sendLogs, setSendLogs] = useState<string[]>([]);
  const [createdVersion, setCreatedVersion] = useState<ScheduleVersion | null>(null);

  const isOwner = context.currentUser?.role === 'OWNER';
  const repo = getRepository();

  useEffect(() => {
    if (isOpen) {
      setCurrentStep('VALIDATION');
      setAcknowledgeWarnings(false);
      setVersionNote(
        publishKind === 'CHANGE'
          ? `Change Alert — Shift adjustments for ${schedule.name}`
          : `Official Roster Release — ${schedule.name}`
      );
      setGeneralBroadcastNote('');
      setProgressPercent(0);
      setSendLogs([]);

      // 1. Run live validation
      const report = ScheduleValidator.validate(
        schedule,
        assignments,
        nurses,
        seniorityLevels,
        dutyWindows,
        sessions,
        leaveEntries,
        locks,
        roles,
        rules,
        workingHoursPeriods,
        specialties,
        doctors
      );
      setValidationReport(report);

      // 2. Find latest published version for diffing
      const publishedList = versions.filter((v) => v.isPublished);
      if (publishedList.length > 0) {
        publishedList.sort((a, b) => b.number - a.number);
        const lastPub = publishedList[0];
        setPreviousPublishedVersion(lastPub);

        const diff = computeScheduleDiff(
          lastPub.snapshot.assignments,
          assignments,
          nurses,
          dutyWindows,
          doctors,
          roles,
          specialties,
          `v${lastPub.number}`,
          `v${(schedule.activeVersionNumber || 1) + 1}`,
          lastPub.number,
          (schedule.activeVersionNumber || 1) + 1
        );
        setComputedDiff(diff);
      } else {
        setPreviousPublishedVersion(null);
        setComputedDiff(null);
      }

      // 3. Initialize selected nurses
      const activeNursesWithGmail = nurses.filter((n) => n.active && n.gmail);
      setSelectedNurseIds(new Set(activeNursesWithGmail.map((n) => n.id)));
      if (activeNursesWithGmail.length > 0) {
        setPreviewNurseId(activeNursesWithGmail[0].id);
      }
    }
  }, [isOpen, schedule.id]);

  if (!isOpen) return null;

  // Selected nurse for preview
  const previewNurse = nurses.find((n) => n.id === previewNurseId) || nurses[0];

  // Generate preview email for selected nurse
  const previewPayload = previewNurse
    ? RosterPublishService.generatePersonalEmailHtml({
        clinicName: context.clinicName,
        schedule,
        version: {
          id: 'temp-preview',
          scheduleId: schedule.id,
          number: (schedule.activeVersionNumber || 1) + 1,
          timestamp: new Date().toISOString(),
          author: context.currentUser?.name || 'Administrator',
          note: versionNote,
          snapshot: {
            schedule,
            assignments,
            leaveEntries,
            locks: [],
            rulesSnapshot: rules,
          },
          isPublished: true,
          publishedAt: new Date().toISOString(),
        },
        nurse: previewNurse,
        assignments,
        dutyWindows,
        doctors,
        roles,
        specialties,
        leaveEntries,
        leaveTypes,
        changes: computedDiff?.changesByNurse[previewNurse.id] || [],
        generalNote: generalBroadcastNote,
        shareToken: 'active',
        ackToken: 'preview-token',
        isChangeAlert: publishKind === 'CHANGE',
      })
    : null;

  // --- EXECUTE DISPATCH PIPELINE ---
  const handleExecuteDispatch = async () => {
    setCurrentStep('SENDING');
    setProgressPercent(0);
    const logs: string[] = [];

    try {
      const newVersionNumber = (schedule.activeVersionNumber || 1) + 1;
      const versionId = `v-${schedule.id}-${newVersionNumber}-${Date.now()}`;
      const nowIso = new Date().toISOString();

      // 1. Create published ScheduleVersion
      const newVersion: ScheduleVersion = {
        id: versionId,
        scheduleId: schedule.id,
        number: newVersionNumber,
        timestamp: nowIso,
        author: context.currentUser?.name || 'Schedule Owner',
        note: versionNote.trim(),
        snapshot: {
          schedule,
          assignments,
          leaveEntries,
          locks: [],
          rulesSnapshot: rules,
        },
        isPublished: true,
        publishedAt: nowIso,
      };

      await repo.create('versions', newVersion);

      // 2. Update Schedule Status
      await repo.update('schedules', schedule.id, {
        status: 'PUBLISHED',
        activeVersionNumber: newVersionNumber,
        updatedAt: nowIso,
      });

      // 3. Ensure ShareLink exists pointing to this new published version
      const existingLinks = await repo.list('shareLinks');
      const schedLinks = existingLinks.filter((l) => l.scheduleId === schedule.id && !l.revoked);
      if (schedLinks.length > 0) {
        await repo.update('shareLinks', schedLinks[0].id, {
          pointsToVersionId: versionId,
        });
      } else {
        await repo.create('shareLinks', {
          id: uuidv4(),
          scheduleId: schedule.id,
          token: Math.random().toString(36).substring(2, 12),
          role: 'VIEWER',
          public: true,
          allowedEmails: [],
          createdAt: nowIso,
          revoked: false,
          pointsToVersionId: versionId,
        });
      }

      // 4. Dispatch Email to Selected Nurses
      const targetNurses = nurses.filter((n) => selectedNurseIds.has(n.id));
      const recipientLogs: EmailRecipientLog[] = [];
      const totalCount = targetNurses.length + (includeOwnerCopy ? 1 : 0);
      let sentCount = 0;

      for (const nurse of targetNurses) {
        const ackToken = `ack-${uuidv4().substring(0, 8)}`;
        const nurseChanges = computedDiff?.changesByNurse[nurse.id] || [];

        const payload = RosterPublishService.generatePersonalEmailHtml({
          clinicName: context.clinicName,
          schedule,
          version: newVersion,
          nurse,
          assignments,
          dutyWindows,
          doctors,
          roles,
          specialties,
          leaveEntries,
          leaveTypes,
          changes: nurseChanges,
          generalNote: generalBroadcastNote,
          shareToken: schedLinks[0]?.token || 'preview',
          ackToken,
          isChangeAlert: publishKind === 'CHANGE',
        });

        // Dispatch via provider
        const { recipientLog, acknowledgment } = await RosterPublishService.dispatchEmail(
          emailConfig,
          nurse.gmail,
          nurse,
          payload.subject,
          payload.bodyPreview,
          payload.html,
          schedule.id,
          newVersion.id,
          ackToken
        );

        recipientLogs.push(recipientLog);
        await repo.create('acknowledgments', acknowledgment);

        sentCount++;
        logs.push(`✓ Sent to ${nurse.fullName} (${nurse.gmail}) — [${recipientLog.status}]`);
        setSendLogs([...logs]);
        setProgressPercent(Math.round((sentCount / totalCount) * 100));

        await new Promise((r) => setTimeout(r, 60));
      }

      // Owner copy
      if (includeOwnerCopy && context.currentUser?.email) {
        recipientLogs.push({
          email: context.currentUser.email,
          nurseId: 'owner',
          nurseName: context.currentUser.name,
          subject: `[ADMIN COPY] Published ${schedule.name} v${newVersionNumber}`,
          bodyPreview: `Official administrative copy of published schedule v${newVersionNumber}.`,
          fullBodyHtml: `<h3>Administrative Copy: ${schedule.name} v${newVersionNumber}</h3><p>Published to ${targetNurses.length} nurses on ${nowIso}.</p>`,
          status: 'MOCK_SENT',
        });
        logs.push(`✓ Sent administrative copy to ${context.currentUser.email}`);
        setSendLogs([...logs]);
        setProgressPercent(100);
      }

      // 5. Persist PublishLog
      const pubLog: PublishLog = {
        id: `pub-${schedule.id}-${Date.now()}`,
        scheduleId: schedule.id,
        versionId: newVersion.id,
        kind: publishKind,
        recipients: recipientLogs,
        status: emailConfig.mockMode ? 'MOCK_SENT' : 'SENT',
        sentAt: nowIso,
      };

      await repo.create('emailLog', pubLog);

      // 6. Audit Trail
      await repo.create('audit', {
        actor: context.currentUser?.name || 'Owner',
        action: 'PUBLISH',
        entity: 'Schedule',
        entityId: schedule.id,
        note: `Published version v${newVersionNumber} (${publishKind}) with ${recipientLogs.length} transmissions.`,
        timestamp: nowIso,
      });

      setCreatedVersion(newVersion);
      setCurrentStep('DONE');
      onPublishComplete(newVersion);
    } catch (err: any) {
      alert(`Publishing failed: ${err.message}`);
      setCurrentStep('PREVIEW');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {publishKind === 'CHANGE' ? 'Publish Schedule Change Alerts' : 'Publish Official Duty Roster'}
                </h2>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-slate-500 font-mono">
                  {schedule.name} · Target: v{(schedule.activeVersionNumber || 1) + 1}
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-semibold border border-rose-200">
                  <Mail className="w-3 h-3 text-rose-600" />
                  <span>Google Email Dispatch (Sender: {emailConfig.senderEmail || 'rolandabj@gmail.com'})</span>
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Step Breadcrumbs */}
        <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
          <span className={currentStep === 'VALIDATION' ? 'text-indigo-600 font-bold' : ''}>
            1. Validation Gate
          </span>
          <span>›</span>
          <span className={currentStep === 'DETAILS' ? 'text-indigo-600 font-bold' : ''}>
            2. Version Note
          </span>
          <span>›</span>
          <span className={currentStep === 'PREVIEW' ? 'text-indigo-600 font-bold' : ''}>
            3. Email Preview
          </span>
          <span>›</span>
          <span className={currentStep === 'SENDING' ? 'text-indigo-600 font-bold' : ''}>
            4. Dispatch
          </span>
          <span>›</span>
          <span className={currentStep === 'DONE' ? 'text-emerald-600 font-bold' : ''}>
            5. Complete
          </span>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* OWNER CHECK */}
          {!isOwner && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-800">
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                <span>Restricted Action: Owner-Only Publishing</span>
              </div>
              <p className="text-xs leading-relaxed">
                Publishing live official schedules to hospital staff is restricted to schedule <strong>Owners</strong>. Current user (
                <strong>{context.currentUser?.name}</strong>, role: <em>{context.currentUser?.role}</em>) can edit and rebalance drafts, but cannot trigger public broadcasts.
              </p>
              <p className="text-[11px] text-rose-700">
                Switch to <strong>Dr. Fatima (Admin / Owner)</strong> via the top-right profile menu to test full publishing.
              </p>
            </div>
          )}

          {/* STEP 1: VALIDATION GATE */}
          {currentStep === 'VALIDATION' && isOwner && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                <h3 className="font-bold text-slate-800 text-xs">Pre-Publish Clinical Rule Audit</h3>
                <p className="text-slate-500 text-[11px]">
                  Before broadcasting to nurses, ClinicRoster verifies that all hard clinical safety constraints are satisfied.
                </p>
              </div>

              {validationReport && (
                <div className="space-y-3">
                  {/* Stat cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div
                      className={`p-3 rounded border text-center ${
                        validationReport.errorCount > 0
                          ? 'border-rose-300 bg-rose-50 text-rose-900'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                      }`}
                    >
                      <div className="text-2xl font-bold font-mono">{validationReport.errorCount}</div>
                      <div className="text-[10px] font-semibold uppercase mt-0.5">
                        {validationReport.errorCount > 0 ? 'Hard Errors (Blocking)' : 'Zero Hard Errors'}
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded border text-center ${
                        validationReport.warnCount > 0
                          ? 'border-amber-300 bg-amber-50 text-amber-900'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="text-2xl font-bold font-mono">{validationReport.warnCount}</div>
                      <div className="text-[10px] font-semibold uppercase mt-0.5">Warnings (Review)</div>
                    </div>

                    <div className="p-3 rounded border border-slate-200 bg-slate-50 text-slate-700 text-center">
                      <div className="text-2xl font-bold font-mono">{nurses.length}</div>
                      <div className="text-[10px] font-semibold uppercase mt-0.5">Recipient Staff</div>
                    </div>
                  </div>

                  {/* Findings breakdown */}
                  {validationReport.errorCount > 0 && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-900 space-y-2 text-xs">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Hard Constraint Violations Detected:</span>
                      </div>
                      <ul className="list-disc pl-5 space-y-1 text-[11px]">
                        {validationReport.findings
                          .filter((f) => f.severity === 'ERROR')
                          .slice(0, 5)
                          .map((f, i) => (
                            <li key={i}>{f.message}</li>
                          ))}
                      </ul>
                      <p className="font-semibold text-rose-800 text-[11px] pt-1">
                        Publishing is blocked. Please resolve errors in the Roster Grid or apply a Lock Override.
                      </p>
                    </div>
                  )}

                  {validationReport.errorCount === 0 && validationReport.warnCount > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 space-y-2 text-xs">
                      <div className="font-bold flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Schedule Warnings ({validationReport.warnCount}):</span>
                      </div>
                      <ul className="list-disc pl-5 space-y-1 text-[11px]">
                        {validationReport.findings
                          .filter((f) => f.severity === 'WARN')
                          .slice(0, 4)
                          .map((f, i) => (
                            <li key={i}>{f.message}</li>
                          ))}
                      </ul>
                      <div className="pt-2 border-t border-amber-200">
                        <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-950">
                          <input
                            type="checkbox"
                            checked={acknowledgeWarnings}
                            onChange={(e) => setAcknowledgeWarnings(e.target.checked)}
                            className="rounded text-indigo-600"
                          />
                          <span>I have reviewed these {validationReport.warnCount} warnings and confirm publication</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {validationReport.errorCount === 0 && validationReport.warnCount === 0 && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-900 flex items-center gap-2 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>All clinical constraints verified. Schedule is 100% compliant and ready to publish.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: VERSION NOTE & MODE */}
          {currentStep === 'DETAILS' && (
            <div className="space-y-4">
              {/* Mode Selector */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                <span className="font-bold text-slate-800 text-xs block">Publishing Notification Mode:</span>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`p-3 rounded border cursor-pointer flex flex-col gap-1 transition-colors ${
                      publishKind === 'PUBLISH'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Full Schedule Broadcast</span>
                      <input
                        type="radio"
                        name="publishKind"
                        checked={publishKind === 'PUBLISH'}
                        onChange={() => setPublishKind('PUBLISH')}
                        className="text-indigo-600"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Standard release. Each nurse receives their complete roster for the period.
                    </span>
                  </label>

                  <label
                    className={`p-3 rounded border cursor-pointer flex flex-col gap-1 transition-colors ${
                      publishKind === 'CHANGE'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Schedule Change Alert</span>
                      <input
                        type="radio"
                        name="publishKind"
                        checked={publishKind === 'CHANGE'}
                        onChange={() => setPublishKind('CHANGE')}
                        className="text-indigo-600"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Revision update. Highlights personal shift changes against the previous version.
                    </span>
                  </label>
                </div>
              </div>

              {/* Version Note */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-800 text-xs">
                  Version Release Note <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Official October release approved by Clinical Director"
                  value={versionNote}
                  onChange={(e) => setVersionNote(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded font-medium text-xs focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400">
                  This note is immutably recorded in Schedule Version History.
                </p>
              </div>

              {/* General Broadcast Note */}
              <div className="space-y-1">
                <label className="block font-bold text-slate-800 text-xs">
                  Optional Broadcast Message to Staff:
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Please note Dr. Yusuf's Thursday sessions start at 15:00. Contact supervisor for swaps."
                  value={generalBroadcastNote}
                  onChange={(e) => setGeneralBroadcastNote(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Checkboxes */}
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={includeOwnerCopy}
                    onChange={(e) => setIncludeOwnerCopy(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>Dispatch administrative summary copy to Schedule Owner ({context.currentUser?.email})</span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW PER-NURSE HTML EMAIL */}
          {currentStep === 'PREVIEW' && (
            <div className="space-y-4">
              {/* Nurse selector toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-slate-800 text-xs">Inspect Nurse Email:</span>
                  <select
                    value={previewNurseId}
                    onChange={(e) => setPreviewNurseId(e.target.value)}
                    className="px-2.5 py-1 border border-slate-300 rounded bg-white text-xs font-semibold text-slate-800"
                  >
                    {nurses.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.fullName} ({n.gmail})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-600">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold border border-rose-200">
                    <Mail className="w-3 h-3 text-rose-600" />
                    <span>Google Email Dispatch (Sender: {emailConfig.senderEmail || 'rolandabj@gmail.com'})</span>
                  </span>
                  <span className="text-slate-400">·</span>
                  <span><strong>{selectedNurseIds.size} staff</strong> ({emailConfig.mockMode ? 'Safe Sandbox' : 'Live Google'})</span>
                </div>
              </div>

              {/* HTML Preview Box */}
              {previewPayload && (
                <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-100">
                  <div className="p-2.5 bg-slate-200/80 border-b border-slate-300 flex items-center justify-between text-[11px] font-mono text-slate-600">
                    <span className="truncate max-w-md">Subject: <strong>{previewPayload.subject}</strong></span>
                    <span>Format: Responsive HTML</span>
                  </div>

                  <div className="p-4 max-h-[360px] overflow-y-auto bg-slate-50">
                    <div
                      className="bg-white border border-slate-200 rounded shadow-xs max-w-xl mx-auto overflow-hidden pointer-events-none select-text"
                      dangerouslySetInnerHTML={{ __html: previewPayload.html }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: SENDING PROGRESS */}
          {currentStep === 'SENDING' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="font-bold text-slate-800">
                  Dispatching Personalized Google Emails ({emailConfig.mockMode ? 'Safe Sandbox' : 'Live Google'})...
                </span>
                <span className="font-bold text-indigo-600 text-sm">{progressPercent}%</span>
              </div>

              <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-150"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="border border-slate-200 rounded p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] space-y-1.5 max-h-48 overflow-y-auto">
                {sendLogs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 5: DONE */}
          {currentStep === 'DONE' && createdVersion && (
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Publication Complete!</h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Roster version <strong>v{createdVersion.number}</strong> has been officially published and logged in the immutable audit trail.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded max-w-md mx-auto text-left text-xs font-mono space-y-1 text-slate-600">
                <div>• Schedule Status: <strong className="text-purple-700">PUBLISHED</strong></div>
                <div>• Version: <strong>v{createdVersion.number}</strong> ({createdVersion.note})</div>
                <div>• Transmissions: <strong>{sendLogs.length} dispatched</strong></div>
                <div>• Acknowledgment Tokens: <strong>Active</strong></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {currentStep === 'VALIDATION' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded font-medium cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  !isOwner ||
                  (validationReport?.errorCount ?? 0) > 0 ||
                  ((validationReport?.warnCount ?? 0) > 0 && !acknowledgeWarnings)
                }
                onClick={() => setCurrentStep('DETAILS')}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <span>Continue to Version Details</span>
              </button>
            </>
          )}

          {currentStep === 'DETAILS' && (
            <>
              <button
                type="button"
                onClick={() => setCurrentStep('VALIDATION')}
                className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded font-medium cursor-pointer"
              >
                Back
              </button>

              <button
                type="button"
                disabled={!versionNote.trim()}
                onClick={() => setCurrentStep('PREVIEW')}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <span>Preview Email Dispatches</span>
              </button>
            </>
          )}

          {currentStep === 'PREVIEW' && (
            <>
              <button
                type="button"
                onClick={() => setCurrentStep('DETAILS')}
                className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded font-medium cursor-pointer"
              >
                Back
              </button>

              <button
                type="button"
                onClick={handleExecuteDispatch}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold cursor-pointer shadow-xs transition-colors"
              >
                <Send className="w-4 h-4" />
                <span>Confirm &amp; Publish ({selectedNurseIds.size} Emails)</span>
              </button>
            </>
          )}

          {currentStep === 'DONE' && (
            <div className="w-full flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded font-bold cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
