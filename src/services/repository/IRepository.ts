/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Repository Interface (Async CRUD + Subscribe) for LocalStorage and Cloud Firestore
 */

import { CollectionName, EntityForCollection } from '../../types';

export type Unsubscribe = () => void;
export type SubscribeCallback<T> = (items: T[]) => void;

export interface IRepository {
  /**
   * List all documents in a collection, optionally filtered by field equality
   */
  list<T extends CollectionName>(
    collection: T,
    filter?: { field: string; operator: '==' | '!='; value: any }
  ): Promise<EntityForCollection<T>[]>;

  /**
   * Get a single document by ID
   */
  get<T extends CollectionName>(
    collection: T,
    id: string
  ): Promise<EntityForCollection<T> | null>;

  /**
   * Create a new document. If id is omitted, one is generated.
   */
  create<T extends CollectionName>(
    collection: T,
    data: Omit<EntityForCollection<T>, 'id'> & { id?: string }
  ): Promise<EntityForCollection<T>>;

  /**
   * Update an existing document by ID
   */
  update<T extends CollectionName>(
    collection: T,
    id: string,
    data: Partial<EntityForCollection<T>>
  ): Promise<EntityForCollection<T>>;

  /**
   * Remove a document by ID
   */
  remove<T extends CollectionName>(
    collection: T,
    id: string
  ): Promise<void>;

  /**
   * Bulk insert/upsert documents
   */
  bulkUpsert<T extends CollectionName>(
    collection: T,
    items: EntityForCollection<T>[]
  ): Promise<void>;

  /**
   * Bulk remove documents by ID
   */
  bulkRemove<T extends CollectionName>(
    collection: T,
    ids: string[]
  ): Promise<void>;

  /**
   * Clear all documents in a collection (used for reset/tests)
   */
  clearCollection<T extends CollectionName>(
    collection: T
  ): Promise<void>;

  /**
   * Subscribe to real-time changes in a collection
   */
  subscribe<T extends CollectionName>(
    collection: T,
    callback: SubscribeCallback<EntityForCollection<T>>
  ): Unsubscribe;
}
