/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Clinic Configuration & Constraint Rules API
 * Manages clinic profile, constraint rules, and public holidays.
 */

import { Router, Request, Response } from 'express';
import { getServerRepository } from '../db/index';
import { requirePlanner } from '../middleware/auth';
import { ClinicProfile, Rule, PublicHoliday } from '../../src/types';

export const clinicRouter = Router();

// ==========================================
// Clinic Profile Endpoints
// ==========================================

/**
 * GET /api/clinic
 * Returns the clinic profile
 */
clinicRouter.get('/clinic', async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const clinics = await repo.list('clinics');
    let profile = clinics[0];

    if (!profile) {
      profile = {
        id: 'clinic-primary',
        name: 'American Hospital Nad Al Sheba OutPatient clinic',
        address: 'Nad Al Sheba, Dubai, UAE',
        phone: '+971 4 300 0000',
        timezone: 'Asia/Dubai',
        workingDays: [true, true, true, true, true, true, true],
        openTime: '09:00',
        closeTime: '21:00',
        defaultBlockWeeks: 2,
        updatedAt: new Date().toISOString(),
      };
      await repo.create('clinics', profile);
    } else if (profile.name === 'Hope Valley Polyclinic' || !profile.name || profile.name === 'Outpatient Clinic') {
      profile = {
        ...profile,
        name: 'American Hospital Nad Al Sheba OutPatient clinic',
        address: profile.address || 'Nad Al Sheba, Dubai, UAE',
        phone: profile.phone || '+971 4 300 0000',
        updatedAt: new Date().toISOString(),
      };
      await repo.update('clinics', profile.id, profile);
    }

    res.json({ status: 'ok', data: profile });
  } catch (err: any) {
    console.error('[ClinicAPI] GET /api/clinic error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * PUT /api/clinic
 * Updates clinic profile, operating hours, working days, and timezone
 * Guarded: Requires Planner or Owner role
 */
clinicRouter.put('/clinic', requirePlanner, async (req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const clinics = await repo.list('clinics');
    const existing = clinics[0];

    const updatePayload: Partial<ClinicProfile> = {
      ...req.body,
      name: req.body.name ? String(req.body.name).trim() : existing?.name || 'Outpatient Clinic',
      updatedAt: new Date().toISOString(),
    };

    let updated: ClinicProfile;
    if (existing) {
      updated = await repo.update('clinics', existing.id, updatePayload);
    } else {
      updated = await repo.create('clinics', {
        name: req.body.name || 'Outpatient Clinic',
        timezone: req.body.timezone || 'Asia/Dubai',
        workingDays: req.body.workingDays || [true, true, true, true, true, true, true],
        openTime: req.body.openTime || '09:00',
        closeTime: req.body.closeTime || '21:00',
        defaultBlockWeeks: req.body.defaultBlockWeeks || 2,
        updatedAt: new Date().toISOString(),
        ...updatePayload,
      });
    }

    // Record audit event
    await repo.create('audit', {
      actor: req.user?.name || 'Authorized User',
      action: 'UPDATE',
      entity: 'ClinicProfile',
      entityId: updated.id,
      after: updated,
      note: 'Updated clinic profile configuration',
      timestamp: new Date().toISOString(),
    });

    res.json({ status: 'ok', data: updated });
  } catch (err: any) {
    console.error('[ClinicAPI] PUT /api/clinic error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// ==========================================
// Constraint Rules Endpoints
// ==========================================

/**
 * GET /api/rules
 * Returns all configured constraint rules (H1-H6 hard rules, S1-S7 soft rules)
 */
clinicRouter.get('/rules', async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const rules = await repo.list('rules');
    res.json({ status: 'ok', data: rules });
  } catch (err: any) {
    console.error('[ClinicAPI] GET /api/rules error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * PUT /api/rules/:id
 * Updates a specific constraint rule (enabled, value, severity, params)
 * Guarded: Requires Planner or Owner role
 */
clinicRouter.put('/rules/:id', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const existing = await repo.get('rules', id);

    if (!existing) {
      res.status(404).json({ error: 'NotFound', message: `Rule ${id} not found.` });
      return;
    }

    const updated = await repo.update('rules', id, req.body);

    // Record audit event
    await repo.create('audit', {
      actor: req.user?.name || 'Authorized User',
      action: 'UPDATE',
      entity: 'Rule',
      entityId: id,
      before: existing,
      after: updated,
      note: `Updated rule ${existing.name}`,
      timestamp: new Date().toISOString(),
    });

    res.json({ status: 'ok', data: updated });
  } catch (err: any) {
    console.error(`[ClinicAPI] PUT /api/rules/${req.params.id} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// ==========================================
// Public Holidays Endpoints
// ==========================================

/**
 * GET /api/holidays
 * Returns all public holidays
 */
clinicRouter.get('/holidays', async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const holidays = await repo.list('holidays');
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    res.json({ status: 'ok', data: holidays });
  } catch (err: any) {
    console.error('[ClinicAPI] GET /api/holidays error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/holidays
 * Creates a new public holiday
 * Guarded: Requires Planner or Owner role
 */
clinicRouter.post('/holidays', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { date, name, country = 'AE', hijriNote } = req.body;
    if (!date || !name) {
      res.status(400).json({ error: 'BadRequest', message: 'Holiday date and name are required.' });
      return;
    }

    const repo = getServerRepository();
    const newHoliday: Omit<PublicHoliday, 'id'> = {
      date,
      name,
      country,
      hijriNote,
    };

    const created = await repo.create('holidays', newHoliday);

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized User',
      action: 'CREATE',
      entity: 'PublicHoliday',
      entityId: created.id,
      after: created,
      note: `Added public holiday: ${name} (${date})`,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({ status: 'ok', data: created });
  } catch (err: any) {
    console.error('[ClinicAPI] POST /api/holidays error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * PUT /api/holidays/:id
 * Updates an existing holiday
 * Guarded: Requires Planner or Owner role
 */
clinicRouter.put('/holidays/:id', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const existing = await repo.get('holidays', id);

    if (!existing) {
      res.status(404).json({ error: 'NotFound', message: `Holiday ${id} not found.` });
      return;
    }

    const updated = await repo.update('holidays', id, req.body);
    res.json({ status: 'ok', data: updated });
  } catch (err: any) {
    console.error(`[ClinicAPI] PUT /api/holidays/${req.params.id} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * DELETE /api/holidays/:id
 * Removes a public holiday
 * Guarded: Requires Planner or Owner role
 */
clinicRouter.delete('/holidays/:id', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const existing = await repo.get('holidays', id);

    if (!existing) {
      res.status(404).json({ error: 'NotFound', message: `Holiday ${id} not found.` });
      return;
    }

    await repo.remove('holidays', id);

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized User',
      action: 'DELETE',
      entity: 'PublicHoliday',
      entityId: id,
      before: existing,
      note: `Removed public holiday: ${existing.name}`,
      timestamp: new Date().toISOString(),
    });

    res.json({ status: 'ok', message: `Holiday ${id} deleted successfully.` });
  } catch (err: any) {
    console.error(`[ClinicAPI] DELETE /api/holidays/${req.params.id} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});
