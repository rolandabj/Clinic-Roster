/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Master Admin Access & Role Management Console (Phase 4.1)
 * Accessible exclusively by the Medical Director / System Owner (rolandabj@gmail.com).
 * Manages in-app user whitelist, pending Google account approvals, role assignments,
 * and Manager Approver designations.
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Search,
  Lock,
  Mail,
  UserPlus,
  Check,
  X,
  ChevronDown,
} from 'lucide-react';
import { authService, UserProfile } from '../../services/auth/authService';
import { UserAccessRecord, Nurse, Doctor, UserAccessRole, UserAccessStatus } from '../../types';

interface AccessManagementPanelProps {
  currentUser?: UserProfile;
}

export const AccessManagementPanel: React.FC<AccessManagementPanelProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<UserAccessRecord[]>([]);
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REVOKED'>('ALL');
  const [isBusy, setIsBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Whitelist User Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserAccessRole>('VIEWER');
  const [newIsManager, setNewIsManager] = useState(false);
  const [newLinkedNurseId, setNewLinkedNurseId] = useState('');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchDirectory = async () => {
    setIsLoading(true);
    try {
      const token = authService.getToken();
      const res = await fetch('/api/admin/users', {
        headers: {
          Authorization: `Bearer ${token || 'local-owner'}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load access directory: HTTP ${res.status}`);
      }

      const data = await res.json();
      setUsers(data.users || []);
      setNurses(data.nurses || []);
      setDoctors(data.doctors || []);
    } catch (err: any) {
      console.error('[AccessManagementPanel] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDirectory();
  }, []);

  const handleApproveUser = async (
    email: string,
    appRole: UserAccessRole,
    isManager: boolean,
    linkedNurseId?: string,
    name?: string
  ) => {
    setIsBusy(true);
    try {
      const token = authService.getToken();
      const res = await fetch('/api/admin/users/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || 'local-owner'}`,
        },
        body: JSON.stringify({
          email,
          appRole,
          isManager,
          linkedNurseId,
          name,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to approve user.');

      triggerToast(`Approved access for ${email} as ${appRole} (Manager: ${isManager ? 'Yes' : 'No'})`);
      await fetchDirectory();
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpdateRole = async (
    userId: string,
    updates: Partial<UserAccessRecord>
  ) => {
    setIsBusy(true);
    try {
      const token = authService.getToken();
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || 'local-owner'}`,
        },
        body: JSON.stringify(updates),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to update user.');

      triggerToast('User access and privileges updated successfully.');
      await fetchDirectory();
    } catch (err: any) {
      alert(`Update error: ${err.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRevokeUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to revoke access for ${email}?`)) return;
    setIsBusy(true);
    try {
      const token = authService.getToken();
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token || 'local-owner'}`,
        },
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to revoke user.');

      triggerToast(`Access revoked for ${email}.`);
      await fetchDirectory();
    } catch (err: any) {
      alert(`Revocation error: ${err.message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    await handleApproveUser(
      newEmail.trim().toLowerCase(),
      newRole,
      newIsManager,
      newLinkedNurseId || undefined,
      newName.trim() || undefined
    );
    setIsAddModalOpen(false);
    setNewEmail('');
    setNewName('');
    setNewRole('VIEWER');
    setNewIsManager(false);
    setNewLinkedNurseId('');
  };

  // Pending requests table
  const pendingUsers = users.filter((u) => u.status === 'PENDING');

  // Filtered active users table
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    return u.status === statusFilter;
  });

  return (
    <div className="space-y-6 text-xs">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-indigo-900 text-white p-5 rounded-lg border border-indigo-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-800/80 border border-indigo-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight">Master Administrator Access &amp; Roles Console</h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-800 text-indigo-200 text-[10px] font-mono border border-indigo-700">
                rolandabj@gmail.com
              </span>
            </div>
            <p className="text-indigo-200 text-[11px] mt-0.5 max-w-2xl">
              Sole governance authority for {(typeof window !== 'undefined' ? localStorage.getItem('clinic_roster_clinic_name') : null) || 'American Hospital Nad Al Sheba OutPatient clinic'}. Approve pending Google Workspace logins, designate clinical managers, and delegate roster editing rights.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchDirectory}
            disabled={isLoading || isBusy}
            className="px-3 py-1.5 rounded bg-indigo-800 hover:bg-indigo-700 text-indigo-100 font-medium border border-indigo-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-1.5 rounded bg-white text-indigo-900 hover:bg-indigo-50 font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-indigo-700" />
            <span>Pre-Approve User</span>
          </button>
        </div>
      </div>

      {/* 1. PENDING ACCESS REQUESTS SECTION */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h3 className="font-bold text-slate-900 text-xs">
              Pending Google Account Requests ({pendingUsers.length})
            </h3>
          </div>
          <span className="text-[11px] text-amber-800 font-medium">
            Accounts awaiting your administrator authorization to enter the application
          </span>
        </div>

        {pendingUsers.length === 0 ? (
          <div className="p-4 bg-white/80 border border-amber-200/60 rounded text-center text-slate-500 text-[11px]">
            No pending access requests. All Google sign-ins have been resolved.
          </div>
        ) : (
          <div className="border border-amber-200 rounded overflow-hidden bg-white shadow-2xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-amber-100/60 text-amber-900 font-bold border-b border-amber-200 text-[11px]">
                  <th className="py-2 px-3">Google Identity / Email</th>
                  <th className="py-2 px-3">Requested Name</th>
                  <th className="py-2 px-3">Assign Role</th>
                  <th className="py-2 px-3">Manager Approver?</th>
                  <th className="py-2 px-3">Link Staff Profile</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {pendingUsers.map((pending) => {
                  const matchedNurse = nurses.find(
                    (n) => n.gmail?.toLowerCase() === pending.email.toLowerCase()
                  );
                  return (
                    <tr key={pending.id} className="hover:bg-amber-50/50 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{pending.email}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {pending.id}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {pending.name || matchedNurse?.fullName || 'Google User'}
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          id={`role-select-${pending.id}`}
                          defaultValue={matchedNurse ? 'EDITOR' : 'VIEWER'}
                          className="px-2 py-1 border border-slate-300 rounded bg-white font-medium text-slate-800"
                        >
                          <option value="VIEWER">VIEWER (View-Only)</option>
                          <option value="EDITOR">EDITOR (Roster Planner)</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            id={`manager-check-${pending.id}`}
                            defaultChecked={false}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-[11px] font-medium text-slate-700">Designate Manager</span>
                        </label>
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          id={`nurse-select-${pending.id}`}
                          defaultValue={matchedNurse?.id || ''}
                          className="px-2 py-1 border border-slate-300 rounded bg-white text-slate-800 max-w-[180px] truncate"
                        >
                          <option value="">-- Unlinked Staff --</option>
                          {nurses.map((nurse) => (
                            <option key={nurse.id} value={nurse.id}>
                              {nurse.fullName} ({nurse.employeeCode})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => {
                            const roleEl = document.getElementById(`role-select-${pending.id}`) as HTMLSelectElement;
                            const mgrEl = document.getElementById(`manager-check-${pending.id}`) as HTMLInputElement;
                            const nurseEl = document.getElementById(`nurse-select-${pending.id}`) as HTMLSelectElement;
                            handleApproveUser(
                              pending.email,
                              roleEl.value as UserAccessRole,
                              mgrEl.checked,
                              nurseEl.value || undefined,
                              pending.name
                            );
                          }}
                          disabled={isBusy}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve Access</span>
                        </button>
                        <button
                          onClick={() => handleRevokeUser(pending.id, pending.email)}
                          disabled={isBusy}
                          className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. ACTIVE USER WHITELIST & ROLES TABLE */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-600" />
              <span>Institutional User Whitelist &amp; Role Directory ({users.length})</span>
            </h3>
            <p className="text-slate-500 text-[11px] mt-0.5">
              Configure in-app capabilities, roster editing authority, and leave/availability approval permissions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search staff by name or email..."
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none w-56 text-[11px]"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-700 font-medium text-[11px]"
            >
              <option value="ALL">All Statuses</option>
              <option value="APPROVED">Approved Only</option>
              <option value="PENDING">Pending Only</option>
              <option value="REVOKED">Revoked Only</option>
            </select>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                <th className="py-2.5 px-3">User / Google Email</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Roster Role</th>
                <th className="py-2.5 px-3">Manager Approver?</th>
                <th className="py-2.5 px-3">Linked Nurse Profile</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((user) => {
                const isMasterAdmin = user.email.toLowerCase() === 'rolandabj@gmail.com';
                const linkedNurse = nurses.find((n) => n.id === user.linkedNurseId);

                return (
                  <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* User Info */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                          {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="overflow-hidden min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 truncate">{user.name || user.email.split('@')[0]}</span>
                            {isMasterAdmin && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                MASTER ADMIN
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono block truncate">{user.email}</span>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3">
                      {user.status === 'APPROVED' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>APPROVED</span>
                        </span>
                      )}
                      {user.status === 'PENDING' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3 h-3" />
                          <span>PENDING</span>
                        </span>
                      )}
                      {user.status === 'REVOKED' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <UserX className="w-3 h-3" />
                          <span>REVOKED</span>
                        </span>
                      )}
                    </td>

                    {/* Roster Role */}
                    <td className="py-3 px-3">
                      {isMasterAdmin ? (
                        <span className="font-bold text-indigo-700 font-mono text-[11px]">OWNER / EDITOR</span>
                      ) : (
                        <select
                          value={user.appRole || 'VIEWER'}
                          onChange={(e) =>
                            handleUpdateRole(user.id, { appRole: e.target.value as UserAccessRole })
                          }
                          disabled={isBusy}
                          className="px-2 py-1 border border-slate-300 rounded bg-white text-slate-800 font-medium focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="VIEWER">VIEWER (View-Only)</option>
                          <option value="EDITOR">EDITOR (Roster Planner)</option>
                        </select>
                      )}
                    </td>

                    {/* Manager Approver */}
                    <td className="py-3 px-3">
                      {isMasterAdmin ? (
                        <span className="font-bold text-emerald-700">Permanent Approver ✓</span>
                      ) : (
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={user.isManager === true}
                            onChange={(e) =>
                              handleUpdateRole(user.id, { isManager: e.target.checked })
                            }
                            disabled={isBusy}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className={`text-[11px] font-medium ${user.isManager ? 'text-indigo-700 font-bold' : 'text-slate-600'}`}>
                            {user.isManager ? 'Manager / Charge Approver' : 'Standard Staff'}
                          </span>
                        </label>
                      )}
                    </td>

                    {/* Linked Nurse Profile */}
                    <td className="py-3 px-3">
                      {isMasterAdmin ? (
                        <span className="text-slate-400 italic">N/A (Clinical Director)</span>
                      ) : (
                        <select
                          value={user.linkedNurseId || ''}
                          onChange={(e) =>
                            handleUpdateRole(user.id, { linkedNurseId: e.target.value || undefined })
                          }
                          disabled={isBusy}
                          className="px-2 py-1 border border-slate-300 rounded bg-white text-slate-800 max-w-[180px] truncate"
                        >
                          <option value="">-- No Nurse Linked --</option>
                          {nurses.map((nurse) => (
                            <option key={nurse.id} value={nurse.id}>
                              {nurse.fullName} ({nurse.employeeCode})
                            </option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right space-x-1.5">
                      {isMasterAdmin ? (
                        <span className="text-slate-400 text-[10px] font-mono">Protected</span>
                      ) : (
                        <>
                          {user.status === 'REVOKED' ? (
                            <button
                              onClick={() => handleUpdateRole(user.id, { status: 'APPROVED' })}
                              disabled={isBusy}
                              className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Restore Access</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRevokeUser(user.id, user.email)}
                              disabled={isBusy}
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>Revoke</span>
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. PRE-APPROVE USER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden text-xs">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Pre-Approve Institutional User</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddUserSubmit} className="p-5 space-y-4">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Google Workspace / Gmail Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="nurse.name@gmail.com"
                  required
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Staff Member Full Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Fatima Al-Zahra"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Roster Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserAccessRole)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs"
                  >
                    <option value="VIEWER">VIEWER (View-Only)</option>
                    <option value="EDITOR">EDITOR (Roster Planner)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Link Nurse Profile</label>
                  <select
                    value={newLinkedNurseId}
                    onChange={(e) => setNewLinkedNurseId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white text-xs"
                  >
                    <option value="">-- Optional --</option>
                    {nurses.map((nurse) => (
                      <option key={nurse.id} value={nurse.id}>
                        {nurse.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 p-2.5 rounded bg-indigo-50/60 border border-indigo-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsManager}
                    onChange={(e) => setNewIsManager(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="font-bold text-indigo-900 block">Designate as Manager / Approver</span>
                    <span className="text-[10px] text-indigo-700">
                      Allows this user to approve nurse shift availability and leave requests.
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Pre-Approve &amp; Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
