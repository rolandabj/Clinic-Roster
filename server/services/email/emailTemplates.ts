/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Responsive HTML Email Templates for Clinic Rostering
 * Gmail, Apple Mail, and Outlook compatible styling.
 */

export interface BroadcastTemplateParams {
  clinicName: string;
  scheduleName: string;
  startDate: string;
  endDate: string;
  versionNumber: number;
  totalShiftsCount: number;
  activeStaffCount: number;
  note?: string;
  rosterUrl?: string;
}

export interface NurseShiftItem {
  date: string;
  weekday: string;
  dutyName: string;
  dutyAcronym: string;
  dutyTimes: string;
  assignmentLabel: string;
  note?: string;
}

export interface PersonalNoticeTemplateParams {
  clinicName: string;
  nurseName: string;
  employeeCode: string;
  scheduleName: string;
  versionNumber: number;
  shifts: NurseShiftItem[];
  totalHoursEstimate: number;
  ackUrl?: string;
  calendarUrl?: string;
  note?: string;
}

export interface DiffRowItem {
  date: string;
  weekday: string;
  nurseName: string;
  changeType: 'ADDED' | 'REMOVED' | 'MODIFIED';
  beforeText?: string;
  afterText?: string;
  description: string;
}

export interface ShiftChangeAlertTemplateParams {
  clinicName: string;
  nurseName: string;
  scheduleName: string;
  baseVersion: number;
  targetVersion: number;
  diffRows: DiffRowItem[];
  ackUrl?: string;
  rosterUrl?: string;
  note?: string;
}

export interface ShiftSwapConfirmationTemplateParams {
  clinicName: string;
  nurseAName: string;
  dateA: string;
  shiftADescription: string;
  nurseBName: string;
  dateB: string;
  shiftBDescription: string;
  reason?: string;
  approvedAt: string;
  rosterUrl?: string;
}

export interface AcknowledgmentReminderTemplateParams {
  clinicName: string;
  nurseName: string;
  employeeCode: string;
  scheduleName: string;
  versionNumber: number;
  publishedDate: string;
  hoursElapsed: number;
  ackUrl: string;
  calendarUrl?: string;
  rosterUrl?: string;
}

const BASE_CONTAINER_STYLE = `
  max-width: 620px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: #1e293b;
  background-color: #ffffff;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
`;

const HEADER_STYLE = `
  background-color: #0f172a;
  color: #ffffff;
  padding: 24px 28px;
  text-align: left;
`;

const FOOTER_STYLE = `
  background-color: #f8fafc;
  padding: 20px 28px;
  font-size: 12px;
  color: #64748b;
  border-top: 1px solid #e2e8f0;
  text-align: center;
`;

const BUTTON_PRIMARY = `
  display: inline-block;
  background-color: #0284c7;
  color: #ffffff !important;
  font-weight: 600;
  text-decoration: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 14px;
  margin: 8px 4px 8px 0;
`;

const BUTTON_SECONDARY = `
  display: inline-block;
  background-color: #f1f5f9;
  color: #0f172a !important;
  font-weight: 600;
  text-decoration: none;
  padding: 12px 20px;
  border-radius: 6px;
  font-size: 14px;
  border: 1px solid #cbd5e1;
  margin: 8px 4px 8px 0;
`;

/**
 * 1. Official Roster Publication Broadcast Template
 */
export function renderBroadcastTemplate(params: BroadcastTemplateParams): { subject: string; html: string } {
  const subject = `[Published] ${params.clinicName} — Roster: ${params.scheduleName} (v${params.versionNumber})`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="background-color: #f1f5f9; padding: 24px 12px; margin: 0;">
        <div style="${BASE_CONTAINER_STYLE}">
          <div style="${HEADER_STYLE}">
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #38bdf8; margin-bottom: 4px;">
              ${params.clinicName}
            </div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">
              Official Roster Published: ${params.scheduleName}
            </h1>
          </div>
          <div style="padding: 28px;">
            <p style="font-size: 15px; line-height: 1.5; color: #334155; margin-top: 0;">
              The clinical schedule for <strong>${params.startDate}</strong> through <strong>${params.endDate}</strong> has been officially published (Version ${params.versionNumber}).
            </p>
            ${params.note ? `<div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 16px 0; border-radius: 4px; font-size: 14px; color: #1e3a8a;"><strong>Planner Note:</strong> ${params.note}</div>` : ''}
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b;">Schedule Window:</td>
                <td style="padding: 8px 0; font-weight: 600; text-align: right;">${params.startDate} to ${params.endDate}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b;">Version:</td>
                <td style="padding: 8px 0; font-weight: 600; text-align: right;">Version ${params.versionNumber}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; color: #64748b;">Total Shifts Allocated:</td>
                <td style="padding: 8px 0; font-weight: 600; text-align: right;">${params.totalShiftsCount} Shifts</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b;">Active Nursing Staff:</td>
                <td style="padding: 8px 0; font-weight: 600; text-align: right;">${params.activeStaffCount} Nurses</td>
              </tr>
            </table>

            <div style="margin-top: 28px;">
              ${params.rosterUrl ? `<a href="${params.rosterUrl}" style="${BUTTON_PRIMARY}">View Full Live Roster</a>` : ''}
            </div>
          </div>
          <div style="${FOOTER_STYLE}">
            This is an automated notification from ${params.clinicName} Duty Rostering System.<br />
            Please review your assigned duties. Report any critical scheduling conflicts to your Charge Nurse.
          </div>
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

/**
 * 2. Personal Nurse Shift Notice Template
 */
export function renderPersonalShiftNoticeTemplate(params: PersonalNoticeTemplateParams): { subject: string; html: string } {
  const subject = `Your Duty Roster: ${params.scheduleName} (v${params.versionNumber}) — ${params.nurseName}`;

  const shiftRowsHtml = params.shifts
    .map((s, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      return `
        <tr style="background-color: ${bg}; border-bottom: 1px solid #e2e8f0; font-size: 13px;">
          <td style="padding: 10px 12px; font-weight: 600; white-space: nowrap;">
            ${s.date} <span style="color: #64748b; font-weight: 400;">(${s.weekday})</span>
          </td>
          <td style="padding: 10px 12px;">
            <span style="display: inline-block; padding: 2px 6px; font-size: 11px; font-weight: 700; border-radius: 4px; background-color: #e0f2fe; color: #0369a1; margin-right: 4px;">
              ${s.dutyAcronym}
            </span>
            ${s.dutyName} (${s.dutyTimes})
          </td>
          <td style="padding: 10px 12px; color: #334155; font-weight: 500;">
            ${s.assignmentLabel}
            ${s.note ? `<div style="font-size: 11px; color: #64748b; font-style: italic;">${s.note}</div>` : ''}
          </td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="background-color: #f1f5f9; padding: 24px 12px; margin: 0;">
        <div style="${BASE_CONTAINER_STYLE}">
          <div style="${HEADER_STYLE}">
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #38bdf8; margin-bottom: 4px;">
              ${params.clinicName}
            </div>
            <h1 style="margin: 0; font-size: 19px; font-weight: 700; color: #ffffff;">
              Duty Assignment Notice
            </h1>
          </div>
          <div style="padding: 28px;">
            <p style="font-size: 15px; line-height: 1.5; color: #334155; margin-top: 0;">
              Hello <strong>${params.nurseName}</strong> (Code: ${params.employeeCode}),
            </p>
            <p style="font-size: 14px; line-height: 1.5; color: #475569;">
              Below are your assigned clinical shifts for <strong>${params.scheduleName}</strong> (Version ${params.versionNumber}).
              Total scheduled duty shifts: <strong>${params.shifts.length}</strong> (~${params.totalHoursEstimate} hours).
            </p>
            
            ${params.note ? `<div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 10px 14px; margin: 14px 0; border-radius: 4px; font-size: 13px; color: #1e3a8a;">${params.note}</div>` : ''}

            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;">
              <thead>
                <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-align: left; font-size: 12px; text-transform: uppercase; color: #475569; letter-spacing: 0.05em;">
                  <th style="padding: 10px 12px;">Date</th>
                  <th style="padding: 10px 12px;">Duty Shift</th>
                  <th style="padding: 10px 12px;">Room / Doctor</th>
                </tr>
              </thead>
              <tbody>
                ${shiftRowsHtml}
              </tbody>
            </table>

            <div style="margin-top: 24px;">
              ${params.ackUrl ? `<a href="${params.ackUrl}" style="${BUTTON_PRIMARY}">Acknowledge Receipt</a>` : ''}
              ${params.calendarUrl ? `<a href="${params.calendarUrl}" style="${BUTTON_SECONDARY}">Subscribe to Calendar (.ics)</a>` : ''}
            </div>
          </div>
          <div style="${FOOTER_STYLE}">
            Please confirm your shift schedule. Contact the nursing supervisor for any approved peer swaps.
          </div>
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

/**
 * 3. Shift Change Alert Template (with color-coded diff table)
 */
export function renderShiftChangeAlertTemplate(params: ShiftChangeAlertTemplateParams): { subject: string; html: string } {
  const subject = `[Action Required] Shift Change Notice: ${params.scheduleName} (v${params.targetVersion})`;

  const diffRowsHtml = params.diffRows
    .map((d, idx) => {
      let badgeBg = '#f1f5f9';
      let badgeColor = '#475569';
      let rowBg = '#ffffff';

      if (d.changeType === 'ADDED') {
        badgeBg = '#dcfce7';
        badgeColor = '#15803d';
        rowBg = '#f0fdf4';
      } else if (d.changeType === 'REMOVED') {
        badgeBg = '#fee2e2';
        badgeColor = '#b91c1c';
        rowBg = '#fef2f2';
      } else if (d.changeType === 'MODIFIED') {
        badgeBg = '#e0f2fe';
        badgeColor = '#0369a1';
        rowBg = '#f8fafc';
      }

      return `
        <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0; font-size: 13px;">
          <td style="padding: 10px 12px; font-weight: 600; white-space: nowrap;">
            ${d.date} <span style="color: #64748b; font-weight: 400;">(${d.weekday})</span>
          </td>
          <td style="padding: 10px 12px;">
            <span style="display: inline-block; padding: 2px 8px; font-size: 11px; font-weight: 700; border-radius: 4px; background-color: ${badgeBg}; color: ${badgeColor};">
              ${d.changeType}
            </span>
          </td>
          <td style="padding: 10px 12px; color: #334155;">
            ${d.description}
          </td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="background-color: #f1f5f9; padding: 24px 12px; margin: 0;">
        <div style="${BASE_CONTAINER_STYLE}">
          <div style="background-color: #b45309; color: #ffffff; padding: 24px 28px;">
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #fef3c7; margin-bottom: 4px;">
              ${params.clinicName}
            </div>
            <h1 style="margin: 0; font-size: 19px; font-weight: 700; color: #ffffff;">
              Shift Schedule Amendment Alert
            </h1>
          </div>
          <div style="padding: 28px;">
            <p style="font-size: 15px; line-height: 1.5; color: #334155; margin-top: 0;">
              Hello <strong>${params.nurseName}</strong>,
            </p>
            <p style="font-size: 14px; line-height: 1.5; color: #475569;">
              Your shifts in <strong>${params.scheduleName}</strong> have been revised from Version ${params.baseVersion} to <strong>Version ${params.targetVersion}</strong>.
            </p>

            ${params.note ? `<div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 10px 14px; margin: 14px 0; border-radius: 4px; font-size: 13px; color: #78350f;"><strong>Planner Note:</strong> ${params.note}</div>` : ''}

            <h3 style="font-size: 14px; text-transform: uppercase; color: #475569; letter-spacing: 0.05em; margin: 20px 0 10px 0;">
              Summary of Modifications
            </h3>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;">
              <thead>
                <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-align: left; font-size: 12px; text-transform: uppercase; color: #475569; letter-spacing: 0.05em;">
                  <th style="padding: 10px 12px;">Date</th>
                  <th style="padding: 10px 12px;">Type</th>
                  <th style="padding: 10px 12px;">Details</th>
                </tr>
              </thead>
              <tbody>
                ${diffRowsHtml}
              </tbody>
            </table>

            <div style="margin-top: 24px;">
              ${params.ackUrl ? `<a href="${params.ackUrl}" style="${BUTTON_PRIMARY}">Acknowledge Revised Schedule</a>` : ''}
              ${params.rosterUrl ? `<a href="${params.rosterUrl}" style="${BUTTON_SECONDARY}">View Live Roster</a>` : ''}
            </div>
          </div>
          <div style="${FOOTER_STYLE}">
            Please re-acknowledge your updated schedule to confirm acceptance of these roster amendments.
          </div>
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

/**
 * 4. Peer Shift Swap Confirmation Template
 */
export function renderShiftSwapConfirmationTemplate(params: ShiftSwapConfirmationTemplateParams): { subject: string; html: string } {
  const subject = `[Approved] Peer Shift Swap Confirmation: ${params.nurseAName} & ${params.nurseBName}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="background-color: #f1f5f9; padding: 24px 12px; margin: 0;">
        <div style="${BASE_CONTAINER_STYLE}">
          <div style="background-color: #065f46; color: #ffffff; padding: 24px 28px;">
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #a7f3d0; margin-bottom: 4px;">
              ${params.clinicName}
            </div>
            <h1 style="margin: 0; font-size: 19px; font-weight: 700; color: #ffffff;">
              Shift Swap Approved & Recorded
            </h1>
          </div>
          <div style="padding: 28px;">
            <p style="font-size: 15px; line-height: 1.5; color: #334155; margin-top: 0;">
              A peer shift swap between <strong>${params.nurseAName}</strong> and <strong>${params.nurseBName}</strong> has been formally approved and committed into the active clinic schedule.
            </p>

            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; font-size: 13px;">
              <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600; width: 35%;">${params.nurseAName} now works:</td>
                <td style="padding: 10px 14px; color: #065f46; font-weight: 600;">${params.dateB} (${params.shiftBDescription})</td>
              </tr>
              <tr style="background-color: #ffffff; border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 14px; font-weight: 600;">${params.nurseBName} now works:</td>
                <td style="padding: 10px 14px; color: #065f46; font-weight: 600;">${params.dateA} (${params.shiftADescription})</td>
              </tr>
              ${params.reason ? `
              <tr style="background-color: #f8fafc;">
                <td style="padding: 10px 14px; color: #64748b;">Reason for Swap:</td>
                <td style="padding: 10px 14px; font-style: italic;">${params.reason}</td>
              </tr>` : ''}
            </table>

            <div style="margin-top: 24px;">
              ${params.rosterUrl ? `<a href="${params.rosterUrl}" style="${BUTTON_PRIMARY}">View Live Active Roster</a>` : ''}
            </div>
          </div>
          <div style="${FOOTER_STYLE}">
            Approved on ${params.approvedAt}. Your personal calendar subscription feed has been updated automatically.
          </div>
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}

/**
 * 5. Shift Acknowledgment Reminder Notice
 * Dispatched automatically by the Acknowledgment Chaser job when staff have not
 * acknowledged their published roster shifts within the configured threshold (e.g. 48 hours).
 */
export function renderAcknowledgmentReminderTemplate(
  params: AcknowledgmentReminderTemplateParams
): { subject: string; html: string } {
  const subject = `[Action Required] Shift Acknowledgment Reminder: ${params.scheduleName} — ${params.clinicName}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8" /></head>
      <body style="background-color: #f1f5f9; padding: 24px 12px; margin: 0;">
        <div style="${BASE_CONTAINER_STYLE}">
          <div style="background-color: #b45309; color: #ffffff; padding: 24px 28px;">
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #fde68a; margin-bottom: 4px;">
              ${params.clinicName} — Compliance Reminder
            </div>
            <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">
              Action Required: Shift Acknowledgment Pending
            </h1>
          </div>
          <div style="padding: 28px;">
            <p style="font-size: 15px; line-height: 1.5; color: #334155; margin-top: 0;">
              Dear <strong>${params.nurseName}</strong> (${params.employeeCode}),
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
              Our records indicate that your assigned shifts for <strong>${params.scheduleName} (Version ${params.versionNumber})</strong> have not yet been formally acknowledged.
            </p>

            <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 18px; margin: 20px 0; border-radius: 0 6px 6px 0;">
              <div style="font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 4px;">
                Dispatch Notice Time:
              </div>
              <div style="font-size: 13px; color: #78350f;">
                Published on <strong>${params.publishedDate}</strong> (${params.hoursElapsed} hours elapsed).
              </div>
            </div>

            <p style="font-size: 14px; line-height: 1.5; color: #475569;">
              Please review your allocated clinic duty windows and confirm receipt by clicking the acknowledgment button below:
            </p>

            <div style="margin: 28px 0; text-align: center;">
              <a href="${params.ackUrl}" style="display: inline-block; background-color: #b45309; color: #ffffff !important; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                ✓ Acknowledge My Assigned Shifts
              </a>
            </div>

            ${params.calendarUrl || params.rosterUrl ? `
            <div style="margin-top: 24px; padding-top: 18px; border-top: 1px dashed #cbd5e1; font-size: 13px;">
              ${params.calendarUrl ? `
                <a href="${params.calendarUrl}" style="${BUTTON_SECONDARY}">
                  📅 Subscribe to Live Shift Calendar (.ics)
                </a>
              ` : ''}
              ${params.rosterUrl ? `
                <a href="${params.rosterUrl}" style="${BUTTON_SECONDARY}">
                  📋 View Full Clinic Roster
                </a>
              ` : ''}
            </div>` : ''}

            <p style="font-size: 12px; color: #64748b; margin-top: 24px; line-height: 1.5;">
              <strong>Clinical Governance Policy:</strong> Shift confirmation is required under clinic operational procedures to verify staffing readiness, prevent unexpected gaps, and ensure coverage for outpatient appointments.
            </p>
          </div>
          <div style="${FOOTER_STYLE}">
            This is an automated compliance notification from ${params.clinicName} Scheduling System.
          </div>
        </div>
      </body>
    </html>
  `;

  return { subject, html };
}
