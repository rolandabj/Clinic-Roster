/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IRepository } from './IRepository';
import { Assignment } from '../../types';

/**
 * Synchronizes the persisted assignments in the database for a specific schedule
 * so that deletions, clears, undo/redo, and updates are fully reflected in persistent storage.
 */
export async function syncScheduleAssignments(
  repo: IRepository,
  scheduleId: string,
  newAssignments: Assignment[]
): Promise<void> {
  try {
    const existing = await repo.list('assignments');
    const existingForSchedule = existing.filter((a) => a.scheduleId === scheduleId);
    const newIds = new Set(newAssignments.map((a) => a.id));

    // Identify assignments previously saved that are no longer present
    const idsToRemove = existingForSchedule
      .filter((a) => !newIds.has(a.id))
      .map((a) => a.id);

    if (idsToRemove.length > 0) {
      await repo.bulkRemove('assignments', idsToRemove);
    }
    if (newAssignments.length > 0) {
      await repo.bulkUpsert('assignments', newAssignments);
    }
  } catch (err) {
    console.error(`[syncScheduleAssignments] Error synchronizing assignments for schedule ${scheduleId}:`, err);
    throw err;
  }
}
