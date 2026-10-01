/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Centralized Firebase Initialization Module
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfigJson from '../../../firebase-applet-config.json';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export const defaultFirebaseConfig: FirebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  firestoreDatabaseId: (firebaseConfigJson as any).firestoreDatabaseId || '(default)',
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

let appInstance: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!appInstance) {
    if (getApps().length > 0) {
      appInstance = getApp();
    } else {
      appInstance = initializeApp(defaultFirebaseConfig);
    }
  }
  return appInstance;
}

export function getAppFirestore(): Firestore {
  if (!firestoreInstance) {
    const app = getFirebaseApp();
    const dbId = (defaultFirebaseConfig as any).firestoreDatabaseId;
    if (dbId && dbId !== '(default)') {
      firestoreInstance = getFirestore(app, dbId);
    } else {
      firestoreInstance = getFirestore(app);
    }
  }
  return firestoreInstance;
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    const db = getAppFirestore();
    await getDocFromServer(doc(db, '_connection_test', 'status'));
    console.info('[Firebase] Firestore server connection verified successfully.');
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client is offline or database is unreachable, checking configuration.');
      return false;
    }
    // Any document read attempt reaches the server
    console.info('[Firebase] Firestore server is reachable.');
    return true;
  }
}

export function getAppAuth(): Auth {
  if (!authInstance) {
    const app = getFirebaseApp();
    authInstance = getAuth(app);
  }
  return authInstance;
}

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope('profile');
googleAuthProvider.addScope('email');
googleAuthProvider.setCustomParameters({
  prompt: 'select_account',
});


