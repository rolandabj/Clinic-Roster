/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Repository Provider Singleton & Storage Mode Manager
 */

import { IRepository } from './IRepository';
import { LocalStorageRepository } from './LocalStorageRepository';
import { FirestoreRepository, FirebaseClientConfig } from './FirestoreRepository';
import { ApiRepository } from './apiRepository';
import { defaultFirebaseConfig } from '../firebase/firebaseConfig';

export { ApiRepository } from './apiRepository';
export { LocalStorageRepository } from './LocalStorageRepository';
export { FirestoreRepository } from './FirestoreRepository';

const FIREBASE_CONFIG_KEY = 'clinic_roster_firebase_config';

export type StorageMode = 'SERVER_API' | 'FIRESTORE' | 'LOCAL_STORAGE';

class RepositoryManager {
  private activeRepo: IRepository;
  private mode: StorageMode = 'FIRESTORE';

  constructor() {
    const savedConfig = this.getStoredFirebaseConfig() || defaultFirebaseConfig;
    if (savedConfig && savedConfig.apiKey && savedConfig.projectId) {
      try {
        this.activeRepo = new FirestoreRepository(savedConfig);
        this.mode = 'FIRESTORE';
      } catch (err) {
        console.warn('Failed to initialize Firestore repository, falling back to Server API:', err);
        this.activeRepo = new ApiRepository('/api');
        this.mode = 'SERVER_API';
      }
    } else {
      // Default to Server API backed by Express + database
      this.activeRepo = new ApiRepository('/api');
      this.mode = 'SERVER_API';
    }
  }

  public getRepo(): IRepository {
    return this.activeRepo;
  }

  public getApiRepo(): ApiRepository | null {
    return this.activeRepo instanceof ApiRepository ? this.activeRepo : null;
  }

  public getMode(): StorageMode {
    return this.mode;
  }

  public getIsCloudMode(): boolean {
    return this.mode === 'FIRESTORE';
  }

  public getIsApiMode(): boolean {
    return this.mode === 'SERVER_API';
  }

  public getStoredFirebaseConfig(): FirebaseClientConfig | null {
    try {
      const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public saveFirebaseConfig(config: FirebaseClientConfig | null): void {
    if (config) {
      localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
      try {
        this.activeRepo = new FirestoreRepository(config);
        this.mode = 'FIRESTORE';
      } catch (err) {
        console.error('Error switching to Firestore:', err);
        throw err;
      }
    } else {
      localStorage.removeItem(FIREBASE_CONFIG_KEY);
      this.activeRepo = new ApiRepository('/api');
      this.mode = 'SERVER_API';
    }
  }

  public switchToLocalStorage(): void {
    this.activeRepo = new LocalStorageRepository();
    this.mode = 'LOCAL_STORAGE';
  }

  public switchToServerApi(): void {
    this.activeRepo = new ApiRepository('/api');
    this.mode = 'SERVER_API';
  }
}

export const repositoryManager = new RepositoryManager();
export const getRepository = (): IRepository => repositoryManager.getRepo();

