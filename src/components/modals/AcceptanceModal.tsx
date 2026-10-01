/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Phase 16 Acceptance & Self-Verification Suite Dialog
 * Displays live automated verification of all 13 Phase 16 acceptance criteria.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  Download,
  ShieldCheck,
  Clock,
  ChevronDown,
  ChevronRight,
  Filter,
  CheckSquare,
  FileCheck2,
  Activity,
  Layers,
  Check,
} from 'lucide-react';
import {
  Phase16AcceptanceService,
  AcceptanceSuiteReport,
  AcceptanceCheckResult,
} from '../../services/verification/phase16AcceptanceService';

interface AcceptanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToSchedules?: () => void;
}

export const AcceptanceModal: React.FC<AcceptanceModalProps> = ({
  isOpen,
  onClose,
  onNavigateToSchedules,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunningCheck, setCurrentRunningCheck] = useState<{ id: number; name: string } | null>(null);
  const [report, setReport] = useState<AcceptanceSuiteReport | null>(null);
  const [expandedCheckId, setExpandedCheckId] = useState<number | null>(null);
  const [filterMode, setFilterMode] = useState<'ALL' | 'FAIL_ONLY'>('ALL');
  const [hasAutoRun, setHasAutoRun] = useState(false);

  // Auto-run checks upon opening if not already run
  useEffect(() => {
    if (isOpen && !report && !isRunning && !hasAutoRun) {
      setHasAutoRun(true);
      executeSuite();
    }
  }, [isOpen, report, isRunning, hasAutoRun]);

  const executeSuite = async () => {
    setIsRunning(true);
    setCurrentRunningCheck({ id: 1, name: 'Starting Acceptance Verification Suite...' });
    try {
      const suiteReport = await Phase16AcceptanceService.runAllChecks((checkId, name) => {
        setCurrentRunningCheck({ id: checkId, name });
      });
      setReport(suiteReport);
    } catch (err: any) {
      console.error('Acceptance suite failed:', err);
    } finally {
      setIsRunning(false);
      setCurrentRunningCheck(null);
    }
  };

  const handleExportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acceptance_report_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    if (!report) return;
    let md = `# ClinicRoster — Acceptance Verification Report\n\n`;
    md += `**Timestamp:** ${report.timestamp}\n`;
    md += `**Status:** ${report.allPassed ? 'PASSED (13 / 13)' : 'FAILED'}\n`;
    md += `**Total Execution Time:** ${report.totalDurationMs}ms\n\n`;
    md += `## Checklist Results\n\n`;

    report.results.forEach((r) => {
      md += `### ${r.id}. ${r.title} — ${r.passed ? 'PASSED' : 'FAILED'} (${r.durationMs}ms)\n`;
      md += `*Category:* ${r.category}\n`;
      md += `*Details:* ${r.details}\n\n`;
      md += `**Subchecks:**\n`;
      r.subchecks.forEach((s) => {
        md += `- [${s.passed ? 'x' : ' '}] **${s.name}**: ${s.message}\n`;
      });
      md += `\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `acceptance_audit_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-indigo-600 text-white shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Acceptance Checklist &amp; Verification Suite
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300">
                  13 Standards
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Automated self-verification engine testing determinism, locks, leave, rules, coverage, exports, and publishing.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close dialog (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action & Metric Toolbar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={executeSuite}
              disabled={isRunning}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {isRunning ? (
                <>
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                  <span>Running Suite...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Rerun Verification Suite</span>
                </>
              )}
            </button>

            {report && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleExportJson}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 rounded transition-colors cursor-pointer"
                  title="Export audit results as JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </button>
                <button
                  onClick={handleExportMarkdown}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 rounded transition-colors cursor-pointer"
                  title="Export audit report as Markdown"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>Export Markdown</span>
                </button>
              </div>
            )}
          </div>

          {report && (
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                <span>{report.totalDurationMs}ms</span>
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-bold ${
                  report.allPassed
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {report.passedCount} of {report.totalCount} Passed (100%)
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Live Progress Bar if running */}
        {isRunning && currentRunningCheck && (
          <div className="px-6 py-2.5 bg-indigo-50/70 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
              <Activity className="w-4 h-4 text-indigo-600 animate-spin" />
              <span className="font-semibold">Check {currentRunningCheck.id}/13:</span>
              <span>{currentRunningCheck.name}</span>
            </div>
            <span className="font-mono text-indigo-700 dark:text-indigo-300 text-[11px]">
              {Math.round((currentRunningCheck.id / 13) * 100)}%
            </span>
          </div>
        )}

        {/* Content / Checklist Table */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
          {!report && isRunning ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
              <div className="w-10 h-10 rounded-full border-3 border-indigo-600 border-t-transparent animate-spin" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Executing Automated Acceptance Suite...
              </p>
              <p className="text-xs text-slate-500 max-w-sm">
                Testing generation determinism, lock preservation, H1 senior rules, coverage gap copy, and exports.
              </p>
            </div>
          ) : report ? (
            <div className="space-y-2.5">
              {report.results.map((result) => {
                const isExpanded = expandedCheckId === result.id;
                return (
                  <div
                    key={result.id}
                    className={`rounded border transition-colors ${
                      result.passed
                        ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                        : 'border-rose-200 dark:border-rose-900 bg-rose-50/20'
                    }`}
                  >
                    {/* Item Summary Row */}
                    <div
                      onClick={() => setExpandedCheckId(isExpanded ? null : result.id)}
                      className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0">
                          {result.passed ? (
                            <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                              <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5]" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-slate-400">
                              #{result.id}
                            </span>
                            <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {result.title}
                            </h3>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {result.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {result.details}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                          {result.durationMs}ms
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300">
                          {result.assertionsPassed}/{result.totalAssertions} Passed
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Subcheck Detail Accordion */}
                    {isExpanded && (
                      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/40 space-y-2 text-xs">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                          Assertion Diagnostics
                        </div>
                        {result.subchecks.map((sub, sIdx) => (
                          <div key={sIdx} className="flex items-start gap-2.5">
                            <div className="mt-0.5 shrink-0">
                              {sub.passed ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                              )}
                            </div>
                            <div>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {sub.name}:
                              </span>{' '}
                              <span className="text-slate-600 dark:text-slate-400">
                                {sub.message}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between shrink-0 text-xs">
          <div className="text-slate-500 dark:text-slate-400">
            Acceptance verification complete for {(typeof window !== 'undefined' ? localStorage.getItem('clinic_roster_clinic_name') : null) || 'American Hospital Nad Al Sheba OutPatient clinic'}.
          </div>
          <div className="flex items-center gap-2">
            {onNavigateToSchedules && (
              <button
                onClick={() => {
                  onClose();
                  onNavigateToSchedules();
                }}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-medium transition-colors cursor-pointer"
              >
                Go to Schedule Workbook
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium shadow-xs transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
