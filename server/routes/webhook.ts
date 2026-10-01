/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Webhook Administration & Testing Router
 */

import { Router, Request, Response } from 'express';
import { getServerRepository } from '../db/index';
import { WebhookService } from '../services/notifications/webhookService';
import { requirePlanner } from '../middleware/auth';
import { ClinicProfile, WebhookEndpoint } from '../../src/types';

export const webhookRouter = Router();

/**
 * POST /api/webhook/test
 * Test dispatch to an individual webhook endpoint
 */
webhookRouter.post('/webhook/test', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body as { endpoint: WebhookEndpoint };
    if (!endpoint || !endpoint.url) {
      res.status(400).json({ error: 'BadRequest', message: 'Webhook endpoint with valid URL is required.' });
      return;
    }

    const result = await WebhookService.testEndpoint(endpoint);
    res.json({ status: 'ok', data: result });
  } catch (err: any) {
    console.error('[WebhookAPI] Test failed:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * GET /api/webhook/config
 * Get currently configured webhooks from Clinic profile
 */
webhookRouter.get('/webhook/config', requirePlanner, async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const clinics = await repo.list('clinics');
    const clinic = clinics[0] as ClinicProfile | undefined;
    const config = clinic?.webhookConfig || { enabled: false, endpoints: [] };

    res.json({ status: 'ok', data: config });
  } catch (err: any) {
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/webhook/trigger-test-alert
 * Dispatches a simulated alert (roster published, swap, or severe violation) to all enabled endpoints
 */
webhookRouter.post('/webhook/trigger-test-alert', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { eventType } = req.body as { eventType: 'ROSTER_PUBLISHED' | 'SHIFT_SWAP_FINALIZED' | 'SEVERE_VIOLATION_DETECTED' };
    const repo = getServerRepository();
    const clinics = await repo.list('clinics');
    const clinicName = (clinics[0] as ClinicProfile)?.name || 'American Hospital Nad Al Sheba OutPatient clinic';

    let dispatchedCount = 0;

    if (eventType === 'ROSTER_PUBLISHED') {
      dispatchedCount = await WebhookService.notifyRosterPublished(
        {
          clinicName,
          scheduleId: 'sched-test',
          scheduleName: 'Test Schedule Notification',
          versionNumber: 1,
          period: '2026-10-01 to 2026-10-31',
          totalNursesAssigned: 8,
          publishedBy: req.user?.name || 'Clinic Supervisor',
        },
        repo
      );
    } else if (eventType === 'SHIFT_SWAP_FINALIZED') {
      dispatchedCount = await WebhookService.notifyShiftSwapFinalized(
        {
          clinicName,
          scheduleName: 'October 2026 Outpatient Roster',
          nurseAName: 'Fatima Al Mansoori',
          dateA: '2026-10-15',
          dutyA: 'Late Duty (13:00 - 21:00)',
          nurseBName: 'Mariam Al Zaabi',
          dateB: '2026-10-16',
          dutyB: 'Full Day (09:00 - 21:00)',
          reason: 'Emergency Family Care Leave Exchange',
          approvedBy: req.user?.name || 'Clinic Supervisor',
        },
        repo
      );
    } else if (eventType === 'SEVERE_VIOLATION_DETECTED') {
      dispatchedCount = await WebhookService.notifySevereRuleViolation(
        {
          clinicName,
          scheduleName: 'October 2026 Outpatient Roster',
          violationCount: 2,
          criticalIssues: [
            'H1: Zero Senior / Charge Nurses assigned on 2026-10-12 (Late Duty)',
            'H2: Maximum weekly hours (48h) exceeded for Nurse Sara Al Nuaimi (52h)',
          ],
          detectedBy: req.user?.name || 'Automated Rule Engine',
        },
        repo
      );
    }

    res.json({ status: 'ok', data: { dispatchedCount, eventType } });
  } catch (err: any) {
    console.error('[WebhookAPI] Trigger test alert failed:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});
