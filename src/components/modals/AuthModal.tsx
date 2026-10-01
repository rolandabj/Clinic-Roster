/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Authentication & Profile Manager Modal (Sub-Phase 4.4)
 * Supports Google Identity SSO with Firebase Auth, auto-exchange with /api/auth/google-exchange,
 * granted permissions breakdown, session status indicators, and 1-click test personas.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  LogIn,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  Users,
  Settings,
  AlertCircle,
  Sparkles,
  User,
  Key,
  Lock,
  CalendarCheck,
  Cpu,
  RefreshCw,
  FileSpreadsheet,
  Check,
  ChevronRight,
  Shield,
  Activity,
} from 'lucide-react';
import { ClinicContextState } from '../../types/navigation';
import { authService, UserProfile, UserPrivileges, MASTER_ADMIN_EMAIL } from '../../services/auth/authService';
import { UserRole } from '../../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: ClinicContextState;
  onNavigateToSettings: () => void;
  onUserChanged?: (user: UserProfile | null) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  context,
  onNavigateToSettings,
  onUserChanged,
}) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authService.getCurrentUser());

  useEffect(() => {
    const unsub = authService.subscribe((user) => {
      setCurrentUser(user);
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  const handleSignOut = async () => {
    onClose();
    await authService.signOut();
  };

  const tokenState = authService.getTokenState();

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'OWNER':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300';
      case 'PLANNER':
        return 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950 dark:text-teal-300';
      case 'EDITOR':
        return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300';
      case 'STAFF':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300';
      case 'VIEWER':
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  const privs: UserPrivileges = currentUser?.privileges || {
    canEditClinicSettings: currentUser?.role === 'OWNER',
    canCreateSchedules: currentUser?.role === 'OWNER' || currentUser?.role === 'PLANNER',
    canPublishSchedules: currentUser?.role === 'OWNER' || currentUser?.role === 'PLANNER',
    canRunSolver: currentUser?.role === 'OWNER' || currentUser?.role === 'PLANNER',
    canEditRosterAssignments:
      currentUser?.role === 'OWNER' || currentUser?.role === 'PLANNER' || currentUser?.role === 'EDITOR',
    canApproveSwaps: currentUser?.role === 'OWNER' || currentUser?.role === 'PLANNER' || !!currentUser?.isManager,
    canApproveLeave: currentUser?.role === 'OWNER' || !!currentUser?.isManager,
    canApproveAvailability: currentUser?.role === 'OWNER' || !!currentUser?.isManager,
    canRequestSwaps: currentUser?.role !== 'VIEWER',
    canAcknowledgeShifts: currentUser?.role !== 'VIEWER',
    canViewSchedules: true,
    canExportReports: currentUser?.role !== 'VIEWER',
    canManageStaff: currentUser?.role === 'OWNER',
    canConfigureWebhooks: currentUser?.role === 'OWNER',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full overflow-hidden text-xs">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold">
              <Shield className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Clinic Identity &amp; RBAC Access</h2>
              <p className="text-[10px] text-slate-400 font-mono">
                GOOGLE WORKSPACE SSO · DIRECTORY ROLES · TEST PERSONAS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* If Account is Pending Approval by rolandabj@gmail.com */}
          {currentUser && currentUser.accessStatus === 'PENDING' && (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-lg space-y-3 animate-in fade-in">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-amber-900">
                    Account Registration Pending Approval
                  </h3>
                  <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                    Welcome, <strong>{currentUser.name}</strong>. Your Google account (
                    <strong>{currentUser.email}</strong>) has been registered in the clinic system and is currently pending authorization by the Medical Director (
                    <strong>rolandabj@gmail.com</strong>).
                  </p>
                </div>
              </div>

              <div className="p-2.5 bg-amber-100/60 rounded border border-amber-200 text-[11px] text-amber-900 flex items-center justify-between">
                <span>Once approved by Roland, your role and assigned nurse profile will activate immediately.</span>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/auth/directory/test-match', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: currentUser?.email }),
                      });
                      const data = await res.json();
                      if (data.accessStatus === 'APPROVED') {
                        window.location.reload();
                      } else {
                        alert('Your account is still pending approval by rolandabj@gmail.com.');
                      }
                    } catch {
                      alert('Could not verify status. Please check your network connection.');
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer transition-colors shadow-2xs"
                >
                  Check Status ↻
                </button>
              </div>
            </div>
          )}

          {/* If Account Access is Revoked */}
          {currentUser && currentUser.accessStatus === 'REVOKED' && (
            <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Account Access Revoked</span>
              </div>
              <p className="text-[11px] text-rose-700">
                Access for <strong>{currentUser.email}</strong> was revoked by the Medical Director (<strong>rolandabj@gmail.com</strong>).
              </p>
            </div>
          )}

          {/* Active Session Identity Card */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-500" /> Active Session:
              </span>
              <span
                className={`px-2 py-0.5 rounded font-bold font-mono text-[10px] border ${getRoleBadgeColor(
                  currentUser?.role || 'VIEWER'
                )}`}
              >
                ROLE: {currentUser ? currentUser.role : 'NOT SIGNED IN'}
              </span>
            </div>

            {currentUser ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="overflow-hidden flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-slate-900 dark:text-white truncate text-xs">{currentUser.name}</p>
                    {currentUser.nurseCode && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {currentUser.nurseCode}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 font-mono text-[11px] truncate">{currentUser.email}</p>
                  {currentUser.seniorityName && (
                    <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                      {currentUser.seniorityName}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-2 text-center text-slate-500 dark:text-slate-400 text-xs">
                No active clinical session. Please sign in below.
              </div>
            )}

            {/* In-Memory Bearer Token & Verified Session Status */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Key className="w-3 h-3 text-indigo-500" />
                <span>In-Memory Bearer: </span>
                <strong className={tokenState.hasSessionToken || tokenState.hasIdToken ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
                  {tokenState.hasSessionToken ? 'Active Session Token ✓' : tokenState.hasIdToken ? 'Google ID Token ✓' : 'Unauthenticated'}
                </strong>
              </span>
              {currentUser && (
                <button
                  onClick={handleSignOut}
                  className="text-rose-600 hover:text-rose-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          </div>

          {/* Granted Permissions Breakdown */}
          <div className="p-3 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1.5">
            <span className="font-bold text-slate-800 dark:text-slate-200 block text-[11px] uppercase tracking-wider text-slate-500">
              Granted RBAC Privileges:
            </span>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full flex items-center justify-center text-[9px] ${privs.canPublishSchedules ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {privs.canPublishSchedules ? '✓' : '×'}
                </span>
                <span className={privs.canPublishSchedules ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}>
                  Publish Rosters
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full flex items-center justify-center text-[9px] ${privs.canRunSolver ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {privs.canRunSolver ? '✓' : '×'}
                </span>
                <span className={privs.canRunSolver ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}>
                  CP-SAT Solver
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full flex items-center justify-center text-[9px] ${privs.canApproveSwaps ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {privs.canApproveSwaps ? '✓' : '×'}
                </span>
                <span className={privs.canApproveSwaps ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}>
                  Approve Shift Swaps
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full flex items-center justify-center text-[9px] ${privs.canAcknowledgeShifts ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {privs.canAcknowledgeShifts ? '✓' : '×'}
                </span>
                <span className={privs.canAcknowledgeShifts ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}>
                  Acknowledge Shifts
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full flex items-center justify-center text-[9px] ${privs.canEditClinicSettings ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {privs.canEditClinicSettings ? '✓' : '×'}
                </span>
                <span className={privs.canEditClinicSettings ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}>
                  Clinic Governance
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full flex items-center justify-center text-[9px] ${privs.canConfigureWebhooks ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {privs.canConfigureWebhooks ? '✓' : '×'}
                </span>
                <span className={privs.canConfigureWebhooks ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}>
                  ChatOps Webhooks
                </span>
              </div>
            </div>
          </div>

          {/* Security & Authentication Protocol Note */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 text-[11px] space-y-1">
            <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-500" />
              <span>Enterprise Google Workspace SSO &amp; RBAC</span>
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Clinical permissions and staff identities are securely synchronized via the enterprise clinical directory. Master governance is restricted to <strong>{MASTER_ADMIN_EMAIL}</strong>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={() => {
              onClose();
              onNavigateToSettings();
            }}
            className="text-indigo-600 dark:text-indigo-400 hover:underline text-[11px] font-semibold cursor-pointer flex items-center gap-1"
          >
            <Settings className="w-3 h-3" />
            <span>Enterprise Directory &amp; RBAC in Settings</span>
          </button>

          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded font-medium cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
