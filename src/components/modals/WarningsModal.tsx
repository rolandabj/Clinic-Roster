import React from 'react';
import { X, ShieldAlert, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { AppRoute } from '../../types/navigation';

interface WarningsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTab: (route: AppRoute) => void;
}

export const WarningsModal: React.FC<WarningsModalProps> = ({
  isOpen,
  onClose,
  onNavigateToTab,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-800">Schedule Warnings &amp; Rule Audits</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content list */}
        <div className="p-5 overflow-y-auto space-y-3 divide-y divide-slate-100">
          <div className="pt-2 first:pt-0">
            <div className="flex items-start gap-2.5">
              <span className="p-1 rounded bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Evening Coverage Deficit
                  </span>
                  <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-mono">
                    COVERAGE
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Tue 13 Oct, 19:00 — 3 doctors still in session, only 2 nurses on duty (need 3).
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    onClick={() => {
                      onClose();
                      onNavigateToTab('schedules');
                    }}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Inspect cell in Workbook</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3">
            <div className="flex items-start gap-2.5">
              <span className="p-1 rounded bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Soft Rule S1: Late Duty Threshold
                  </span>
                  <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-mono">
                    RULE S1
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Nurse Fatima Al-Zahra: 4 consecutive duties ending at 21:00 (max 3), 09–12 Oct.
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    onClick={() => {
                      onClose();
                      onNavigateToTab('schedules');
                    }}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Inspect cell in Workbook</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3">
            <div className="flex items-start gap-2.5">
              <span className="p-1 rounded bg-blue-100 text-blue-800 shrink-0 mt-0.5">
                <Info className="w-3.5 h-3.5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">
                    Hours Accounting Target Notice
                  </span>
                  <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-mono">
                    HOURS
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Nurse Layla Mansour at 96h vs contracted target with 10 days remaining — projected 132h (-36h).
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    onClick={() => {
                      onClose();
                      onNavigateToTab('reports');
                    }}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>View Hours Ledger</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">
            3 total warnings detected
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
