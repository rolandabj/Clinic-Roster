/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ApiRepository: Backend REST API implementation of IRepository
 * Forwards CRUD operations to /api/data/:collection and synchronizes with local subscribers.
 */

import { CollectionName, EntityForCollection } from '../../types';
import { IRepository, SubscribeCallback, Unsubscribe } from './IRepository';
import { authService } from '../auth/authService';

export class ApiRepository implements IRepository {
  private baseUrl: string;
  private listeners: Map<string, Set<SubscribeCallback<any>>> = new Map();

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private getAuthHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 1. Primary: In-memory verified Bearer token from AuthService
    const bearerToken = authService.getBearerToken();
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
      return headers;
    }

    // 2. Secondary: Saved session token fallback
    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem('clinic_auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  private notifyListeners<T extends CollectionName>(collection: T): void {
    const subs = this.listeners.get(collection);
    if (!subs || subs.size === 0) return;

    // Fetch refreshed collection and notify active UI subscribers
    this.list(collection)
      .then((items) => {
        subs.forEach((cb) => {
          try {
            cb(items);
          } catch (e) {
            console.error(`[ApiRepository] Subscriber error in ${collection}:`, e);
          }
        });
      })
      .catch((err) => {
        console.warn(`[ApiRepository] Failed to notify subscribers for ${collection}:`, err);
      });
  }

  public async list<T extends CollectionName>(
    collection: T,
    filter?: { field: string; operator: '==' | '!='; value: any }
  ): Promise<EntityForCollection<T>[]> {
    let url = `${this.baseUrl}/data/${collection}`;
    if (filter) {
      const params = new URLSearchParams({
        field: filter.field,
        op: filter.operator,
        val: String(filter.value),
      });
      url += `?${params.toString()}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `Failed to fetch collection ${collection}`);
    }

    const json = await res.json();
    return (json.data || []) as EntityForCollection<T>[];
  }

  public async get<T extends CollectionName>(
    collection: T,
    id: string
  ): Promise<EntityForCollection<T> | null> {
    const res = await fetch(`${this.baseUrl}/data/${collection}/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `Failed to fetch document ${id} from ${collection}`);
    }

    const json = await res.json();
    return json.data as EntityForCollection<T>;
  }

  public async create<T extends CollectionName>(
    collection: T,
    data: Omit<EntityForCollection<T>, 'id'> & { id?: string }
  ): Promise<EntityForCollection<T>> {
    const res = await fetch(`${this.baseUrl}/data/${collection}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `Failed to create document in ${collection}`);
    }

    const json = await res.json();
    const created = json.data as EntityForCollection<T>;
    this.notifyListeners(collection);
    return created;
  }

  public async update<T extends CollectionName>(
    collection: T,
    id: string,
    data: Partial<EntityForCollection<T>>
  ): Promise<EntityForCollection<T>> {
    const res = await fetch(`${this.baseUrl}/data/${collection}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `Failed to update document ${id} in ${collection}`);
    }

    const json = await res.json();
    const updated = json.data as EntityForCollection<T>;
    this.notifyListeners(collection);
    return updated;
  }

  public async remove<T extends CollectionName>(
    collection: T,
    id: string
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/data/${collection}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `Failed to remove document ${id} from ${collection}`);
    }

    this.notifyListeners(collection);
  }

  public async bulkUpsert<T extends CollectionName>(
    collection: T,
    items: EntityForCollection<T>[]
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/data/${collection}/bulk-upsert`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ items }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `Failed to bulk upsert into ${collection}`);
    }

    this.notifyListeners(collection);
  }

  public async bulkRemove<T extends CollectionName>(
    collection: T,
    ids: string[]
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/data/${collection}/bulk-remove`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ ids }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `Failed to bulk remove from ${collection}`);
    }

    this.notifyListeners(collection);
  }

  public async clearCollection<T extends CollectionName>(
    collection: T
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/data/${collection}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `Failed to clear collection ${collection}`);
    }

    this.notifyListeners(collection);
  }

  public subscribe<T extends CollectionName>(
    collection: T,
    callback: SubscribeCallback<EntityForCollection<T>>
  ): Unsubscribe {
    if (!this.listeners.has(collection)) {
      this.listeners.set(collection, new Set());
    }
    const set = this.listeners.get(collection)!;
    set.add(callback);

    // Initial immediate dispatch
    this.list(collection)
      .then((items) => {
        if (set.has(callback)) {
          callback(items);
        }
      })
      .catch((err) => {
        console.warn(`[ApiRepository] Initial subscribe list failed for ${collection}:`, err);
      });

    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(collection);
      }
    };
  }

  // ==========================================
  // Backend Extended Solver & Workflow APIs
  // ==========================================

  public async generateSchedule(scheduleId: string, options: any = {}) {
    const res = await fetch(`${this.baseUrl}/schedules/${scheduleId}/generate`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(options),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Schedule generation failed');
    this.notifyListeners('assignments');
    return json;
  }

  public async validateSchedule(scheduleId: string, options: any = {}) {
    const res = await fetch(`${this.baseUrl}/schedules/${scheduleId}/validate`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(options),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Schedule validation failed');
    return json;
  }

  public async publishSchedule(scheduleId: string, note?: string) {
    const res = await fetch(`${this.baseUrl}/schedules/${scheduleId}/publish`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ note }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Schedule publish failed');
    this.notifyListeners('schedules');
    this.notifyListeners('versions');
    this.notifyListeners('acknowledgments');
    return json;
  }

  public async rollbackSchedule(scheduleId: string, versionId: string) {
    const res = await fetch(`${this.baseUrl}/schedules/${scheduleId}/versions/${versionId}/rollback`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Schedule rollback failed');
    this.notifyListeners('schedules');
    this.notifyListeners('assignments');
    return json;
  }

  public async executeShiftSwap(payload: any) {
    const res = await fetch(`${this.baseUrl}/roster/swap`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Shift swap failed');
    this.notifyListeners('assignments');
    this.notifyListeners('swaps');
    return json;
  }

  public async acknowledgeRoster(payload: { token?: string; scheduleId?: string; nurseId?: string }) {
    const res = await fetch(`${this.baseUrl}/roster/acknowledge`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Roster acknowledgment failed');
    this.notifyListeners('acknowledgments');
    return json;
  }

  public async clearAllServerData(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/admin/clear`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to clear server database');
    return json;
  }

  public async reseedServerData(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/admin/reseed`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'Failed to reseed server database');
    return json;
  }
}
