/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Roster Publishing, Personalized Email Generator & Dispatch Engine (Phase 13)
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Schedule,
  ScheduleVersion,
  Assignment,
  Nurse,
  DutyWindow,
  Doctor,
  ClinicalRole,
  Specialty,
  LeaveEntry,
  LeaveType,
  PublishLog,
  EmailRecipientLog,
  Acknowledgment,
  ShareLink,
} from '../../types';
import { EmailSettingsConfig, DEFAULT_EMAIL_SETTINGS } from '../../types/settings';
import { AssignmentDiffItem } from '../history/diffEngine';
import { getRepository } from '../repository';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface GenerateEmailPayloadParams {
  clinicName: string;
  schedule: Schedule;
  version: ScheduleVersion;
  nurse: Nurse;
  assignments: Assignment[];
  dutyWindows: DutyWindow[];
  doctors: Doctor[];
  roles: ClinicalRole[];
  specialties: Specialty[];
  leaveEntries: LeaveEntry[];
  leaveTypes: LeaveType[];
  changes?: AssignmentDiffItem[];
  generalNote?: string;
  shareToken?: string;
  ackToken: string;
  isChangeAlert?: boolean;
}

export interface DispatchResult {
  recipientLog: EmailRecipientLog;
  acknowledgment: Acknowledgment;
}

export class RosterPublishService {
  /**
   * Generates a beautiful, responsive, Gmail-compatible HTML email body for a nurse
   */
  public static generatePersonalEmailHtml(params: GenerateEmailPayloadParams): {
    subject: string;
    bodyPreview: string;
    html: string;
  } {
    const {
      clinicName,
      schedule,
      version,
      nurse,
      assignments,
      dutyWindows,
      doctors,
      roles,
      specialties,
      leaveEntries,
      leaveTypes,
      changes,
      generalNote,
      shareToken,
      ackToken,
      isChangeAlert,
    } = params;

    const dutyMap = new Map(dutyWindows.map((d) => [d.id, d]));
    const docMap = new Map(doctors.map((d) => [d.id, d]));
    const roleMap = new Map(roles.map((r) => [r.id, r]));
    const spMap = new Map(specialties.map((s) => [s.id, s]));
    const ltMap = new Map(leaveTypes.map((l) => [l.id, l]));

    const nurseAsgns = assignments
      .filter((a) => a.nurseId === nurse.id)
      .sort((a, b) => a.date.localeCompare(b.date));

    const nurseLeaves = leaveEntries
      .filter((le) => le.nurseId === nurse.id && le.approved)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    // Calculate hours summary
    let dutyHours = 0;
    for (const a of nurseAsgns) {
      const dw = dutyMap.get(a.dutyWindowId);
      if (dw) {
        const [sh, sm] = dw.startTime.split(':').map(Number);
        const [eh, em] = dw.endTime.split(':').map(Number);
        let mins = eh * 60 + em - (sh * 60 + sm);
        if (mins < 0) mins += 24 * 60;
        dutyHours += mins / 60;
      }
    }

    let leaveCreditedHours = 0;
    for (const le of nurseLeaves) {
      const lt = ltMap.get(le.leaveTypeId);
      if (lt && lt.countsTowardHoursTarget) {
        if (typeof lt.creditedHours === 'number') {
          leaveCreditedHours += lt.creditedHours;
        } else {
          leaveCreditedHours += 8;
        }
      }
    }

    const targetHours = Math.round((schedule.hoursTargetFullTime * (nurse.contractPercent || 100)) / 100);
    const totalEarnedHours = dutyHours + leaveCreditedHours;
    const variance = totalEarnedHours - targetHours;

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://clinicroster.app';
    const viewUrl = `${origin}/#published?token=${shareToken || 'active'}&nurse=${nurse.id}`;
    const ackUrl = `${origin}/#ack?token=${ackToken}`;

    const subject = isChangeAlert
      ? `Schedule updated — ${clinicName} (${schedule.name} v${version.number})`
      : `Your roster — ${clinicName} — ${schedule.name}`;

    const bodyPreview = isChangeAlert
      ? `Update notice: ${changes?.length || 0} change(s) applied to your schedule for ${schedule.name}.`
      : `Official duty roster for ${schedule.startDate} to ${schedule.endDate}. Total: ${totalEarnedHours}h.`;

    // Construct roster rows HTML
    const rowsHtml = nurseAsgns
      .map((a) => {
        const dw = dutyMap.get(a.dutyWindowId);
        const dObj = new Date(a.date);
        const weekday = WEEKDAY_NAMES[dObj.getUTCDay()];

        let target = 'General Pool';
        if (a.doctorId) target = docMap.get(a.doctorId)?.fullName || 'Doctor';
        else if (a.clinicalRoleId) target = roleMap.get(a.clinicalRoleId)?.name || 'Clinical Role';
        else if (a.specialtyId) target = spMap.get(a.specialtyId)?.name || 'Specialty';

        return `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 12px; font-family: monospace; font-size: 13px; color: #1e293b;">${a.date} (${weekday})</td>
            <td style="padding: 8px 12px;">
              <span style="display: inline-block; background-color: ${dw?.color || '#4f46e5'}; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px; font-family: monospace;">
                ${dw?.acronym || 'D'}
              </span>
              <span style="font-size: 12px; color: #334155; margin-left: 6px;">${dw?.startTime}–${dw?.endTime}</span>
            </td>
            <td style="padding: 8px 12px; font-size: 13px; color: #0f172a; font-weight: 500;">${target}</td>
          </tr>
        `;
      })
      .join('');

    // Construct change alert diff list
    let changesSectionHtml = '';
    if (isChangeAlert && changes && changes.length > 0) {
      const changeItemsHtml = changes
        .map(
          (c) => `
          <li style="margin-bottom: 6px; font-size: 13px; color: #991b1b;">
            <strong>${c.date} (${c.weekday}):</strong> ${c.description}
          </li>`
        )
        .join('');

      changesSectionHtml = `
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px;">
            ⚠️ Changes Specifically Affecting Your Schedule:
          </h4>
          <ul style="margin: 0; padding-left: 18px;">
            ${changeItemsHtml}
          </ul>
        </div>
      `;
    }

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; padding: 24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);" cellspacing="0" cellpadding="0" border="0">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #1e1b4b; padding: 24px 30px; border-bottom: 3px solid #6366f1;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">${clinicName}</h1>
                    <p style="margin: 4px 0 0 0; font-size: 13px; color: #c7d2fe;">Nursing Operations Department · Outpatient Services</p>
                  </td>
                  <td align="right">
                    <span style="background-color: #4338ca; color: #e0e7ff; font-family: monospace; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 4px;">
                      v${version.number} ${version.isPublished ? 'OFFICIAL' : 'DRAFT'}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 24px 30px;">
              <h2 style="margin: 0 0 12px 0; font-size: 16px; color: #0f172a;">Dear ${nurse.fullName},</h2>
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #475569;">
                ${
                  isChangeAlert
                    ? `An updated revision of the nursing duty schedule (<strong>${schedule.name}</strong>) has been published. Please review your personalized shift breakdown below.`
                    : `Your official nursing duty schedule for <strong>${schedule.name}</strong> (${schedule.startDate} to ${schedule.endDate}) has been finalized and published.`
                }
              </p>

              ${
                generalNote
                  ? `<div style="background-color: #f1f5f9; border-left: 4px solid #6366f1; padding: 10px 14px; margin-bottom: 20px; font-size: 13px; color: #334155; font-style: italic;">
                      "${generalNote}"
                    </div>`
                  : ''
              }

              ${changesSectionHtml}

              <!-- Hours Summary Stat Cards -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; text-align: center; width: 25%;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Contract Target</div>
                    <div style="font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 2px;">${targetHours}h</div>
                  </td>
                  <td style="width: 8px;"></td>
                  <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; text-align: center; width: 25%;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Duties Worked</div>
                    <div style="font-size: 18px; font-weight: 700; color: #4338ca; margin-top: 2px;">${dutyHours}h</div>
                  </td>
                  <td style="width: 8px;"></td>
                  <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; text-align: center; width: 25%;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Leave Credited</div>
                    <div style="font-size: 18px; font-weight: 700; color: #d97706; margin-top: 2px;">${leaveCreditedHours}h</div>
                  </td>
                  <td style="width: 8px;"></td>
                  <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; text-align: center; width: 25%;">
                    <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600;">Net Balance</div>
                    <div style="font-size: 18px; font-weight: 700; color: ${variance >= 0 ? '#15803d' : '#b91c1c'}; margin-top: 2px;">
                      ${variance >= 0 ? `+${variance}h` : `${variance}h`}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Shift Timetable -->
              <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">
                Your Assigned Clinical Shifts (${nurseAsgns.length} Days)
              </h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-bottom: 24px; text-align: left;">
                <thead>
                  <tr style="background-color: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
                    <th style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Date &amp; Day</th>
                    <th style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Duty Window</th>
                    <th style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Clinical Pairing</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="3" style="padding: 16px; text-align: center; color: #94a3b8;">No active duty shifts assigned for this period.</td></tr>'}
                </tbody>
              </table>

              <!-- Call to Actions -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 28px; margin-bottom: 12px;">
                <tr>
                  <td align="center">
                    <a href="${ackUrl}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 6px; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.3);">
                      ✓ Confirm Receipt &amp; Acknowledge Schedule
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 12px;">
                    <a href="${viewUrl}" style="font-size: 12px; color: #6366f1; text-decoration: underline;">
                      Open Live Personal Roster on Web / Mobile
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; line-height: 1.5; text-align: center;">
              <p style="margin: 0 0 6px 0;">This is an automated operational broadcast from ClinicRoster for <strong>${nurse.fullName}</strong> (${nurse.employeeCode}).</p>
              <p style="margin: 0;">Clinic Operations Office · ${clinicName} · Published on ${new Date(version.timestamp).toLocaleString()}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    return { subject, bodyPreview, html };
  }

  /**
   * Dispatches an individual nurse email payload using Google Email Dispatch (Mock Sandbox or Live Google SMTP)
   */
  public static async dispatchEmail(
    emailConfig: EmailSettingsConfig,
    recipientEmail: string,
    nurse: Nurse,
    subject: string,
    bodyPreview: string,
    fullBodyHtml: string,
    scheduleId: string,
    versionId: string,
    ackToken: string
  ): Promise<DispatchResult> {
    const ack: Acknowledgment = {
      id: uuidv4(),
      scheduleId,
      nurseId: nurse.id,
      versionId,
      token: ackToken,
      sentAt: new Date().toISOString(),
    };

    const recipientLog: EmailRecipientLog = {
      email: recipientEmail,
      nurseId: nurse.id,
      nurseName: nurse.fullName,
      subject,
      bodyPreview,
      fullBodyHtml,
      status: 'MOCK_SENT',
    };

    // Recipient email validation for Google accounts
    const isGoogle = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim().toLowerCase());
    if (!isGoogle) {
      recipientLog.status = 'FAILED';
      recipientLog.errorMessage = `Invalid recipient email address "${recipientEmail}". Must be a valid Google account.`;
      return { recipientLog, acknowledgment: ack };
    }

    // 1. Mock Mode (Default Safe Sandbox)
    if (emailConfig.mockMode || emailConfig.provider === 'MOCK') {
      recipientLog.status = 'MOCK_SENT';
      return { recipientLog, acknowledgment: ack };
    }

    // 2. Live Google Provider Dispatch via Server API
    try {
      const response = await fetch('/api/email/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: recipientEmail,
          provider: 'GOOGLE',
          subject,
          html: fullBodyHtml,
          scheduleId,
          nurseId: nurse.id,
          versionId,
          config: {
            ...emailConfig,
            provider: 'GOOGLE',
            mockMode: false,
          },
        }),
      });

      if (response.ok) {
        const json = await response.json();
        if (json.data?.status === 'SENT' || json.status === 'ok') {
          recipientLog.status = 'SENT';
        } else {
          recipientLog.status = json.data?.status || 'FAILED';
          recipientLog.errorMessage = json.data?.error || 'Dispatch error returned from server';
        }
      } else {
        const errJson = await response.json().catch(() => ({}));
        recipientLog.status = 'FAILED';
        recipientLog.errorMessage = errJson.message || `Server returned ${response.status}: ${response.statusText}`;
      }
    } catch (err: any) {
      console.warn('[rosterPublishService] Server Google dispatch network error:', err);
      recipientLog.status = 'FAILED';
      recipientLog.errorMessage = err.message || 'Network error during Google dispatch';
    }

    return { recipientLog, acknowledgment: ack };
  }

  /**
   * Process receipt confirmation / acknowledgment by token
   */
  public static async acknowledgeByToken(token: string): Promise<boolean> {
    const repo = getRepository();
    const acks = await repo.list('acknowledgments');
    const matched = acks.find((a) => a.token === token);
    if (!matched) return false;

    if (!matched.ackAt) {
      await repo.update('acknowledgments', matched.id, {
        ackAt: new Date().toISOString(),
      });
    }
    return true;
  }
}
