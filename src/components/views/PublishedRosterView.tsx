/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Read-Only Published Roster Page (Phase 12)
 * Mobile & Desktop Responsive, Block Navigation, Nurse Filters & Personal Link Support.
 */

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  User,
  Shield,
  Layers,
  Clock,
  Printer,
  Sparkles,
  Lock,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Share2,
  Copy,
  Check,
} from 'lucide-react';
import {
  Schedule,
  ScheduleVersion,
  Assignment,
  Nurse,
  DutyWindow,
  LeaveEntry,
  LeaveType,
  SeniorityLevel,
  Doctor,
  ClinicalRole,
  Specialty,
  ShareLink,
} from '../../types';
import { getRepository } from '../../services/repository';
import { authService, UserProfile } from '../../services/auth/authService';

interface PublishedRosterViewProps {
  shareToken?: string;
  nurseIdParam?: string;
  onExitPreview?: () => void;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const PublishedRosterView: React.FC<PublishedRosterViewProps> = ({
  shareToken,
  nurseIdParam,
  onExitPreview,
}) => {
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [version, setVersion] = useState<ScheduleVersion | null>(null);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);

  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [dutyWindows, setDutyWindows] = useState<DutyWindow[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [seniorityLevels, setSeniorityLevels] = useState<SeniorityLevel[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [roles, setClinicalRoles] = useState<ClinicalRole[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);

  // Navigation & Filtering
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);
  const [selectedNurseFilter, setSelectedNurseFilter] = useState<string>(nurseIdParam || 'ALL');
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const currentUser = authService.getCurrentUser();
  const repo = getRepository();

  useEffect(() => {
    async function loadPublishedRoster() {
      setLoading(true);
      try {
        const [
          schedList,
          vList,
          linkList,
          nList,
          dwList,
          ltList,
          sList,
          dList,
          rList,
          spList,
        ] = await Promise.all([
          repo.list('schedules'),
          repo.list('versions'),
          repo.list('shareLinks'),
          repo.list('nurses'),
          repo.list('dutyWindows'),
          repo.list('leaveTypes'),
          repo.list('seniorityLevels'),
          repo.list('doctors'),
          repo.list('clinicalRoles'),
          repo.list('specialties'),
        ]);

        setNurses(nList.filter((n) => n.active));
        setDutyWindows(dwList);
        setLeaveTypes(ltList);
        setSeniorityLevels(sList);
        setDoctors(dList);
        setClinicalRoles(rList);
        setSpecialties(spList);

        // Find share link if token passed
        let targetVersion: ScheduleVersion | null = null;
        let targetSchedule: Schedule | null = null;

        if (shareToken) {
          const matchedLink = linkList.find((l) => l.token === shareToken);
          if (matchedLink) {
            setShareLink(matchedLink);
            if (matchedLink.revoked) {
              setAccessDeniedMessage('This share link has been revoked by the schedule administrator.');
              setLoading(false);
              return;
            }

            // Check restricted allowed emails
            if (!matchedLink.public && matchedLink.allowedEmails.length > 0) {
              const userEmail = (currentUser?.email || '').toLowerCase();
              const isAllowed = matchedLink.allowedEmails.some((e) => e.toLowerCase() === userEmail);
              if (!isAllowed) {
                setAccessDeniedMessage(
                  `Access Restricted: This schedule is shared only with authorized staff. Current account (${userEmail || 'Guest'}) is not on the allowed list.`
                );
                setLoading(false);
                return;
              }
            }

            targetVersion = vList.find((v) => v.id === matchedLink.pointsToVersionId) || null;
            targetSchedule = schedList.find((s) => s.id === matchedLink.scheduleId) || null;
          }
        }

        // Fallback: pick the latest published version across schedules
        if (!targetVersion) {
          const publishedVersions = vList.filter((v) => v.isPublished);
          if (publishedVersions.length > 0) {
            publishedVersions.sort((a, b) => b.number - a.number);
            targetVersion = publishedVersions[0];
            targetSchedule = schedList.find((s) => s.id === targetVersion?.scheduleId) || null;
          } else if (vList.length > 0) {
            targetVersion = vList[0];
            targetSchedule = schedList.find((s) => s.id === targetVersion?.scheduleId) || null;
          }
        }

        if (targetSchedule && targetVersion) {
          setSchedule(targetSchedule);
          setVersion(targetVersion);
        }

        if (nurseIdParam) {
          setSelectedNurseFilter(nurseIdParam);
        }
      } catch (err: any) {
        console.error('Error loading published roster:', err);
      } finally {
        setLoading(false);
      }
    }

    loadPublishedRoster();
  }, [shareToken, nurseIdParam]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-slate-500 text-xs">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="font-semibold">Loading official published schedule...</p>
        </div>
      </div>
    );
  }

  if (accessDeniedMessage) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-6 shadow-xl space-y-4 text-center">
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-600 leading-relaxed">{accessDeniedMessage}</p>
          {onExitPreview && (
            <button
              onClick={onExitPreview}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold"
            >
              Return to Workspace
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!schedule || !version) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-6 shadow-xl space-y-4 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
          <h2 className="text-base font-bold text-slate-900">No Published Schedule Found</h2>
          <p className="text-xs text-slate-600">
            A published version of this roster has not yet been released.
          </p>
          {onExitPreview && (
            <button
              onClick={onExitPreview}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold"
            >
              Return to Workspace
            </button>
          )}
        </div>
      </div>
    );
  }

  const dutyMap = new Map(dutyWindows.map((d) => [d.id, d]));
  const nurseMap = new Map(nurses.map((n) => [n.id, n]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const specialtyMap = new Map(specialties.map((s) => [s.id, s]));
  const seniorityMap = new Map(seniorityLevels.map((s) => [s.id, s]));
  const leaveTypeMap = new Map(leaveTypes.map((l) => [l.id, l]));

  const assignments = version.snapshot.assignments || [];
  const leaveEntries = version.snapshot.leaveEntries || [];

  // Compute block dates
  const blockWeeks = schedule.blockWeeks || 2;
  const daysPerBlock = blockWeeks * 7;
  const start = new Date(schedule.startDate);
  const end = new Date(schedule.endDate);
  const totalDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const totalBlocks = Math.ceil(totalDays / daysPerBlock);

  const currentBlockStartDay = selectedBlockIndex * daysPerBlock + 1;
  const currentBlockEndDay = Math.min((selectedBlockIndex + 1) * daysPerBlock, totalDays);

  const blockDates: string[] = [];
  for (let day = currentBlockStartDay; day <= currentBlockEndDay; day++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + (day - 1));
    blockDates.push(d.toISOString().split('T')[0]);
  }

  // Filter nurses
  const displayedNurses =
    selectedNurseFilter === 'ALL'
      ? nurses
      : nurses.filter((n) => n.id === selectedNurseFilter);

  // Copy personal link for selected nurse
  const handleCopyPersonalNurseLink = (nurseId: string) => {
    const origin = window.location.origin;
    const token = shareToken || (shareLink ? shareLink.token : 'preview');
    const url = `${origin}/#published?token=${token}&nurse=${nurseId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans select-none text-slate-800">
      {/* Top Banner / Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onExitPreview && (
              <button
                onClick={onExitPreview}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Exit Preview</span>
              </button>
            )}

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 tracking-tight">
                  {schedule.name}
                </h1>
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold font-mono text-[10px]">
                  PUBLISHED v{version.number}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                Official Roster: {schedule.startDate} to {schedule.endDate} · Published {new Date(version.timestamp).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Right Controls: Staff Filter & Block Navigation */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Filter by Nurse */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 border border-slate-200 rounded">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedNurseFilter}
                onChange={(e) => setSelectedNurseFilter(e.target.value)}
                className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Nursing Staff ({nurses.length})</option>
                {nurses.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName} ({n.employeeCode})
                  </option>
                ))}
              </select>
            </div>

            {/* Block switcher */}
            {totalBlocks > 1 && (
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded p-0.5">
                <button
                  disabled={selectedBlockIndex === 0}
                  onClick={() => setSelectedBlockIndex((p) => p - 1)}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono font-bold text-[11px] text-slate-700">
                  Block {selectedBlockIndex + 1}/{totalBlocks}
                </span>
                <button
                  disabled={selectedBlockIndex >= totalBlocks - 1}
                  onClick={() => setSelectedBlockIndex((p) => p + 1)}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Personal link copier if nurse is filtered */}
            {selectedNurseFilter !== 'ALL' && (
              <button
                onClick={() => handleCopyPersonalNurseLink(selectedNurseFilter)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-semibold rounded text-xs transition-colors cursor-pointer"
                title="Copy direct link to this nurse's personal roster"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Copied!' : 'Personal Link'}</span>
              </button>
            )}

            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded font-medium cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-4">
        {/* Personal Filter Alert Header if viewing single nurse */}
        {selectedNurseFilter !== 'ALL' && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between text-xs text-indigo-900">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-600" />
              <span>
                Showing personalized roster view for{' '}
                <strong>{nurseMap.get(selectedNurseFilter)?.fullName}</strong> (
                {nurseMap.get(selectedNurseFilter)?.employeeCode})
              </span>
            </div>
            <button
              onClick={() => setSelectedNurseFilter('ALL')}
              className="text-indigo-700 hover:underline font-semibold cursor-pointer"
            >
              View Full Team
            </button>
          </div>
        )}

        {/* The Grid Card */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs font-mono">
              <thead>
                {/* Dates Header Row */}
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                  <th className="py-2.5 px-3 sticky left-0 bg-slate-50 z-10 w-48 border-r border-slate-200">
                    Nursing Staff
                  </th>
                  {blockDates.map((dateStr) => {
                    const dateObj = new Date(dateStr);
                    const weekday = WEEKDAY_NAMES[dateObj.getUTCDay()];
                    const dayNum = dateStr.split('-')[2];
                    const isWeekend = dateObj.getUTCDay() === 0 || dateObj.getUTCDay() === 6;

                    return (
                      <th
                        key={dateStr}
                        className={`py-2 px-1 text-center min-w-[70px] border-r border-slate-100 ${
                          isWeekend ? 'bg-slate-100 text-slate-800' : ''
                        }`}
                      >
                        <div className="text-[10px] text-slate-400 uppercase">{weekday}</div>
                        <div className="font-bold text-xs">{dayNum}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedNurses.map((nurse) => {
                  const seniority = seniorityMap.get(nurse.seniorityLevelId);

                  return (
                    <tr key={nurse.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Sticky Nurse Column */}
                      <td className="py-2 px-3 sticky left-0 bg-white z-10 border-r border-slate-200 shadow-xs">
                        <div className="font-sans font-bold text-slate-900 truncate">
                          {nurse.fullName}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5">
                          <span>{nurse.employeeCode}</span>
                          <span>·</span>
                          <span>{seniority?.name || 'Staff'}</span>
                        </div>
                      </td>

                      {/* Day Assignment Cells */}
                      {blockDates.map((dateStr) => {
                        const asgn = assignments.find(
                          (a) => a.nurseId === nurse.id && a.date === dateStr
                        );
                        const leave = leaveEntries.find(
                          (le) =>
                            le.nurseId === nurse.id &&
                            le.approved &&
                            dateStr >= le.startDate &&
                            dateStr <= le.endDate
                        );

                        if (leave) {
                          const lt = leaveTypeMap.get(leave.leaveTypeId);
                          return (
                            <td
                              key={dateStr}
                              className="p-1 text-center border-r border-slate-100 bg-amber-50/80"
                            >
                              <div className="font-bold text-amber-800 text-[11px]">
                                {lt?.acronym || 'L'}
                              </div>
                              <div className="text-[9px] text-amber-700 truncate">
                                {lt?.name || 'Leave'}
                              </div>
                            </td>
                          );
                        }

                        if (asgn) {
                          const duty = dutyMap.get(asgn.dutyWindowId);
                          let targetName = '';
                          if (asgn.doctorId) {
                            targetName = doctorMap.get(asgn.doctorId)?.fullName.replace('Dr. ', '') || 'Doctor';
                          } else if (asgn.clinicalRoleId) {
                            targetName = roleMap.get(asgn.clinicalRoleId)?.acronym || 'PHL';
                          } else if (asgn.specialtyId) {
                            targetName = specialtyMap.get(asgn.specialtyId)?.code || 'POOL';
                          }

                          return (
                            <td
                              key={dateStr}
                              className="p-1 text-center border-r border-slate-100"
                            >
                              <div
                                className="inline-block px-1.5 py-0.5 rounded text-white font-bold text-[10px]"
                                style={{ backgroundColor: duty?.color || '#3b82f6' }}
                              >
                                {duty?.acronym || 'D'}
                              </div>
                              <div className="text-[9px] text-slate-600 truncate mt-0.5 max-w-[66px] mx-auto font-sans">
                                {targetName}
                              </div>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={dateStr}
                            className="p-1 text-center border-r border-slate-100 text-slate-300"
                          >
                            —
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend Drawer Footer */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
          <div className="flex items-center gap-2 font-bold text-slate-800">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>Roster Acronyms &amp; Duty Legend</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Duties */}
            <div className="space-y-1.5">
              <span className="font-semibold text-slate-600 text-[11px] block">Duty Windows:</span>
              <div className="space-y-1 font-mono text-[11px]">
                {dutyWindows.map((dw) => (
                  <div key={dw.id} className="flex items-center gap-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-white font-bold text-[10px]"
                      style={{ backgroundColor: dw.color }}
                    >
                      {dw.acronym}
                    </span>
                    <span className="font-sans font-medium text-slate-800">{dw.name}</span>
                    <span className="text-slate-400">({dw.startTime}–{dw.endTime})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Leave Types */}
            <div className="space-y-1.5">
              <span className="font-semibold text-slate-600 text-[11px] block">Approved Leave:</span>
              <div className="space-y-1 font-mono text-[11px]">
                {leaveTypes.map((lt) => (
                  <div key={lt.id} className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                      {lt.acronym}
                    </span>
                    <span className="font-sans font-medium text-slate-800">{lt.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Support Roles */}
            <div className="space-y-1.5">
              <span className="font-semibold text-slate-600 text-[11px] block">Clinical Roles:</span>
              <div className="space-y-1 font-mono text-[11px]">
                {roles.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">
                      {r.acronym}
                    </span>
                    <span className="font-sans font-medium text-slate-800">{r.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-slate-400 text-[11px] font-mono">
        <span>ClinicRoster Outpatient Shift Scheduling · Verified Official Snapshot</span>
      </footer>
    </div>
  );
};
