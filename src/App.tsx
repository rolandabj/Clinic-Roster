/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Root Application Gate (Phase 3)
 * Enforces strict authentication requirement: users must log in before accessing
 * any clinical rosters, scheduling sheets, or management views.
 */

import React, { useEffect, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './components/auth/LoginPage';
import { authService, UserProfile } from './services/auth/authService';
import { Building2, Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authService.getCurrentUser());
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(!authService.isInitialized());
  const [clinicName, setClinicName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('clinic_roster_clinic_name');
      if (stored && stored !== 'Hope Valley Polyclinic' && stored !== 'Outpatient Clinic') {
        return stored;
      }
    }
    return 'American Hospital Nad Al Sheba OutPatient clinic';
  });

  // Check if current URL is an external shared link (e.g., token-based public roster share)
  const isPublicShareLink = (): boolean => {
    if (typeof window === 'undefined') return false;
    const search = window.location.search;
    const hash = window.location.hash;
    return search.includes('token=') || hash.includes('token=') || hash.startsWith('#published');
  };

  useEffect(() => {
    // 1. Await initial session validation from /api/auth/me
    authService.whenReady().then((user) => {
      setCurrentUser(user);
      setIsAuthChecking(false);
    });

    // 2. Subscribe to reactive auth updates (e.g. login, logout, token refresh)
    const unsub = authService.subscribe((user) => {
      setCurrentUser(user);
    });

    // 3. Fetch public clinic metadata
    fetch('/api/clinic')
      .then((r) => r.json())
      .then((data) => {
        if (data.data?.name) {
          const resolved =
            data.data.name === 'Hope Valley Polyclinic'
              ? 'American Hospital Nad Al Sheba OutPatient clinic'
              : data.data.name;
          setClinicName(resolved);
          if (typeof window !== 'undefined') {
            localStorage.setItem('clinic_roster_clinic_name', resolved);
            document.title = `${resolved} — Clinical Roster`;
          }
        }
      })
      .catch(() => {});

    const handleClinicNameUpdated = (e: any) => {
      if (e.detail) {
        setClinicName(e.detail);
      }
    };
    window.addEventListener('clinic-name-updated', handleClinicNameUpdated);

    return () => {
      window.removeEventListener('clinic-name-updated', handleClinicNameUpdated);
      unsub();
    };
  }, []);

  // 1. Splash Screen while checking initial credentials
  if (isAuthChecking) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-slate-100 select-none">
        <div className="flex flex-col items-center space-y-4 animate-in fade-in duration-200">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
            <Building2 className="w-7 h-7" />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-base font-bold text-white tracking-tight">
              {clinicName}
            </h1>
            <p className="text-xs text-slate-400">Verifying clinic credentials...</p>
          </div>
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500 mt-2" />
        </div>
      </div>
    );
  }

  // 2. If unauthenticated and not viewing a public shared roster link: strictly render LoginPage
  if (!currentUser && !isPublicShareLink()) {
    return <LoginPage clinicName={clinicName} onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  // 3. Authenticated session (or verified public token view): render AppShell
  return <AppShell currentUser={currentUser} />;
}


