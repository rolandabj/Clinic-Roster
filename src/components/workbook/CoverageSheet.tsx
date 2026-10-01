import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Droplets,
  Shield,
  CheckCircle2,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import {
  DoctorSession,
  Assignment,
  DutyWindow,
  ClinicalRole,
  Nurse,
  SeniorityLevel,
} from '../../types';
import { formatDate } from '../../utils/dateUtils';

interface CoverageSheetProps {
  blockDates: string[];
  sessions: DoctorSession[];
  assignments: Assignment[];
  dutyWindows: DutyWindow[];
  roles: ClinicalRole[];
  nurses: Nurse[];
  seniorityLevels: SeniorityLevel[];
}

export const CoverageSheet: React.FC<CoverageSheetProps> = ({
  blockDates,
  sessions,
  assignments,
  dutyWindows,
  roles,
  nurses,
  seniorityLevels,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(blockDates[0] || '2026-10-01');

  const dutyMap = new Map(dutyWindows.map((d) => [d.id, d]));
  const nurseMap = new Map(nurses.map((n) => [n.id, n]));
  const seniorLevelIds = new Set(seniorityLevels.filter((s) => s.isSenior).map((s) => s.id));

  // Compute hourly coverage for selected date
  const hours = Array.from({ length: 14 }, (_, i) => i + 8); // 08:00 to 21:00

  const daySessions = sessions.filter((s) => !s.cancelled && s.date === selectedDate);
  const dayAssignments = assignments.filter((a) => a.date === selectedDate);

  const phlRole = roles.find((r) => r.acronym === 'PHL');
  const phlNursesOnDuty = dayAssignments.filter(
    (a) => a.kind === 'CLINICAL_ROLE' && a.clinicalRoleId === phlRole?.id
  ).length;

  const ncRole = roles.find(
    (r) =>
      r.id === 'role-nurse-clinic' ||
      r.acronym === 'NC' ||
      r.name.toLowerCase().includes('nurse clinic')
  );
  const nurseClinicNursesOnDuty = dayAssignments.filter(
    (a) =>
      a.kind === 'CLINICAL_ROLE' &&
      (a.clinicalRoleId === ncRole?.id || a.note?.toLowerCase().includes('nurse clinic'))
  ).length;

  // Build list of all coverage deficits across all dates in this block
  const allGaps: {
    date: string;
    hour: string;
    doctorsCount: number;
    nursesCount: number;
    deficit: number;
    reason: string;
  }[] = [];

  blockDates.forEach((date) => {
    const dSessions = sessions.filter((s) => !s.cancelled && s.date === date);
    const dAssignments = assignments.filter((a) => a.date === date);

    for (let hour = 8; hour <= 21; hour++) {
      const hourStr = `${String(hour).padStart(2, '0')}:00`;
      const nextHourStr = `${String(hour + 1).padStart(2, '0')}:00`;

      const docsActive = dSessions.filter(
        (s) => s.startTime < nextHourStr && s.endTime > hourStr
      ).length;

      const nursesActive = dAssignments.filter((a) => {
        const duty = dutyMap.get(a.dutyWindowId);
        return duty && duty.startTime < nextHourStr && duty.endTime > hourStr;
      }).length;

      if (docsActive > nursesActive) {
        let reason = 'Short-staffed / Evening coverage tail';
        if (nursesActive === 0) reason = 'No nurses assigned to duty window';
        allGaps.push({
          date,
          hour: hourStr,
          doctorsCount: docsActive,
          nursesCount: nursesActive,
          deficit: docsActive - nursesActive,
          reason,
        });
      }
    }
  });

  return (
    <div className="flex flex-col h-full bg-slate-100 select-none overflow-hidden text-xs">
      {/* Date Selector Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-600" />
          <span className="font-bold text-slate-800">Hourly Clinic Coverage Analysis</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 font-medium">Inspect Date Timeline:</span>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2.5 py-1 border border-slate-300 rounded font-mono font-bold text-xs bg-white text-slate-800 cursor-pointer"
          >
            {blockDates.map((date) => (
              <option key={date} value={date}>
                {formatDate(date)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Coverage Viewport */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Hourly Strip Visualizer */}
        <div className="bg-white border border-slate-200 rounded p-4 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Hourly Timeline for {formatDate(selectedDate)}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Stacked hourly comparison: Active nurses on shift vs. booked doctors in clinic. Gaps turn the column red with the exact deficit.
              </p>
            </div>

            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="flex items-center gap-1 text-indigo-700">
                <span className="w-2.5 h-2.5 rounded bg-indigo-600 inline-block" />
                Nurses on Duty
              </span>
              <span className="flex items-center gap-1 text-slate-700">
                <span className="w-2.5 h-2.5 rounded bg-slate-400 inline-block" />
                Doctors in Session
              </span>
            </div>
          </div>

          {/* Primary Hourly Visualizer Strip */}
          <div className="grid grid-cols-14 gap-1 border border-slate-200 rounded p-2 bg-slate-50/70 overflow-x-auto">
            {hours.map((hour) => {
              const hourStr = `${String(hour).padStart(2, '0')}:00`;
              const nextHourStr = `${String(hour + 1).padStart(2, '0')}:00`;

              const docsActive = daySessions.filter(
                (s) => s.startTime < nextHourStr && s.endTime > hourStr
              ).length;

              const nursesActive = dayAssignments.filter((a) => {
                const duty = dutyMap.get(a.dutyWindowId);
                return duty && duty.startTime < nextHourStr && duty.endTime > hourStr;
              }).length;

              const hasDeficit = docsActive > nursesActive;

              return (
                <div key={hour} className="flex flex-col items-center min-w-[50px] space-y-1">
                  <span className="font-mono text-[10px] text-slate-500">{hourStr}</span>

                  <div
                    className={`w-full h-24 rounded border flex flex-col justify-end p-1 transition-all ${
                      hasDeficit
                        ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-400'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="text-center font-mono font-bold text-[11px]">
                      <span className="text-indigo-600">{nursesActive}</span>
                      <span className="text-slate-300 mx-0.5">/</span>
                      <span className="text-slate-700">{docsActive}</span>
                    </div>

                    {hasDeficit ? (
                      <span className="mt-1 text-[9px] font-mono font-bold text-rose-700 bg-rose-100 rounded px-1 py-0.2 text-center">
                        −{docsActive - nursesActive}
                      </span>
                    ) : (
                      <span className="mt-1 text-[9px] font-mono text-emerald-700 bg-emerald-50 rounded px-1 py-0.2 text-center">
                        OK
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mini-row 2: Phlebotomy-capable nurses vs quota */}
          {/* Mini-row 3: Senior nurse count >= 1 per active duty window */}
          <div className="space-y-1.5 border border-slate-200 rounded p-3 bg-slate-50">
            <span className="font-bold text-[10px] text-slate-500 uppercase tracking-wider block font-mono">
              Hourly Role &amp; Seniority Guardrails ({selectedDate})
            </span>

            {/* Phlebotomy row */}
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 font-medium text-slate-700">
                <span className="text-rose-600 font-bold">🩸</span>
                <span>Phlebotomist on Duty (Blood Collection &amp; IV):</span>
              </div>
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                  phlNursesOnDuty >= (phlRole?.defaultDailyQuota || 1)
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {phlNursesOnDuty} on duty (Quota: {phlRole?.defaultDailyQuota || 1})
              </span>
            </div>

            {/* Dedicated Nurse Clinic row */}
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 font-medium text-slate-700">
                <span className="text-teal-600 font-bold">🩺</span>
                <span>Dedicated Nurse Clinic (Independent of Doctor):</span>
              </div>
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                  nurseClinicNursesOnDuty >= 1
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {nurseClinicNursesOnDuty >= 1
                  ? `${nurseClinicNursesOnDuty} dedicated nurse on duty ✓`
                  : '0 on duty (Unassigned)'}
              </span>
            </div>

            {/* Senior nurse count row */}
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 font-medium text-slate-700">
                <Shield className="w-3.5 h-3.5 text-indigo-600" />
                <span>Senior Nurse on Duty (Rule H1):</span>
              </div>
              {(() => {
                const dutiesToday = new Set(dayAssignments.map((a) => a.dutyWindowId));
                let allHaveSenior = true;
                dutiesToday.forEach((dutyId) => {
                  const assignedToDuty = dayAssignments.filter((a) => a.dutyWindowId === dutyId);
                  const hasSenior = assignedToDuty.some((a) => {
                    const n = nurseMap.get(a.nurseId);
                    return n && seniorLevelIds.has(n.seniorityLevelId);
                  });
                  if (!hasSenior) allHaveSenior = false;
                });
                return (
                  <span
                    className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                      allHaveSenior
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {allHaveSenior ? 'Senior Present on All Duties ✓' : 'Senior Missing on Duty ⚠'}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Phase 8 Requirement: Table of Every Coverage Gap in Active Period */}
        <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <h3 className="font-bold text-slate-800 text-xs">
                Active Period Coverage Gaps Ledger ({allGaps.length} deficit hours found)
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Computed at every hour boundary where doctors &gt; nurses
            </span>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-mono text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Time</th>
                <th className="py-2 px-3">Doctors in Session</th>
                <th className="py-2 px-3">Nurses on Duty</th>
                <th className="py-2 px-3">Deficit</th>
                <th className="py-2 px-3">Reason / Contributing Factor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {allGaps.map((gap, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-bold text-slate-800">{formatDate(gap.date)}</td>
                  <td className="py-2 px-3 text-slate-700">{gap.hour}</td>
                  <td className="py-2 px-3 text-slate-900">{gap.doctorsCount} doctors</td>
                  <td className="py-2 px-3 text-indigo-700">{gap.nursesCount} nurses</td>
                  <td className="py-2 px-3 font-bold text-rose-600">−{gap.deficit} nurse(s)</td>
                  <td className="py-2 px-3 text-slate-600 font-sans">{gap.reason}</td>
                </tr>
              ))}

              {allGaps.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 font-sans text-xs">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                    No coverage deficits detected. Nursing staff is sufficient across all scheduled clinic hours.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
