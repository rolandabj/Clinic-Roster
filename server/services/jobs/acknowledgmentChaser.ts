/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Automated Shift Acknowledgment Chaser Job
 * Automatically detects unacknowledged roster shifts and dispatches reminder notices
 * without planner manual intervention. Logs all chaser actions in the compliance audit trail.
 */

import { v4 as uuidv4 } from 'uuid';
import { getServerRepository } from '../../db/index';
import { EmailService } from '../email/emailService';
import { renderAcknowledgmentReminderTemplate } from '../email/emailTemplates';
import { Acknowledgment, Nurse, Schedule, ScheduleVersion, ClinicProfile } from '../../../src/types';

export interface ChaserRunResult {
  runAt: string;
  thresholdHours: number;
  totalPendingAcks: number;
  remindersDispatched: number;
  skippedRecentlyReminded: number;
  details: Array<{
    nurseId: string;
    nurseName: string;
    nurseEmail: string;
    scheduleId: string;
    scheduleName: string;
    hoursElapsed: number;
    status: 'SENT' | 'MOCK_SENT' | 'FAILED' | 'SKIPPED';
    messageId?: string;
    error?: string;
  }>;
}

export interface ChaserStatus {
  enabled: boolean;
  isRunning: boolean;
  intervalMinutes: number;
  thresholdHours: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  totalCyclesExecuted: number;
  totalRemindersSent: number;
  lastRunResult: ChaserRunResult | null;
}

export class AcknowledgmentChaser {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private enabled: boolean = true;
  private intervalMinutes: number = 60; // Check every 60 minutes
  private thresholdHours: number = 48; // Shift notices older than 48 hours
  private lastRunAt: string | null = null;
  private nextRunAt: string | null = null;
  private totalCyclesExecuted: number = 0;
  private totalRemindersSent: number = 0;
  private lastRunResult: ChaserRunResult | null = null;

  constructor(options?: { intervalMinutes?: number; thresholdHours?: number; enabled?: boolean }) {
    if (options?.intervalMinutes !== undefined) this.intervalMinutes = options.intervalMinutes;
    if (options?.thresholdHours !== undefined) this.thresholdHours = options.thresholdHours;
    if (options?.enabled !== undefined) this.enabled = options.enabled;
  }

  /**
   * Start the background scheduler
   */
  public start(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    if (!this.enabled) {
      console.log('[AcknowledgmentChaser] Job is disabled by configuration.');
      return;
    }

    const intervalMs = this.intervalMinutes * 60 * 1000;
    this.updateNextRunAt();

    console.log(
      `[AcknowledgmentChaser] Background scheduler active: checking every ${this.intervalMinutes}m for unacknowledged shifts > ${this.thresholdHours}h.`
    );

    this.timer = setInterval(() => {
      this.runChaserCycle().catch((err) => {
        console.error('[AcknowledgmentChaser] Scheduled cycle execution failed:', err);
      });
    }, intervalMs);
  }

  /**
   * Stop the background scheduler
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.nextRunAt = null;
    console.log('[AcknowledgmentChaser] Background scheduler stopped.');
  }

  private updateNextRunAt(): void {
    const next = new Date(Date.now() + this.intervalMinutes * 60 * 1000);
    this.nextRunAt = next.toISOString();
  }

  /**
   * Execute an acknowledgment chaser cycle
   */
  public async runChaserCycle(customThresholdHours?: number): Promise<ChaserRunResult> {
    if (this.isProcessing) {
      console.warn('[AcknowledgmentChaser] Cycle already running, skipping overlapping invocation.');
      return this.lastRunResult || {
        runAt: new Date().toISOString(),
        thresholdHours: this.thresholdHours,
        totalPendingAcks: 0,
        remindersDispatched: 0,
        skippedRecentlyReminded: 0,
        details: [],
      };
    }

    this.isProcessing = true;
    const effectiveThreshold = customThresholdHours !== undefined ? customThresholdHours : this.thresholdHours;
    const now = new Date();
    const runAt = now.toISOString();

    const result: ChaserRunResult = {
      runAt,
      thresholdHours: effectiveThreshold,
      totalPendingAcks: 0,
      remindersDispatched: 0,
      skippedRecentlyReminded: 0,
      details: [],
    };

    try {
      const repo = getServerRepository();

      const [allAcks, allNurses, allSchedules, allVersions, allClinics] = await Promise.all([
        repo.list('acknowledgments'),
        repo.list('nurses'),
        repo.list('schedules'),
        repo.list('versions'),
        repo.list('clinics'),
      ]);

      const clinic = allClinics[0] || ({ name: 'Outpatient Clinic' } as ClinicProfile);
      const nurseMap = new Map<string, Nurse>(allNurses.map((n) => [n.id, n]));
      const scheduleMap = new Map<string, Schedule>(allSchedules.map((s) => [s.id, s]));
      const versionMap = new Map<string, ScheduleVersion>(allVersions.map((v) => [v.id, v]));

      // 1. Identify unacknowledged entries
      const pendingAcks = allAcks.filter((ack) => !ack.ackAt);
      result.totalPendingAcks = pendingAcks.length;

      for (const ack of pendingAcks) {
        const sentTime = ack.sentAt ? new Date(ack.sentAt).getTime() : 0;
        const elapsedMs = now.getTime() - sentTime;
        const hoursElapsed = Math.max(0, Math.floor(elapsedMs / (3600 * 1000)));

        // Check if elapsed time meets or exceeds threshold
        if (hoursElapsed < effectiveThreshold) {
          continue;
        }

        // Check if reminder was dispatched in the last 24 hours to prevent spamming
        const lastRemindedAt = (ack as any).lastReminderSentAt;
        if (lastRemindedAt) {
          const hoursSinceLastReminder = (now.getTime() - new Date(lastRemindedAt).getTime()) / (3600 * 1000);
          if (hoursSinceLastReminder < 24) {
            result.skippedRecentlyReminded++;
            continue;
          }
        }

        const nurse = nurseMap.get(ack.nurseId);
        const schedule = scheduleMap.get(ack.scheduleId);
        const version = versionMap.get(ack.versionId);

        if (!nurse || !nurse.active || !nurse.gmail) {
          continue;
        }

        const scheduleName = schedule ? schedule.name : 'Outpatient Clinic Roster';
        const versionNumber = version ? version.number : 1;
        const ackUrl = `/ack/${ack.token}`;
        const calendarUrl = `/api/roster/calendar/${ack.token}.ics`;

        // Render template
        const emailContent = renderAcknowledgmentReminderTemplate({
          clinicName: clinic.name,
          nurseName: nurse.fullName,
          employeeCode: nurse.employeeCode,
          scheduleName,
          versionNumber,
          publishedDate: ack.sentAt ? ack.sentAt.split('T')[0] : 'Recently',
          hoursElapsed,
          ackUrl,
          calendarUrl,
        });

        // Dispatch Email
        const dispatchResult = await EmailService.send(
          {
            to: nurse.gmail,
            subject: emailContent.subject,
            html: emailContent.html,
            scheduleId: ack.scheduleId,
            nurseId: nurse.id,
            versionId: ack.versionId,
          },
          repo,
          'System Acknowledgment Chaser'
        );

        // Update Acknowledgment with reminder timestamp and count
        const updatedAck = {
          ...ack,
          lastReminderSentAt: now.toISOString(),
          reminderCount: ((ack as any).reminderCount || 0) + 1,
        };
        await repo.update('acknowledgments', ack.id, updatedAck as any);

        // Record compliance audit log
        await repo.create('audit', {
          id: `aud-${uuidv4().slice(0, 8)}`,
          timestamp: now.toISOString(),
          actorName: 'System Acknowledgment Chaser',
          actorRole: 'SYSTEM',
          action: 'UPDATE',
          entity: 'Acknowledgment',
          entityId: ack.id,
          details: `Compliance Chaser dispatched reminder notice to ${nurse.fullName} (${nurse.gmail}) for ${scheduleName} (Version ${versionNumber}). Pending for ${hoursElapsed}h.`,
        } as any);

        result.remindersDispatched++;
        this.totalRemindersSent++;

        result.details.push({
          nurseId: nurse.id,
          nurseName: nurse.fullName,
          nurseEmail: nurse.gmail,
          scheduleId: ack.scheduleId,
          scheduleName,
          hoursElapsed,
          status: dispatchResult.status,
          messageId: dispatchResult.messageId,
          error: dispatchResult.error,
        });
      }

      this.lastRunAt = runAt;
      this.totalCyclesExecuted++;
      this.lastRunResult = result;
      this.updateNextRunAt();

      console.log(
        `[AcknowledgmentChaser] Cycle complete: ${result.remindersDispatched} reminders dispatched, ${result.skippedRecentlyReminded} skipped (already reminded within 24h).`
      );

      return result;
    } catch (err: any) {
      console.error('[AcknowledgmentChaser] Error during chaser cycle:', err);
      throw err;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get current status of the chaser service
   */
  public getStatus(): ChaserStatus {
    return {
      enabled: this.enabled,
      isRunning: this.timer !== null,
      intervalMinutes: this.intervalMinutes,
      thresholdHours: this.thresholdHours,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      totalCyclesExecuted: this.totalCyclesExecuted,
      totalRemindersSent: this.totalRemindersSent,
      lastRunResult: this.lastRunResult,
    };
  }

  /**
   * Update configuration parameters dynamically
   */
  public configure(options: { intervalMinutes?: number; thresholdHours?: number; enabled?: boolean }): ChaserStatus {
    if (options.intervalMinutes !== undefined && options.intervalMinutes > 0) {
      this.intervalMinutes = options.intervalMinutes;
    }
    if (options.thresholdHours !== undefined && options.thresholdHours >= 0) {
      this.thresholdHours = options.thresholdHours;
    }
    if (options.enabled !== undefined) {
      this.enabled = options.enabled;
      if (!this.enabled && this.timer) {
        this.stop();
      } else if (this.enabled && !this.timer) {
        this.start();
      }
    }

    if (this.timer && options.intervalMinutes !== undefined) {
      this.start(); // restart with new interval
    }

    return this.getStatus();
  }
}

// Global Singleton Instance
export const acknowledgmentChaser = new AcknowledgmentChaser({
  intervalMinutes: parseInt(process.env.CHASER_INTERVAL_MINUTES || '60', 10),
  thresholdHours: parseInt(process.env.CHASER_THRESHOLD_HOURS || '48', 10),
  enabled: process.env.CHASER_ENABLED !== 'false',
});
