/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Universal Data CRUD Router
 * Provides RESTful CRUD operations across all collection types in IRepository.
 */

import { Router, Request, Response } from 'express';
import { getServerRepository } from '../db/index';
import { CollectionName } from '../../src/types';

export const crudRouter = Router();

const ALLOWED_COLLECTIONS: Set<string> = new Set<CollectionName>([
  'clinics',
  'dutyWindows',
  'leaveTypes',
  'seniorityLevels',
  'clinicalRoles',
  'specialties',
  'nurses',
  'doctors',
  'doctorSessions',
  'leaveEntries',
  'locks',
  'rules',
  'schedules',
  'assignments',
  'versions',
  'shareLinks',
  'invitations',
  'emailLog',
  'acknowledgments',
  'holidays',
  'quotas',
  'audit',
  'templates',
  'swaps',
  'userAccess',
  'availabilityRequests',
  'workingHoursPeriods',
]);

function validateCollection(req: Request, res: Response): CollectionName | null {
  const collection = req.params.collection as CollectionName;
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    res.status(400).json({ error: 'BadRequest', message: `Invalid collection: ${collection}` });
    return null;
  }
  return collection;
}

// 1. List all documents in a collection
crudRouter.get('/data/:collection', async (req: Request, res: Response) => {
  const collection = validateCollection(req, res);
  if (!collection) return;

  try {
    const repo = getServerRepository();
    const { field, op, val } = req.query;

    let filter: { field: string; operator: '==' | '!='; value: any } | undefined;
    if (field && op && val !== undefined) {
      filter = {
        field: String(field),
        operator: op === '!=' ? '!=' : '==',
        value: val,
      };
    }

    const items = await repo.list(collection, filter);
    res.json({ status: 'ok', count: items.length, data: items });
  } catch (err: any) {
    console.error(`[CrudAPI] GET /api/data/${collection} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// 2. Get a single document by ID
crudRouter.get('/data/:collection/:id', async (req: Request, res: Response) => {
  const collection = validateCollection(req, res);
  if (!collection) return;

  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const item = await repo.get(collection, id);

    if (!item) {
      res.status(404).json({ error: 'NotFound', message: `Document ${id} in ${collection} not found.` });
      return;
    }

    res.json({ status: 'ok', data: item });
  } catch (err: any) {
    console.error(`[CrudAPI] GET /api/data/${collection}/${req.params.id} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// 3. Create a new document
crudRouter.post('/data/:collection', async (req: Request, res: Response) => {
  const collection = validateCollection(req, res);
  if (!collection) return;

  try {
    const repo = getServerRepository();
    const created = await repo.create(collection, req.body);
    res.status(201).json({ status: 'ok', data: created });
  } catch (err: any) {
    console.error(`[CrudAPI] POST /api/data/${collection} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// 4. Bulk upsert documents
crudRouter.post('/data/:collection/bulk-upsert', async (req: Request, res: Response) => {
  const collection = validateCollection(req, res);
  if (!collection) return;

  try {
    const { items = [] } = req.body;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'BadRequest', message: 'items must be an array.' });
      return;
    }

    const repo = getServerRepository();
    await repo.bulkUpsert(collection, items);
    res.json({ status: 'ok', count: items.length });
  } catch (err: any) {
    console.error(`[CrudAPI] POST /api/data/${collection}/bulk-upsert error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// 5. Bulk remove documents
crudRouter.post('/data/:collection/bulk-remove', async (req: Request, res: Response) => {
  const collection = validateCollection(req, res);
  if (!collection) return;

  try {
    const { ids = [] } = req.body;
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: 'BadRequest', message: 'ids must be an array.' });
      return;
    }

    const repo = getServerRepository();
    await repo.bulkRemove(collection, ids);
    res.json({ status: 'ok', count: ids.length });
  } catch (err: any) {
    console.error(`[CrudAPI] POST /api/data/${collection}/bulk-remove error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// 6. Update an existing document
crudRouter.put('/data/:collection/:id', async (req: Request, res: Response) => {
  const collection = validateCollection(req, res);
  if (!collection) return;

  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const updated = await repo.update(collection, id, req.body);
    res.json({ status: 'ok', data: updated });
  } catch (err: any) {
    console.error(`[CrudAPI] PUT /api/data/${collection}/${req.params.id} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// 7. Delete a document
crudRouter.delete('/data/:collection/:id', async (req: Request, res: Response) => {
  const collection = validateCollection(req, res);
  if (!collection) return;

  try {
    const { id } = req.params;
    const repo = getServerRepository();
    await repo.remove(collection, id);
    res.json({ status: 'ok', message: `Deleted ${id} from ${collection}` });
  } catch (err: any) {
    console.error(`[CrudAPI] DELETE /api/data/${collection}/${req.params.id} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// 8. Clear collection
crudRouter.delete('/data/:collection', async (req: Request, res: Response) => {
  const collection = validateCollection(req, res);
  if (!collection) return;

  try {
    const repo = getServerRepository();
    await repo.clearCollection(collection);
    res.json({ status: 'ok', message: `Cleared collection ${collection}` });
  } catch (err: any) {
    console.error(`[CrudAPI] DELETE /api/data/${collection} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});
