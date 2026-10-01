/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Schedule Deletion Service
 * Permanently removes a schedule and cascades deletion to all associated
 * assignments, versions, publish logs, acknowledgments, share links, and invitations.
 */

import { IRepository } from '../repository/IRepository';

export interface ScheduleDeleteResult {
  success: boolean;
  scheduleId: string;
  scheduleName: string;
  purgedAssignmentsCount: number;
  purgedVersionsCount: number;
}

export async function deleteEntireSchedule(
  repo: IRepository,
  scheduleId: string,
  actorName: string = 'Admin'
): Promise<ScheduleDeleteResult> {
  const schedule = await repo.get('schedules', scheduleId);
  const scheduleName = schedule?.name || `Schedule (${scheduleId})`;

  let purgedAssignmentsCount = 0;
  let purgedVersionsCount = 0;

  // 1. Delete all assignments for this schedule
  try {
    const allAssignments = await repo.list('assignments');
    const schedAssignments = allAssignments.filter((a) => a.scheduleId === scheduleId);
    if (schedAssignments.length > 0) {
      await repo.bulkRemove('assignments', schedAssignments.map((a) => a.id));
      purgedAssignmentsCount = schedAssignments.length;
    }
  } catch (err) {
    console.warn('Error purging assignments for schedule:', err);
  }

  // 2. Delete all versions for this schedule
  try {
    const allVersions = await repo.list('versions');
    const schedVersions = allVersions.filter((v) => v.scheduleId === scheduleId);
    for (const v of schedVersions) {
      await repo.remove('versions', v.id);
    }
    purgedVersionsCount = schedVersions.length;
  } catch (err) {
    console.warn('Error purging versions for schedule:', err);
  }

  // 3. Delete share links
  try {
    const allShareLinks = await repo.list('shareLinks');
    const schedLinks = allShareLinks.filter((l) => l.scheduleId === scheduleId);
    for (const l of schedLinks) {
      await repo.remove('shareLinks', l.id);
    }
  } catch (err) {
    console.warn('Error purging shareLinks:', err);
  }

  // 4. Delete invitations
  try {
    const allInvs = await repo.list('invitations');
    const schedInvs = allInvs.filter((i) => i.scheduleId === scheduleId);
    for (const inv of schedInvs) {
      await repo.remove('invitations', inv.id);
    }
  } catch (err) {
    console.warn('Error purging invitations:', err);
  }

  // 5. Delete publish email logs
  try {
    const allLogs = await repo.list('emailLog');
    const schedLogs = allLogs.filter((p) => p.scheduleId === scheduleId);
    for (const log of schedLogs) {
      await repo.remove('emailLog', log.id);
    }
  } catch (err) {
    console.warn('Error purging emailLog:', err);
  }

  // 6. Delete acknowledgments
  try {
    const allAcks = await repo.list('acknowledgments');
    const schedAcks = allAcks.filter((a) => a.scheduleId === scheduleId);
    for (const ack of schedAcks) {
      await repo.remove('acknowledgments', ack.id);
    }
  } catch (err) {
    console.warn('Error purging acknowledgments:', err);
  }

  // 7. Delete the schedule record itself
  await repo.remove('schedules', scheduleId);

  // 8. Record audit trail event
  try {
    await repo.create('audit', {
      actor: actorName,
      action: 'DELETE',
      entity: 'Schedule',
      entityId: scheduleId,
      note: `Permanently deleted schedule "${scheduleName}" and cascaded deletion of ${purgedAssignmentsCount} assignments and ${purgedVersionsCount} version checkpoints.`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Error creating audit entry for schedule deletion:', err);
  }

  return {
    success: true,
    scheduleId,
    scheduleName,
    purgedAssignmentsCount,
    purgedVersionsCount,
  };
}
