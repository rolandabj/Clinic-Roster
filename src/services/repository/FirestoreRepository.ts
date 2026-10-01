/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Cloud Firestore Repository Implementation
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { CollectionName, EntityForCollection } from '../../types';
import { IRepository, SubscribeCallback, Unsubscribe } from './IRepository';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

function sanitizePayload(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map(sanitizePayload).filter((item) => item !== undefined);
  }
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        clean[key] = sanitizePayload(val);
      }
    }
    return clean;
  }
  return obj;
}

export class FirestoreRepository implements IRepository {
  private db: Firestore;
  private app: FirebaseApp;

  constructor(config: FirebaseClientConfig) {
    if (!getApps().length) {
      this.app = initializeApp(config);
    } else {
      this.app = getApp();
    }
    const dbId = config.firestoreDatabaseId;
    if (dbId && dbId !== '(default)') {
      this.db = getFirestore(this.app, dbId);
    } else {
      this.db = getFirestore(this.app);
    }
  }

  async list<T extends CollectionName>(
    colName: T,
    filter?: { field: string; operator: '==' | '!='; value: any }
  ): Promise<EntityForCollection<T>[]> {
    const colRef = collection(this.db, colName);
    const q = filter ? query(colRef, where(filter.field, filter.operator, filter.value)) : query(colRef);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as EntityForCollection<T>));
  }

  async get<T extends CollectionName>(
    colName: T,
    id: string
  ): Promise<EntityForCollection<T> | null> {
    const docRef = doc(this.db, colName, id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as EntityForCollection<T>;
  }

  async create<T extends CollectionName>(
    colName: T,
    data: Omit<EntityForCollection<T>, 'id'> & { id?: string }
  ): Promise<EntityForCollection<T>> {
    const docId = data.id || uuidv4();
    const docRef = doc(this.db, colName, docId);
    const entity = sanitizePayload({ ...data, id: docId }) as EntityForCollection<T>;
    await setDoc(docRef, entity);
    return entity;
  }

  async update<T extends CollectionName>(
    colName: T,
    id: string,
    data: Partial<EntityForCollection<T>>
  ): Promise<EntityForCollection<T>> {
    const docRef = doc(this.db, colName, id);
    const cleanData = sanitizePayload(data);
    await setDoc(docRef, cleanData, { merge: true });
    const snap = await getDoc(docRef);
    return { id: snap.id, ...snap.data() } as EntityForCollection<T>;
  }

  async remove<T extends CollectionName>(
    colName: T,
    id: string
  ): Promise<void> {
    const docRef = doc(this.db, colName, id);
    await deleteDoc(docRef);
  }

  async bulkUpsert<T extends CollectionName>(
    colName: T,
    items: EntityForCollection<T>[]
  ): Promise<void> {
    const batch = writeBatch(this.db);
    for (const item of items) {
      const docRef = doc(this.db, colName, (item as any).id);
      batch.set(docRef, sanitizePayload(item), { merge: true });
    }
    await batch.commit();
  }

  async bulkRemove<T extends CollectionName>(
    colName: T,
    ids: string[]
  ): Promise<void> {
    if (!ids || ids.length === 0) return;
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      const batch = writeBatch(this.db);
      for (const id of chunk) {
        const docRef = doc(this.db, colName, id);
        batch.delete(docRef);
      }
      await batch.commit();
    }
  }

  async clearCollection<T extends CollectionName>(colName: T): Promise<void> {
    const items = await this.list(colName);
    const ids = items.map((item: any) => item?.id).filter(Boolean);
    if (ids.length > 0) {
      await this.bulkRemove(colName, ids);
    }
  }

  subscribe<T extends CollectionName>(
    colName: T,
    callback: SubscribeCallback<EntityForCollection<T>>
  ): Unsubscribe {
    const colRef = collection(this.db, colName);
    return onSnapshot(colRef, (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })) as EntityForCollection<T>[];
      callback(items);
    });
  }
}
