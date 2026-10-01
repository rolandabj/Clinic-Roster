/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * LocalStorage Repository Implementation
 */

import { v4 as uuidv4 } from 'uuid';
import { CollectionName, EntityForCollection } from '../../types';
import { IRepository, SubscribeCallback, Unsubscribe } from './IRepository';

const STORAGE_PREFIX = 'clinic_roster_db_';
const memoryStore = new Map<string, string>();

function safeGetItem(key: string): string | null {
  if (typeof localStorage !== 'undefined') {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) {
        memoryStore.set(key, val);
        return val;
      }
    } catch (e) {
      console.warn(`[LocalStorageRepository] Error reading localStorage key "${key}":`, e);
    }
  }
  return memoryStore.get(key) || null;
}

function safeSetItem(key: string, value: string): void {
  memoryStore.set(key, value);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[LocalStorageRepository] Error writing localStorage key "${key}", kept in memory fallback:`, e);
    }
  }
}

export class LocalStorageRepository implements IRepository {
  private listeners: Map<string, Set<SubscribeCallback<any>>> = new Map();

  private getKey(collection: CollectionName): string {
    return `${STORAGE_PREFIX}${collection}`;
  }

  private readRaw<T>(collection: CollectionName): T[] {
    try {
      const raw = safeGetItem(this.getKey(collection));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      // Deduplicate by item.id if present
      const seen = new Set<string>();
      const deduped: T[] = [];
      for (const item of parsed) {
        const id = (item as any)?.id;
        if (id) {
          if (!seen.has(id)) {
            seen.add(id);
            deduped.push(item);
          }
        } else {
          deduped.push(item);
        }
      }
      return deduped;
    } catch (e) {
      console.error(`Error reading collection ${collection} from localStorage:`, e);
      return [];
    }
  }

  private writeRaw<T>(collection: CollectionName, items: T[]): void {
    try {
      // Ensure deduplication before saving
      const seen = new Set<string>();
      const deduped: T[] = [];
      for (const item of items) {
        const id = (item as any)?.id;
        if (id) {
          if (!seen.has(id)) {
            seen.add(id);
            deduped.push(item);
          }
        } else {
          deduped.push(item);
        }
      }

      safeSetItem(this.getKey(collection), JSON.stringify(deduped));
      this.notifyListeners(collection, deduped);
    } catch (e) {
      console.error(`Error writing collection ${collection} to localStorage:`, e);
      throw e;
    }
  }

  private notifyListeners(collection: CollectionName, items: any[]): void {
    const subs = this.listeners.get(collection);
    if (subs) {
      subs.forEach((cb) => {
        try {
          cb(items);
        } catch (err) {
          console.error(`Error in subscriber callback for ${collection}:`, err);
        }
      });
    }
  }

  async list<T extends CollectionName>(
    collection: T,
    filter?: { field: string; operator: '==' | '!='; value: any }
  ): Promise<EntityForCollection<T>[]> {
    const items = this.readRaw<EntityForCollection<T>>(collection);
    if (!filter) return items;

    return items.filter((item: any) => {
      if (filter.operator === '==') {
        return item[filter.field] === filter.value;
      } else if (filter.operator === '!=') {
        return item[filter.field] !== filter.value;
      }
      return true;
    });
  }

  async get<T extends CollectionName>(
    collection: T,
    id: string
  ): Promise<EntityForCollection<T> | null> {
    const items = this.readRaw<EntityForCollection<T>>(collection);
    const found = items.find((item: any) => item.id === id);
    return found || null;
  }

  async create<T extends CollectionName>(
    collection: T,
    data: Omit<EntityForCollection<T>, 'id'> & { id?: string }
  ): Promise<EntityForCollection<T>> {
    const items = this.readRaw<EntityForCollection<T>>(collection);
    const targetId = data.id || uuidv4();
    const newEntity = {
      ...data,
      id: targetId,
    } as EntityForCollection<T>;

    const existingIndex = items.findIndex((item: any) => item.id === targetId);
    if (existingIndex >= 0) {
      items[existingIndex] = newEntity;
    } else {
      items.push(newEntity);
    }

    this.writeRaw(collection, items);
    return newEntity;
  }

  async update<T extends CollectionName>(
    collection: T,
    id: string,
    data: Partial<EntityForCollection<T>>
  ): Promise<EntityForCollection<T>> {
    const items = this.readRaw<EntityForCollection<T>>(collection);
    const index = items.findIndex((item: any) => item.id === id);
    if (index === -1) {
      throw new Error(`Item with id "${id}" not found in collection "${collection}"`);
    }

    const updated = {
      ...items[index],
      ...data,
      id, // ensure ID is preserved
    };

    items[index] = updated;
    this.writeRaw(collection, items);
    return updated;
  }

  async remove<T extends CollectionName>(
    collection: T,
    id: string
  ): Promise<void> {
    const items = this.readRaw<EntityForCollection<T>>(collection);
    const filtered = items.filter((item: any) => item.id !== id);
    this.writeRaw(collection, filtered);
  }

  async bulkUpsert<T extends CollectionName>(
    collection: T,
    newItems: EntityForCollection<T>[]
  ): Promise<void> {
    const items = this.readRaw<EntityForCollection<T>>(collection);
    const itemMap = new Map<string, EntityForCollection<T>>();

    items.forEach((item: any) => itemMap.set(item.id, item));
    newItems.forEach((item: any) => itemMap.set(item.id, item));

    const merged = Array.from(itemMap.values());
    this.writeRaw(collection, merged);
  }

  async bulkRemove<T extends CollectionName>(
    collection: T,
    ids: string[]
  ): Promise<void> {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    const items = this.readRaw<EntityForCollection<T>>(collection);
    const filtered = items.filter((item: any) => !idSet.has(item.id));
    this.writeRaw(collection, filtered);
  }

  async clearCollection<T extends CollectionName>(collection: T): Promise<void> {
    this.writeRaw(collection, []);
  }

  subscribe<T extends CollectionName>(
    collection: T,
    callback: SubscribeCallback<EntityForCollection<T>>
  ): Unsubscribe {
    if (!this.listeners.has(collection)) {
      this.listeners.set(collection, new Set());
    }

    const set = this.listeners.get(collection)!;
    set.add(callback);

    // Initial immediate invocation
    const current = this.readRaw<EntityForCollection<T>>(collection);
    callback(current);

    return () => {
      set.delete(callback);
    };
  }
}
