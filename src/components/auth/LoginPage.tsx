/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Dedicated Clinical Login Portal
 * Provides an exclusive, distraction-free Google Workspace SSO authentication gate
 * for Al Shifa Outpatient Clinic.
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  Loader2,
  Lock,
  Building2,
} from 'lucide-react';
import { authService, UserProfile } from '../../services/auth/authService';

interface LoginPageProps {
  onLoginSuccess?: (user: UserProfile) => void;
  clinicName?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, clinicName }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>(
    () => {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('clinic_roster_clinic_name') : null;
      if (clinicName && clinicName !== 'Hope Valley Polyclinic' && clinicName !== 'Outpatient Clinic') return clinicName;
      if (stored && stored !== 'Hope Valley Polyclinic' && stored !== 'Outpatient Clinic') return stored;
      return 'American Hospital Nad Al Sheba OutPatient clinic';
    }
  );

  React.useEffect(() => {
    if (clinicName) {
      setDisplayName(clinicName);
      return;
    }
    fetch('/api/clinic')
      .then((r) => r.json())
      .then((data) => {
        if (data.data?.name) {
          setDisplayName(data.data.name);
          if (typeof window !== 'undefined') {
            localStorage.setItem('clinic_roster_clinic_name', data.data.name);
          }
        }
      })
      .catch(() => {});
  }, [clinicName]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const user = await authService.signInWithGoogle();
      if (onLoginSuccess) {
        onLoginSuccess(user);
      }
    } catch (err: any) {
      setErrorMessage(
        err.message || 'Google Workspace authentication failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center p-4 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-slate-100 select-none">
      {/* Background Decorative Rings */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl" />
      </div>

      {/* Main Authentication Card */}
      <div className="relative z-10 w-full max-w-md bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6">
        {/* Clinic Branding Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 mb-2 shadow-inner">
            <Building2 className="w-7 h-7" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {displayName}
          </h1>
          <p className="text-xs text-indigo-300/80 font-medium tracking-wide uppercase">
            Clinical Roster &amp; Staff Scheduling System
          </p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed pt-1">
            Sign in with your authorized Google Workspace account.
          </p>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs space-y-2.5 animate-in fade-in">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">
                <span>{errorMessage}</span>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-rose-400 hover:text-rose-200 text-xs font-bold px-1 cursor-pointer"
                aria-label="Dismiss alert"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Primary Action: Single Google Workspace SSO Button */}
        <div className="space-y-3 pt-1">
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3 px-4 bg-white hover:bg-slate-100 text-slate-800 font-semibold text-sm rounded-xl border border-slate-300 shadow-md flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group active:scale-[0.99]"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                <span className="text-slate-700">Connecting Google Workspace...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </>
            )}
          </button>
        </div>

        {/* Security Note */}
        <div className="text-center pt-2 border-t border-slate-800/60">
          <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-slate-600" />
            <span>Encrypted HIPAA/GDPR-compliant token verification.</span>
          </p>
        </div>
      </div>

      {/* Footer System Status */}
      <div className="mt-6 text-center text-xs text-slate-500">
        <span>{displayName} · Production Roster Portal</span>
      </div>
    </div>
  );
};
