/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Staff Management & Clinical Reference Data API
 * Handles nurses, doctors, weekly pattern slots, and clinical reference entities.
 */

import { Router, Request, Response } from 'express';
import { getServerRepository } from '../db/index';
import { requirePlanner } from '../middleware/auth';
import { Nurse, Doctor } from '../../src/types';

export const staffRouter = Router();

// ==========================================
// Nurses Endpoints
// ==========================================

/**
 * GET /api/nurses
 * Returns all registered nurses, optionally filtered by active status
 */
staffRouter.get('/nurses', async (req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const nurses = await repo.list('nurses');
    
    if (req.query.active !== undefined) {
      const isActive = req.query.active === 'true';
      res.json({ status: 'ok', data: nurses.filter((n) => n.active === isActive) });
      return;
    }

    res.json({ status: 'ok', data: nurses });
  } catch (err: any) {
    console.error('[StaffAPI] GET /api/nurses error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/nurses
 * Registers a new nurse
 * Guarded: Requires Planner or Owner role
 */
staffRouter.post('/nurses', requirePlanner, async (req: Request, res: Response) => {
  try {
    const {
      fullName,
      gmail,
      employeeCode,
      seniorityLevelId,
      contractPercent = 100,
      dateOfBirth,
      capabilityIds = [],
      isClinicNurse = true,
      preferences = [],
      leaveQuotas,
      active = true,
      notes,
    } = req.body;

    if (!fullName || !gmail) {
      res.status(400).json({ error: 'BadRequest', message: 'Nurse full name and email are required.' });
      return;
    }

    const repo = getServerRepository();
    const newNurse: Omit<Nurse, 'id'> = {
      fullName,
      gmail,
      employeeCode: employeeCode || `NUR-${Date.now().toString(36).toUpperCase()}`,
      seniorityLevelId: seniorityLevelId || 'snr-staff',
      contractPercent,
      dateOfBirth: dateOfBirth || '1990-01-01',
      capabilityIds,
      isClinicNurse,
      preferences,
      leaveQuotas,
      active,
      notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = await repo.create('nurses', newNurse);

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized User',
      action: 'CREATE',
      entity: 'Nurse',
      entityId: created.id,
      after: created,
      note: `Added nurse ${fullName}`,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({ status: 'ok', data: created });
  } catch (err: any) {
    console.error('[StaffAPI] POST /api/nurses error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * PUT /api/nurses/:id
 * Updates an existing nurse record
 * Guarded: Requires Planner or Owner role
 */
staffRouter.put('/nurses/:id', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const existing = await repo.get('nurses', id);

    if (!existing) {
      res.status(404).json({ error: 'NotFound', message: `Nurse ${id} not found.` });
      return;
    }

    const updatePayload = {
      ...req.body,
      updatedAt: new Date().toISOString(),
    };

    const updated = await repo.update('nurses', id, updatePayload);

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized User',
      action: 'UPDATE',
      entity: 'Nurse',
      entityId: id,
      before: existing,
      after: updated,
      note: `Updated nurse profile for ${existing.fullName}`,
      timestamp: new Date().toISOString(),
    });

    res.json({ status: 'ok', data: updated });
  } catch (err: any) {
    console.error(`[StaffAPI] PUT /api/nurses/${req.params.id} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * DELETE /api/nurses/:id
 * Removes a nurse record
 * Guarded: Requires Planner or Owner role
 */
staffRouter.delete('/nurses/:id', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const existing = await repo.get('nurses', id);

    if (!existing) {
      res.status(404).json({ error: 'NotFound', message: `Nurse ${id} not found.` });
      return;
    }

    await repo.remove('nurses', id);

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized User',
      action: 'DELETE',
      entity: 'Nurse',
      entityId: id,
      before: existing,
      note: `Removed nurse: ${existing.fullName}`,
      timestamp: new Date().toISOString(),
    });

    res.json({ status: 'ok', message: `Nurse ${id} removed successfully.` });
  } catch (err: any) {
    console.error(`[StaffAPI] DELETE /api/nurses/${req.params.id} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// ==========================================
// Doctors Endpoints
// ==========================================

/**
 * GET /api/doctors
 * Returns all doctors including weekly pattern schedules and room assignments
 */
staffRouter.get('/doctors', async (req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const doctors = await repo.list('doctors');

    if (req.query.active !== undefined) {
      const isActive = req.query.active === 'true';
      res.json({ status: 'ok', data: doctors.filter((d) => d.active === isActive) });
      return;
    }

    res.json({ status: 'ok', data: doctors });
  } catch (err: any) {
    console.error('[StaffAPI] GET /api/doctors error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/doctors
 * Registers a new doctor with specialty bindings and recurring weekly patterns
 * Guarded: Requires Planner or Owner role
 */
staffRouter.post('/doctors', requirePlanner, async (req: Request, res: Response) => {
  try {
    const {
      fullName,
      gmail,
      specialtyIds = [],
      weeklyPattern = [],
      notes,
      active = true,
    } = req.body;

    if (!fullName) {
      res.status(400).json({ error: 'BadRequest', message: 'Doctor full name is required.' });
      return;
    }

    const repo = getServerRepository();
    const newDoc: Omit<Doctor, 'id'> = {
      fullName,
      gmail,
      specialtyIds,
      weeklyPattern,
      notes,
      active,
    };

    const created = await repo.create('doctors', newDoc);

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized User',
      action: 'CREATE',
      entity: 'Doctor',
      entityId: created.id,
      after: created,
      note: `Added doctor ${fullName}`,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({ status: 'ok', data: created });
  } catch (err: any) {
    console.error('[StaffAPI] POST /api/doctors error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * PUT /api/doctors/:id
 * Updates an existing doctor profile, specialties, and weekly pattern schedule
 * Guarded: Requires Planner or Owner role
 */
staffRouter.put('/doctors/:id', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const existing = await repo.get('doctors', id);

    if (!existing) {
      res.status(404).json({ error: 'NotFound', message: `Doctor ${id} not found.` });
      return;
    }

    const updated = await repo.update('doctors', id, req.body);

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized User',
      action: 'UPDATE',
      entity: 'Doctor',
      entityId: id,
      before: existing,
      after: updated,
      note: `Updated doctor profile and pattern slots for ${existing.fullName}`,
      timestamp: new Date().toISOString(),
    });

    res.json({ status: 'ok', data: updated });
  } catch (err: any) {
    console.error(`[StaffAPI] PUT /api/doctors/${req.params.id} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * DELETE /api/doctors/:id
 * Removes a doctor record
 * Guarded: Requires Planner or Owner role
 */
staffRouter.delete('/doctors/:id', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const existing = await repo.get('doctors', id);

    if (!existing) {
      res.status(404).json({ error: 'NotFound', message: `Doctor ${id} not found.` });
      return;
    }

    await repo.remove('doctors', id);

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized User',
      action: 'DELETE',
      entity: 'Doctor',
      entityId: id,
      before: existing,
      note: `Removed doctor: ${existing.fullName}`,
      timestamp: new Date().toISOString(),
    });

    res.json({ status: 'ok', message: `Doctor ${id} removed successfully.` });
  } catch (err: any) {
    console.error(`[StaffAPI] DELETE /api/doctors/${req.params.id} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// ==========================================
// Clinical Reference Data Endpoints
// ==========================================

/**
 * GET /api/duties
 * Returns all duty window definitions (Full Day, Late, Early, etc.)
 */
staffRouter.get('/duties', async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const duties = await repo.list('dutyWindows');
    res.json({ status: 'ok', data: duties });
  } catch (err: any) {
    console.error('[StaffAPI] GET /api/duties error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * GET /api/seniority
 * Returns all nurse seniority levels with rank hierarchy
 */
staffRouter.get('/seniority', async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const seniority = await repo.list('seniorityLevels');
    seniority.sort((a, b) => a.rank - b.rank);
    res.json({ status: 'ok', data: seniority });
  } catch (err: any) {
    console.error('[StaffAPI] GET /api/seniority error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * GET /api/roles
 * Returns all clinical support roles (e.g. Blood Collection, Triage, Nurse Clinic)
 */
staffRouter.get('/roles', async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const roles = await repo.list('clinicalRoles');
    res.json({ status: 'ok', data: roles });
  } catch (err: any) {
    console.error('[StaffAPI] GET /api/roles error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * GET /api/specialties
 * Returns all medical specialties (Cardiology, Pediatrics, etc.)
 */
staffRouter.get('/specialties', async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const specialties = await repo.list('specialties');
    res.json({ status: 'ok', data: specialties });
  } catch (err: any) {
    console.error('[StaffAPI] GET /api/specialties error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * GET /api/leave-types
 * Returns all recognized leave categories (Annual, Sick, Public Holiday, etc.)
 */
staffRouter.get('/leave-types', async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const leaveTypes = await repo.list('leaveTypes');
    res.json({ status: 'ok', data: leaveTypes });
  } catch (err: any) {
    console.error('[StaffAPI] GET /api/leave-types error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});
