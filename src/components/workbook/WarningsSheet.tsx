import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  ArrowRight,
  Filter,
  CheckCircle2,
  Users,
  Clock,
  FileSpreadsheet,
} from 'lucide-react';
import { ValidationReport, ValidationFinding, FindingCategory, FindingSeverity } from '../../services/validation/ScheduleValidator';
import { formatDate } from '../../utils/dateUtils';

interface WarningsSheetProps {
  validationReport: ValidationReport;
  onGoToCell?: (nurseId: string, date: string) => void;
}

export const WarningsSheet: React.FC<WarningsSheetProps> = ({
  validationReport,
  onGoToCell,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | FindingCategory>('ALL');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | FindingSeverity>('ALL');

  const filteredFindings = validationReport.findings.filter((f) => {
    const matchesCategory = categoryFilter === 'ALL' || f.category === categoryFilter;
    const matchesSeverity = severityFilter === 'ALL' || f.severity === severityFilter;
    return matchesCategory && matchesSeverity;
  });

  return (
    <div className="flex flex-col h-full bg-slate-100 select-none overflow-hidden text-xs">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600" />
          <span className="font-bold text-slate-800">
            Schedule Validation &amp; Rule Audits ({validationReport.findings.length} findings)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Filters */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[11px]">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="px-2 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
            >
              <option value="ALL">All Categories</option>
              <option value="COVERAGE_GAP">Coverage Gaps</option>
              <option value="STAFFING_SCALE">Staffing Scale</option>
              <option value="RULE_VIOLATION">Rule Violations</option>
              <option value="HOURS_IMBALANCE">Hours Imbalances</option>
              <option value="DATA_ISSUE">Data Issues</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[11px]">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className="px-2 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
            >
              <option value="ALL">All Severities</option>
              <option value="ERROR">Errors Only</option>
              <option value="WARN">Warnings Only</option>
              <option value="INFO">Info Only</option>
            </select>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Counts */}
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold">
              {validationReport.errorCount} Errors
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
              {validationReport.warnCount} Warnings
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
              {validationReport.infoCount} Info
            </span>
          </div>
        </div>
      </div>

      {/* Findings List */}
      <div className="flex-1 overflow-auto p-4 space-y-2.5">
        {filteredFindings.map((finding) => {
          const isError = finding.severity === 'ERROR';
          const isWarn = finding.severity === 'WARN';

          return (
            <div
              key={finding.id}
              className={`p-3 rounded border bg-white flex items-start justify-between gap-3 shadow-2xs transition-all ${
                isError
                  ? 'border-red-300'
                  : isWarn
                  ? 'border-amber-300'
                  : 'border-blue-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`p-1.5 rounded shrink-0 mt-0.5 ${
                    isError
                      ? 'bg-red-100 text-red-700'
                      : isWarn
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                </span>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-1.5 py-0.2 rounded font-mono font-bold text-[10px] ${
                        isError
                          ? 'bg-red-100 text-red-800'
                          : isWarn
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {finding.category.replace('_', ' ')}
                    </span>
                    <span className="font-semibold text-slate-800 text-xs">
                      {finding.message}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-mono">
                    {finding.date && <span>Date Ref: {formatDate(finding.date)}</span>}
                    {finding.hour && <span>Time: {finding.hour}</span>}
                    {finding.affectedNurseIds.length > 0 && (
                      <span>Affected Nurses: {finding.affectedNurseIds.length}</span>
                    )}
                  </div>
                </div>
              </div>

              {finding.cellRefs.length > 0 && onGoToCell && (
                <button
                  onClick={() => onGoToCell(finding.cellRefs[0].nurseId, finding.cellRefs[0].date)}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold rounded shrink-0 cursor-pointer text-xs transition-colors"
                >
                  <span>Go to cell</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {filteredFindings.length === 0 && (
          <div className="bg-white border border-slate-200 rounded p-12 text-center text-slate-400">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-medium text-slate-700">No findings matching active filters.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              The schedule complies with all checked constraints and coverage limits.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
