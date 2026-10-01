/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server-side File-Backed JSON Store
 * High-performance, atomic persistence for all 24 ClinicRoster collections.
 * Uses atomic tmp-file rename to guarantee zero data corruption on restart.
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CollectionName, EntityForCollection } from '../../src/types';
import { IRepository, SubscribeCallback, Unsubscribe } from '../../src/services/repository/IRepository';

export const ALL_COLLECTIONS: CollectionName[] = [
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
  'systemMetadata',
];

export class JsonFileRepository implements IRepository {
  private baseDir: string;
  private cache: Map<CollectionName, Map<string, any>> = new Map();
  private subscribers: Map<CollectionName, Set<SubscribeCallback<any>>> = new Map();
  private writeQueues: Map<CollectionName, Promise<void>> = new Map();
  private isLoaded: boolean = false;

  constructor(dataDirectory: string = path.resolve(process.cwd(), 'data', 'db')) {
    this.baseDir = dataDirectory;
    this.ensureDirectory();
    this.loadAll();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getFilePath(collection: CollectionName): string {
    return path.join(this.baseDir, `${collection}.json`);
  }

  private loadAll(): void {
    for (const col of ALL_COLLECTIONS) {
      const colMap = new Map<string, any>();
      const filePath = this.getFilePath(col);
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data: any[] = JSON.parse(raw);
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item && item.id) {
                colMap.set(item.id, item);
              }
            }
          }
        } catch (err) {
          console.error(`[JsonStore] Error reading file for collection ${col}:`, err);
        }
      }
      this.cache.set(col, colMap);
      this.subscribers.set(col, new Set());
    }
    this.isLoaded = true;
  }

  private getCollectionMap(col: CollectionName): Map<string, any> {
    if (!this.cache.has(col)) {
      this.cache.set(col, new Map());
      this.subscribers.set(col, new Set());
    }
    return this.cache.get(col)!;
  }

  /**
   * Atomic file persistence using .tmp write and atomic file rename
   */
  private async persistCollection(collection: CollectionName): Promise<void> {
    const colMap = this.getCollectionMap(collection);
    const data = Array.from(colMap.values());
    const filePath = this.getFilePath(collection);
    const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;

    // Queue writes per collection to prevent race conditions
    const currentQueue = this.writeQueues.get(collection) || Promise.resolve();

    const writeOperation = currentQueue.then(async () => {
      try {
        const json = JSON.stringify(data, null, 2);
        await fs.promises.writeFile(tmpPath, json, 'utf-8');
        await fs.promises.rename(tmpPath, filePath);
      } catch (err) {
        console.error(`[JsonStore] Failed to write collection ${collection}:`, err);
        if (fs.existsSync(tmpPath)) {
          try {
            await fs.promises.unlink(tmpPath);
          } catch {
            // ignore
          }
        }
      }
    });

    this.writeQueues.set(collection, writeOperation);
    await writeOperation;
  }

  private notify(collection: CollectionName): void {
    const subs = this.subscribers.get(collection);
    if (!subs || subs.size === 0) return;
    const items = Array.from(this.getCollectionMap(collection).values());
    for (const cb of subs) {
      try {
        cb(items);
      } catch (e) {
        console.error(`[JsonStore] Subscriber notification error for ${collection}:`, e);
      }
    }
  }

  public async list<T extends CollectionName>(
    collection: T,
    filter?: { field: string; operator: '==' | '!='; value: any }
  ): Promise<EntityForCollection<T>[]> {
    const colMap = this.getCollectionMap(collection);
    let items = Array.from(colMap.values()) as EntityForCollection<T>[];

    if (filter) {
      items = items.filter((item: any) => {
        const val = item[filter.field];
        if (filter.operator === '==') return val === filter.value;
        if (filter.operator === '!=') return val !== filter.value;
        return true;
      });
    }

    return items;
  }

  public async get<T extends CollectionName>(
    collection: T,
    id: string
  ): Promise<EntityForCollection<T> | null> {
    const colMap = this.getCollectionMap(collection);
    const item = colMap.get(id);
    return item ? (item as EntityForCollection<T>) : null;
  }

  public async create<T extends CollectionName>(
    collection: T,
    data: Omit<EntityForCollection<T>, 'id'> & { id?: string }
  ): Promise<EntityForCollection<T>> {
    const colMap = this.getCollectionMap(collection);
    const id = data.id || `${collection.slice(0, 3)}-${uuidv4()}`;
    const record = { ...data, id } as EntityForCollection<T>;
    colMap.set(id, record);
    await this.persistCollection(collection);
    this.notify(collection);
    return record;
  }

  public async update<T extends CollectionName>(
    collection: T,
    id: string,
    data: Partial<EntityForCollection<T>>
  ): Promise<EntityForCollection<T>> {
    const colMap = this.getCollectionMap(collection);
    const existing = colMap.get(id);
    if (!existing) {
      throw new Error(`Record with id ${id} not found in collection ${collection}`);
    }
    const updated = { ...existing, ...data, id } as EntityForCollection<T>;
    colMap.set(id, updated);
    await this.persistCollection(collection);
    this.notify(collection);
    return updated;
  }

  public async remove<T extends CollectionName>(
    collection: T,
    id: string
  ): Promise<void> {
    const colMap = this.getCollectionMap(collection);
    if (colMap.delete(id)) {
      await this.persistCollection(collection);
      this.notify(collection);
    }
  }

  public async bulkUpsert<T extends CollectionName>(
    collection: T,
    items: EntityForCollection<T>[]
  ): Promise<void> {
    if (!items || items.length === 0) return;
    const colMap = this.getCollectionMap(collection);
    for (const item of items) {
      const id = (item as any).id || `${collection.slice(0, 3)}-${uuidv4()}`;
      colMap.set(id, { ...item, id });
    }
    await this.persistCollection(collection);
    this.notify(collection);
  }

  public async bulkRemove<T extends CollectionName>(
    collection: T,
    ids: string[]
  ): Promise<void> {
    if (!ids || ids.length === 0) return;
    const colMap = this.getCollectionMap(collection);
    let changed = false;
    for (const id of ids) {
      if (colMap.delete(id)) {
        changed = true;
      }
    }
    if (changed) {
      await this.persistCollection(collection);
      this.notify(collection);
    }
  }

  public async clearCollection<T extends CollectionName>(collection: T): Promise<void> {
    const colMap = this.getCollectionMap(collection);
    colMap.clear();
    await this.persistCollection(collection);
    this.notify(collection);
  }

  public subscribe<T extends CollectionName>(
    collection: T,
    callback: SubscribeCallback<EntityForCollection<T>>
  ): Unsubscribe {
    let subs = this.subscribers.get(collection);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(collection, subs);
    }
    subs.add(callback);
    // Initial call
    callback(Array.from(this.getCollectionMap(collection).values()));

    return () => {
      subs?.delete(callback);
    };
  }

  /**
   * Helper to retrieve counts across all collections for diagnostics and stats
   */
  public getCounts(): Record<CollectionName, number> {
    const counts = {} as Record<CollectionName, number>;
    for (const col of ALL_COLLECTIONS) {
      counts[col] = this.getCollectionMap(col).size;
    }
    return counts;
  }

  /**
   * Retrieve storage and database metrics for health observability
   */
  public async getStorageStats(): Promise<{
    storageDirectory: string;
    totalSizeBytes: number;
    totalSizeReadable: string;
    collectionsCount: number;
    totalDocuments: number;
    collections: Record<string, { documents: number; sizeBytes: number }>;
  }> {
    let totalSizeBytes = 0;
    let totalDocuments = 0;
    const collectionsDetail: Record<string, { documents: number; sizeBytes: number }> = {};

    for (const col of ALL_COLLECTIONS) {
      const docCount = this.getCollectionMap(col).size;
      totalDocuments += docCount;
      const filePath = this.getFilePath(col);
      let size = 0;
      try {
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          size = stat.size;
          totalSizeBytes += size;
        }
      } catch {
        // ignore
      }
      collectionsDetail[col] = {
        documents: docCount,
        sizeBytes: size,
      };
    }

    const kb = (totalSizeBytes / 1024).toFixed(2);
    return {
      storageDirectory: this.baseDir,
      totalSizeBytes,
      totalSizeReadable: `${kb} KB`,
      collectionsCount: ALL_COLLECTIONS.length,
      totalDocuments,
      collections: collectionsDetail,
    };
  }
}
