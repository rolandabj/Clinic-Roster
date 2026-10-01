/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Dynamic RFC 5545 iCalendar Subscription Feed Generator
 * Generates live .ics feeds compatible with Google Calendar, Apple Calendar, and Outlook.
 */

import { Router, Request, Response } from 'express';
import { getServerRepository } from '../db/index';
import { Assignment, DutyWindow, Doctor, ClinicalRole, Specialty, Nurse } from '../../src/types';

export const calendarRouter = Router();

/**
 * Helper to escape text values for iCalendar RFC 5545
 */
function escapeIcalText(str: string): string {
  return (str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Format date string (YYYY-MM-DD) and time string (HH:mm) into iCal local format: YYYYMMDDTHHmm00
 */
function formatIcalDateTime(dateStr: string, timeStr: string = '09:00'): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = timeStr.replace(/:/g, '').padEnd(4, '0').slice(0, 4) + '00';
  return `${cleanDate}T${cleanTime}`;
}

/**
 * GET /api/roster/calendar/:token.ics
 * GET /api/roster/calendar/:token
 * Generates standard RFC 5545 text/calendar feed for a nurse's published shifts
 */
const handleCalendarFeed = async (req: Request, res: Response) => {
  try {
    const rawToken = req.params.token || '';
    // Strip trailing .ics if passed
    const token = rawToken.endsWith('.ics') ? rawToken.slice(0, -4) : rawToken;

    if (!token) {
      res.status(400).send('Invalid calendar token');
      return;
    }

    const repo = getServerRepository();

    // 1. Fetch relational collections in parallel
    const [
      allAcks,
      allNurses,
      allAssignments,
      allSchedules,
      allDutyWindows,
      allDoctors,
      allRoles,
      allSpecialties,
      allProfiles,
      allShareLinks,
    ] = await Promise.all([
      repo.list('acknowledgments'),
      repo.list('nurses'),
      repo.list('assignments'),
      repo.list('schedules'),
      repo.list('dutyWindows'),
      repo.list('doctors'),
      repo.list('clinicalRoles'),
      repo.list('specialties'),
      repo.list('clinics'),
      repo.list('shareLinks'),
    ]);

    const clinicProfile = allProfiles[0] || {
      name: 'Outpatient Clinic',
      timezone: 'Asia/Dubai',
      address: '',
    };
    const timezone = clinicProfile.timezone || 'Asia/Dubai';

    // 2. Resolve Nurse from token
    let targetNurse: Nurse | undefined;
    let targetScheduleId: string | undefined;

    // Check acknowledgments
    const matchedAck = allAcks.find((a) => a.token === token);
    if (matchedAck) {
      targetNurse = allNurses.find((n) => n.id === matchedAck.nurseId);
      targetScheduleId = matchedAck.scheduleId;
    }

    // Check nurse ID or email
    if (!targetNurse) {
      targetNurse = allNurses.find(
        (n) =>
          n.id === token ||
          n.gmail?.toLowerCase() === token.toLowerCase() ||
          (n as any).calendarToken === token
      );
    }

    // Check share link
    if (!targetNurse) {
      const share = allShareLinks.find((s) => s.token === token && !s.revoked);
      if (share) {
        targetScheduleId = share.scheduleId;
        // If nurseId query passed: ?nurseId=...
        const queryNurseId = req.query.nurseId as string;
        if (queryNurseId) {
          targetNurse = allNurses.find((n) => n.id === queryNurseId);
        }
      }
    }

    if (!targetNurse) {
      res.status(404).set('Content-Type', 'text/plain').send('Calendar feed not found: invalid subscription token.');
      return;
    }

    // 3. Find published schedules and assignments for this nurse
    const publishedScheduleIds = new Set(
      allSchedules.filter((s) => s.status === 'PUBLISHED' || s.id === targetScheduleId).map((s) => s.id)
    );

    // Filter assignments belonging to this nurse and published schedules
    const nurseAssignments = allAssignments.filter(
      (a) => a.nurseId === targetNurse!.id && publishedScheduleIds.has(a.scheduleId)
    );

    // Maps for entity lookup
    const dutyMap = new Map<string, DutyWindow>(allDutyWindows.map((d) => [d.id, d]));
    const doctorMap = new Map<string, Doctor>(allDoctors.map((d) => [d.id, d]));
    const roleMap = new Map<string, ClinicalRole>(allRoles.map((r) => [r.id, r]));
    const specialtyMap = new Map<string, Specialty>(allSpecialties.map((s) => [s.id, s]));

    // 4. Construct RFC 5545 iCalendar stream
    const nowUtc = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ClinicRoster//Duty Roster iCal Feed//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeIcalText(`Clinic Roster - ${targetNurse.fullName}`)}`,
      `X-WR-TIMEZONE:${timezone}`,
      'BEGIN:VTIMEZONE',
      `TZID:${timezone}`,
      `X-LIC-LOCATION:${timezone}`,
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0400',
      'TZOFFSETTO:+0400',
      'TZNAME:GST',
      'DTSTART:19700101T000000',
      'END:STANDARD',
      'END:VTIMEZONE',
    ];

    for (const asgn of nurseAssignments) {
      const duty = dutyMap.get(asgn.dutyWindowId) || {
        name: 'Shift Duty',
        acronym: 'D',
        startTime: '09:00',
        endTime: '17:00',
      };

      const dtStart = formatIcalDateTime(asgn.date, duty.startTime);
      let dtEnd = formatIcalDateTime(asgn.date, duty.endTime);

      // Handle overnight or end time before start time
      if (duty.endTime < duty.startTime) {
        const nextDay = new Date(new Date(asgn.date).getTime() + 86400000).toISOString().split('T')[0];
        dtEnd = formatIcalDateTime(nextDay, duty.endTime);
      }

      // Format Summary
      let targetLabel = '';
      if (asgn.kind === 'DOCTOR' && asgn.doctorId) {
        const doc = doctorMap.get(asgn.doctorId);
        const specId = doc?.specialtyIds?.[0];
        const spec = specId ? specialtyMap.get(specId)?.name : '';
        targetLabel = doc ? ` - Dr. ${doc.fullName}${spec ? ` (${spec})` : ''}` : '';
      } else if (asgn.kind === 'CLINICAL_ROLE' && asgn.clinicalRoleId) {
        const role = roleMap.get(asgn.clinicalRoleId);
        targetLabel = role ? ` - ${role.name}` : '';
      } else if (asgn.kind === 'SPECIALTY' && asgn.specialtyId) {
        const spec = specialtyMap.get(asgn.specialtyId);
        targetLabel = spec ? ` - ${spec.name}` : '';
      }

      const summary = `[${duty.acronym}] ${duty.name}${targetLabel}`;

      // Format Description
      const descParts = [
        `Nurse: ${targetNurse.fullName} (${targetNurse.employeeCode})`,
        `Shift: ${duty.name} (${duty.startTime} - ${duty.endTime})`,
        `Assignment: ${targetLabel.replace(/^ - /, '') || 'General Duty'}`,
        `Clinic: ${clinicProfile.name}`,
      ];
      if (asgn.note) {
        descParts.push(`Note: ${asgn.note}`);
      }

      const description = descParts.join('\n');
      const location = clinicProfile.address || clinicProfile.name;
      const uid = `asgn-${asgn.id}@clinicroster.local`;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${nowUtc}`);
      lines.push(`DTSTART;TZID=${timezone}:${dtStart}`);
      lines.push(`DTEND;TZID=${timezone}:${dtEnd}`);
      lines.push(`SUMMARY:${escapeIcalText(summary)}`);
      lines.push(`DESCRIPTION:${escapeIcalText(description)}`);
      lines.push(`LOCATION:${escapeIcalText(location)}`);
      lines.push('STATUS:CONFIRMED');
      lines.push('TRANSP:OPAQUE');
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    // RFC 5545 requires CRLF line delimiters
    const icalContent = lines.join('\r\n') + '\r\n';

    const safeNurseName = targetNurse.fullName.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="roster-${safeNurseName}.ics"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    res.send(icalContent);
  } catch (err: any) {
    console.error('[CalendarAPI] GET /api/roster/calendar error:', err);
    res.status(500).set('Content-Type', 'text/plain').send('Failed to generate calendar feed.');
  }
};

calendarRouter.get('/roster/calendar/:token.ics', handleCalendarFeed);
calendarRouter.get('/roster/calendar/:token', handleCalendarFeed);
