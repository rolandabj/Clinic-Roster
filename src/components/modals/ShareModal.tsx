/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Schedule Sharing & Editor Invitations Dialog (Phase 12)
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Globe,
  Lock,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  Mail,
  UserPlus,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  Schedule,
  ScheduleVersion,
  ShareLink,
  Invitation,
} from '../../types';
import { getRepository } from '../../services/repository';

interface ShareModalProps {
  schedule: Schedule;
  latestPublishedVersion: ScheduleVersion | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenPreview: (token: string) => void;
}

type TabType = 'view_links' | 'invite_editors';

export const ShareModal: React.FC<ShareModalProps> = ({
  schedule,
  latestPublishedVersion,
  isOpen,
  onClose,
  onOpenPreview,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('view_links');
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  // New link state
  const [isPublic, setIsPublic] = useState(true);
  const [allowedEmailsInput, setAllowedEmailsInput] = useState('');

  // New invitation state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');

  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const repo = getRepository();

  const loadData = async () => {
    try {
      const [links, invites] = await Promise.all([
        repo.list('shareLinks'),
        repo.list('invitations'),
      ]);
      setShareLinks(links.filter((l) => l.scheduleId === schedule.id));
      setInvitations(invites.filter((i) => i.scheduleId === schedule.id));
    } catch (err) {
      console.error('Error loading share links:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, schedule.id]);

  if (!isOpen) return null;

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // --- CREATE VIEW-ONLY LINK ---
  const handleCreateShareLink = async () => {
    if (!latestPublishedVersion) {
      alert('You must publish at least one version before creating a view-only share link. Draft changes are kept private.');
      return;
    }

    try {
      const emails = allowedEmailsInput
        .split(/[,\n]/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && e.includes('@'));

      const newLink: ShareLink = {
        id: uuidv4(),
        scheduleId: schedule.id,
        token: Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 8),
        role: 'VIEWER',
        public: isPublic,
        allowedEmails: isPublic ? [] : emails,
        createdAt: new Date().toISOString(),
        revoked: false,
        pointsToVersionId: latestPublishedVersion.id,
      };

      await repo.create('shareLinks', newLink);
      triggerToast('View-only link created.');
      setAllowedEmailsInput('');
      loadData();
    } catch (err: any) {
      alert(`Failed to create share link: ${err.message}`);
    }
  };

  // --- REGENERATE TOKEN ---
  const handleRegenerateToken = async (link: ShareLink) => {
    const newToken = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 8);
    await repo.update('shareLinks', link.id, {
      token: newToken,
      revoked: false,
    });
    triggerToast('Access token regenerated.');
    loadData();
  };

  // --- REVOKE / UNREVOKE LINK ---
  const handleToggleRevoke = async (link: ShareLink) => {
    await repo.update('shareLinks', link.id, {
      revoked: !link.revoked,
    });
    triggerToast(link.revoked ? 'Link restored.' : 'Link revoked.');
    loadData();
  };

  // --- DELETE LINK ---
  const handleDeleteLink = async (linkId: string) => {
    await repo.remove('shareLinks', linkId);
    triggerToast('Share link removed.');
    loadData();
  };

  // --- COPY LINK ---
  const handleCopyLink = (token: string) => {
    const origin = window.location.origin;
    const url = `${origin}/#published?token=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
    triggerToast('Share link copied to clipboard.');
  };

  // --- INVITE EDITOR / VIEWER ---
  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      alert('Please enter a valid Gmail address.');
      return;
    }

    try {
      const newInvite: Invitation = {
        id: uuidv4(),
        scheduleId: schedule.id,
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      await repo.create('invitations', newInvite);
      triggerToast(`Invitation sent to ${newInvite.email}.`);
      setInviteEmail('');
      loadData();
    } catch (err: any) {
      alert(`Failed to send invitation: ${err.message}`);
    }
  };

  const handleResendInvitation = (inv: Invitation) => {
    triggerToast(`Invitation re-sent to ${inv.email}.`);
  };

  const handleRemoveInvitation = async (invId: string) => {
    await repo.remove('invitations', invId);
    triggerToast('Invitation removed.');
    loadData();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
        {/* Toast */}
        {toastMessage && (
          <div className="fixed top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded shadow-lg flex items-center gap-2 animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Share &amp; Collaborate</h2>
              </div>
              <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                {schedule.name} · Role-based access control &amp; immutable published links
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 border-b border-slate-200 flex items-center gap-6 bg-white text-xs">
          <button
            onClick={() => setActiveTab('view_links')}
            className={`py-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'view_links'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>View-Only Links ({shareLinks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('invite_editors')}
            className={`py-3 font-semibold transition-colors flex items-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'invite_editors'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Editors &amp; Collaborators ({invitations.length})</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: VIEW-ONLY SHARE LINKS */}
          {activeTab === 'view_links' && (
            <div className="space-y-4">
              {/* Informational Banner */}
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded text-indigo-900 space-y-1 text-[11px]">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>Published Snapshot Privacy Guarantee:</span>
                </div>
                <p>
                  Share links point exclusively to the <strong>published version</strong> (
                  {latestPublishedVersion ? `v${latestPublishedVersion.number}` : 'none published yet'}
                  ). In-progress draft changes are completely invisible to external viewers until an explicit Publish action occurs.
                </p>
              </div>

              {/* Create New Link Section */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <h3 className="font-bold text-slate-900 text-xs">Create New View-Only Link</h3>

                <div className="space-y-2">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="accessMode"
                        checked={isPublic}
                        onChange={() => setIsPublic(true)}
                        className="text-indigo-600"
                      />
                      <span className="font-medium text-slate-800">Public Link</span>
                      <span className="text-[10px] text-slate-400">(Anyone with link can view)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="accessMode"
                        checked={!isPublic}
                        onChange={() => setIsPublic(false)}
                        className="text-indigo-600"
                      />
                      <span className="font-medium text-slate-800">Restricted Link</span>
                      <span className="text-[10px] text-slate-400">(Specific Google accounts only)</span>
                    </label>
                  </div>

                  {!isPublic && (
                    <div className="space-y-1 pt-1">
                      <label className="block text-[11px] font-semibold text-slate-700">
                        Allowed Gmail Addresses (comma or line separated):
                      </label>
                      <textarea
                        rows={2}
                        value={allowedEmailsInput}
                        onChange={(e) => setAllowedEmailsInput(e.target.value)}
                        placeholder="nurse.mariam@gmail.com, doctor.ali@gmail.com"
                        className="w-full p-2 border border-slate-300 rounded font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end">
                  <button
                    onClick={handleCreateShareLink}
                    disabled={!latestPublishedVersion}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded font-medium cursor-pointer shadow-xs"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Generate Share Link</span>
                  </button>
                </div>
              </div>

              {/* Existing Links List */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-xs">Active Share Links:</h4>

                {shareLinks.length > 0 ? (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded overflow-hidden">
                    {shareLinks.map((link) => (
                      <div
                        key={link.id}
                        className={`p-3 bg-white space-y-2 ${link.revoked ? 'opacity-50 bg-slate-50' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {link.public ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                                <Globe className="w-3 h-3" /> PUBLIC
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                                <Lock className="w-3 h-3" /> RESTRICTED ({link.allowedEmails.length} emails)
                              </span>
                            )}

                            {link.revoked ? (
                              <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                                REVOKED
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                ACTIVE
                              </span>
                            )}

                            <span className="text-[10px] text-slate-400 font-mono">
                              Created {new Date(link.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {!link.revoked && (
                              <button
                                onClick={() => onOpenPreview(link.token)}
                                className="inline-flex items-center gap-1 px-2 py-1 border border-slate-200 hover:bg-slate-100 text-indigo-700 rounded font-medium text-[11px] cursor-pointer"
                                title="Open read-only published page preview"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Open Preview</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleCopyLink(link.token)}
                              disabled={link.revoked}
                              className="inline-flex items-center gap-1 px-2 py-1 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded font-medium text-[11px] cursor-pointer"
                              title="Copy URL to clipboard"
                            >
                              {copiedToken === link.token ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-500" />
                              )}
                              <span>{copiedToken === link.token ? 'Copied!' : 'Copy Link'}</span>
                            </button>

                            <button
                              onClick={() => handleRegenerateToken(link)}
                              className="p-1 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded cursor-pointer"
                              title="Regenerate token (invalidates old link)"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleToggleRevoke(link)}
                              className="px-2 py-1 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded text-[11px] cursor-pointer"
                              title={link.revoked ? 'Restore access' : 'Temporarily disable link'}
                            >
                              {link.revoked ? 'Un-revoke' : 'Revoke'}
                            </button>

                            <button
                              onClick={() => handleDeleteLink(link.id)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                              title="Delete share link permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* URL snippet */}
                        <div className="font-mono text-[11px] bg-slate-50 p-1.5 rounded text-slate-600 truncate border border-slate-200">
                          {window.location.origin}/#published?token={link.token}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-400 border border-dashed border-slate-200 rounded">
                    No share links created yet. Click "Generate Share Link" above.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: INVITE EDITORS & COLLABORATORS */}
          {activeTab === 'invite_editors' && (
            <div className="space-y-4">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded text-purple-900 space-y-1 text-[11px]">
                <p className="font-bold">Team Collaboration &amp; Permissions:</p>
                <p>
                  <strong>Editors</strong> can edit assignments, adjust leave, and rebalance the roster. However, final publishing to live staff remains restricted to the Schedule <strong>Owner</strong>.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSendInvitation} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <h3 className="font-bold text-slate-900 text-xs">Invite Colleague by Email</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <input
                      type="email"
                      required
                      placeholder="colleague.email@gmail.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded font-medium focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-medium bg-white"
                    >
                      <option value="EDITOR">Editor (Can edit roster)</option>
                      <option value="VIEWER">Viewer (View-only)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium cursor-pointer shadow-xs"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Send Invitation</span>
                  </button>
                </div>
              </form>

              {/* Invitations List */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-xs">Pending &amp; Active Invitations:</h4>
                {invitations.length > 0 ? (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded overflow-hidden">
                    {invitations.map((inv) => (
                      <div key={inv.id} className="p-3 bg-white flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{inv.email}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                inv.role === 'EDITOR'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {inv.role}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                              {inv.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-mono">
                            Invited on {new Date(inv.createdAt).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleResendInvitation(inv)}
                            className="px-2 py-1 border border-slate-200 hover:bg-slate-100 rounded text-slate-700 text-[11px] font-medium cursor-pointer"
                          >
                            Resend
                          </button>
                          <button
                            onClick={() => handleRemoveInvitation(inv.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                            title="Remove invitation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-400 border border-dashed border-slate-200 rounded">
                    No colleagues invited yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            Security: Cloud Firestore rules enforce role boundaries
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
