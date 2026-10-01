/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Email Dispatch API
 * Dispatches test emails, roster publication announcements, individual shift notices,
 * and shift change alerts.
 */

import { Router, Request, Response } from 'express';
import { getServerRepository } from '../db/index';
import { requirePlanner } from '../middleware/auth';
import { EmailService, isGoogleAccountEmail } from '../services/email/emailService';
import {
  renderBroadcastTemplate,
  renderPersonalShiftNoticeTemplate,
  renderShiftChangeAlertTemplate,
  NurseShiftItem,
  DiffRowItem,
} from '../services/email/emailTemplates';
import { computeScheduleDiff } from '../../src/services/history/diffEngine';
import { DutyWindow, Doctor, ClinicalRole, Specialty, Assignment } from '../../src/types';

export const emailRouter = Router();

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * POST /api/email/test
 * Dispatches a test email exclusively via Google (SMTP or Mock mode)
 */
emailRouter.post('/email/test', async (req: Request, res: Response) => {
  try {
    const {
      to = 'rolandabj@gmail.com',
      provider = 'GOOGLE',
      config,
      subject: reqSubject,
      html: reqHtml,
      scheduleId,
      nurseId,
      versionId,
    } = req.body;
    const repo = getServerRepository();

    if (!isGoogleAccountEmail(to)) {
      res.status(400).json({
        error: 'InvalidRecipient',
        message: `Recipient email "${to}" must be a valid Google account (@gmail.com or Google Workspace).`,
      });
      return;
    }

    const effectiveProvider = provider === 'MOCK' ? 'MOCK' : 'GOOGLE';
    const subject = reqSubject || `[Test] Clinic Roster Google Email Dispatch (${effectiveProvider})`;
    const html = reqHtml || `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0284c7; margin-top: 0;">Clinic Roster Google Email Test</h2>
        <p>This is an automated test verifying that transactional email dispatching is working as expected via Google.</p>
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 13px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Provider:</strong> Google (${effectiveProvider})</p>
          <p style="margin: 4px 0;"><strong>Recipient:</strong> ${to}</p>
          <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        </div>
        <p style="color: #64748b; font-size: 12px;">ClinicRoster Operational Dispatch System</p>
      </div>
    `;

    const result = await EmailService.send(
      {
        to,
        subject,
        html,
        scheduleId,
        nurseId,
        versionId,
        config: { provider: effectiveProvider, ...(config || {}) },
      },
      repo,
      req.user?.name || 'Administrator'
    );

    res.json({ status: 'ok', data: result });
  } catch (err: any) {
    console.error('[EmailAPI] POST /api/email/test error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/email/send-roster
 * Dispatches published roster notifications to nursing staff
 * Guarded: Requires Planner or Owner role
 */
emailRouter.post('/email/send-roster', requirePlanner, async (req: Request, res: Response) => {
  try {
    const {
      scheduleId,
      versionId,
      targetNurseIds,
      isChangeAlert = false,
      note,
      type = 'PERSONAL_NOTICES', // 'PERSONAL_NOTICES' | 'BROADCAST'
    } = req.body;

    if (!scheduleId) {
      res.status(400).json({ error: 'BadRequest', message: 'scheduleId is required.' });
      return;
    }

    const repo = getServerRepository();

    // 1. Fetch relational entities
    const [
      schedule,
      allVersions,
      allAssignments,
      allNurses,
      allDutyWindows,
      allDoctors,
      allRoles,
      allSpecialties,
      allAcks,
      allClinics,
      allShareLinks,
    ] = await Promise.all([
      repo.get('schedules', scheduleId),
      repo.list('versions'),
      repo.list('assignments'),
      repo.list('nurses'),
      repo.list('dutyWindows'),
      repo.list('doctors'),
      repo.list('clinicalRoles'),
      repo.list('specialties'),
      repo.list('acknowledgments'),
      repo.list('clinics'),
      repo.list('shareLinks'),
    ]);

    if (!schedule) {
      res.status(404).json({ error: 'NotFound', message: `Schedule ${scheduleId} not found.` });
      return;
    }

    const clinic = allClinics[0] || { name: 'American Hospital Nad Al Sheba OutPatient clinic' };
    const dutyMap = new Map<string, DutyWindow>(allDutyWindows.map((d) => [d.id, d]));
    const doctorMap = new Map<string, Doctor>(allDoctors.map((d) => [d.id, d]));
    const roleMap = new Map<string, ClinicalRole>(allRoles.map((r) => [r.id, r]));
    const specialtyMap = new Map<string, Specialty>(allSpecialties.map((s) => [s.id, s]));

    // Find target version
    const scheduleVersions = allVersions
      .filter((v) => v.scheduleId === scheduleId)
      .sort((a, b) => b.number - a.number);

    let targetVersion = versionId ? scheduleVersions.find((v) => v.id === versionId) : scheduleVersions[0];
    if (!targetVersion && scheduleVersions.length > 0) {
      targetVersion = scheduleVersions[0];
    }

    const versionNumber = targetVersion?.number || schedule.activeVersionNumber || 1;
    const assignments: Assignment[] =
      targetVersion?.snapshot?.assignments ||
      allAssignments.filter((a) => a.scheduleId === scheduleId);

    // Filter target nurses: active with valid Google account
    let targetNurses = allNurses.filter((n) => n.active && isGoogleAccountEmail(n.gmail));
    if (Array.isArray(targetNurseIds) && targetNurseIds.length > 0) {
      targetNurses = targetNurses.filter((n) => targetNurseIds.includes(n.id));
    }

    const share = allShareLinks.find((s) => s.scheduleId === scheduleId && !s.revoked);
    const rosterUrl = share ? `/share/${share.token}` : undefined;

    const dispatchResults = [];

    // Mode A: BROADCAST
    if (type === 'BROADCAST') {
      const template = renderBroadcastTemplate({
        clinicName: clinic.name,
        scheduleName: schedule.name,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        versionNumber,
        totalShiftsCount: assignments.length,
        activeStaffCount: targetNurses.length,
        note,
        rosterUrl,
      });

      const emails = targetNurses.map((n) => n.gmail).filter(Boolean);
      if (emails.length > 0) {
        const sendRes = await EmailService.send(
          {
            to: emails,
            subject: template.subject,
            html: template.html,
            scheduleId,
            versionId: targetVersion?.id,
          },
          repo,
          req.user?.name || 'Authorized Planner'
        );
        dispatchResults.push(sendRes);
      }
    }
    // Mode B: Shift Change Alert
    else if (isChangeAlert && scheduleVersions.length > 1) {
      const currentVersion = targetVersion || scheduleVersions[0];
      const previousVersion = scheduleVersions.find((v) => v.number === currentVersion.number - 1) || scheduleVersions[1];

      const diff = computeScheduleDiff(
        previousVersion.snapshot.assignments,
        currentVersion.snapshot.assignments,
        allNurses,
        allDutyWindows,
        allDoctors,
        allRoles,
        allSpecialties,
        `Version ${previousVersion.number}`,
        `Version ${currentVersion.number}`,
        previousVersion.number,
        currentVersion.number
      );

      for (const nurse of targetNurses) {
        const nurseChanges = diff.changesByNurse[nurse.id] || [];
        if (nurseChanges.length === 0) continue;

        const diffRows: DiffRowItem[] = nurseChanges.map((c) => ({
          date: c.date,
          weekday: c.weekday,
          nurseName: nurse.fullName,
          changeType: c.changeType,
          description: c.description,
        }));

        const nurseAck = allAcks.find(
          (a) => a.scheduleId === scheduleId && a.nurseId === nurse.id && a.versionId === currentVersion.id
        );

        const template = renderShiftChangeAlertTemplate({
          clinicName: clinic.name,
          nurseName: nurse.fullName,
          scheduleName: schedule.name,
          baseVersion: previousVersion.number,
          targetVersion: currentVersion.number,
          diffRows,
          ackUrl: nurseAck ? `/ack/${nurseAck.token}` : undefined,
          rosterUrl,
          note,
        });

        const sendRes = await EmailService.send(
          {
            to: nurse.gmail,
            subject: template.subject,
            html: template.html,
            scheduleId,
            nurseId: nurse.id,
            versionId: currentVersion.id,
          },
          repo,
          req.user?.name || 'Authorized Planner'
        );
        dispatchResults.push(sendRes);
      }
    }
    // Mode C: PERSONAL_NOTICES (Default)
    else {
      for (const nurse of targetNurses) {
        const nurseAssignments = assignments
          .filter((a) => a.nurseId === nurse.id)
          .sort((a, b) => a.date.localeCompare(b.date));

        const shifts: NurseShiftItem[] = nurseAssignments.map((a) => {
          const duty = dutyMap.get(a.dutyWindowId) || {
            name: 'Shift Duty',
            acronym: 'D',
            startTime: '09:00',
            endTime: '17:00',
          };

          const dayOfWeek = WEEKDAYS[new Date(a.date).getUTCDay()];

          let assignmentLabel = 'General Duty';
          if (a.kind === 'DOCTOR' && a.doctorId) {
            const doc = doctorMap.get(a.doctorId);
            const specId = doc?.specialtyIds?.[0];
            const spec = specId ? specialtyMap.get(specId)?.name : '';
            assignmentLabel = doc ? `Dr. ${doc.fullName}${spec ? ` (${spec})` : ''}` : 'Clinic Doctor';
          } else if (a.kind === 'CLINICAL_ROLE' && a.clinicalRoleId) {
            const role = roleMap.get(a.clinicalRoleId);
            assignmentLabel = role ? role.name : 'Specialty Clinic';
          } else if (a.kind === 'SPECIALTY' && a.specialtyId) {
            const spec = specialtyMap.get(a.specialtyId);
            assignmentLabel = spec ? spec.name : 'Specialty Clinic';
          }

          return {
            date: a.date,
            weekday: dayOfWeek,
            dutyName: duty.name,
            dutyAcronym: duty.acronym,
            dutyTimes: `${duty.startTime} - ${duty.endTime}`,
            assignmentLabel,
            note: a.note,
          };
        });

        const nurseAck = allAcks.find(
          (a) => a.scheduleId === scheduleId && a.nurseId === nurse.id
        );

        const template = renderPersonalShiftNoticeTemplate({
          clinicName: clinic.name,
          nurseName: nurse.fullName,
          employeeCode: nurse.employeeCode,
          scheduleName: schedule.name,
          versionNumber,
          shifts,
          totalHoursEstimate: shifts.length * 8, // estimate
          ackUrl: nurseAck ? `/ack/${nurseAck.token}` : undefined,
          calendarUrl: nurseAck ? `/api/roster/calendar/${nurseAck.token}.ics` : undefined,
          note,
        });

        const sendRes = await EmailService.send(
          {
            to: nurse.gmail,
            subject: template.subject,
            html: template.html,
            scheduleId,
            nurseId: nurse.id,
            versionId: targetVersion?.id,
          },
          repo,
          req.user?.name || 'Authorized Planner'
        );

        dispatchResults.push(sendRes);
      }
    }

    res.json({
      status: 'ok',
      dispatchedCount: dispatchResults.length,
      data: dispatchResults,
    });
  } catch (err: any) {
    console.error('[EmailAPI] POST /api/email/send-roster error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});
