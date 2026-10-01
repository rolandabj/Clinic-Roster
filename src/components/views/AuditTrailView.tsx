/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Immutable Audit Trail Ledger View (Phase 14.5)
 * Filterable operational ledger with before/after state diff inspector and CSV export.
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  Download,
  Eye,
  Calendar,
  User,
  History,
  CheckCircle2,
  X,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { ClinicContextState } from '../../types/navigation';
import { AuditEvent, AuditAction } from '../../types';
import { getRepository } from '../../services/repository';

interface AuditTrailViewProps {
  context: ClinicContextState;
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({ context }) => {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const repo = getRepository();

  const loadAuditEvents = async () => {
    try {
      const list = await repo.list('audit');
      list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      setAuditEvents(list);
    } catch (e) {
      console.error('Failed to load audit events:', e);
    }
  };

  useEffect(() => {
    loadAuditEvents();
  }, []);

  const filteredEvents = auditEvents.filter((ev) => {
    if (filterAction !== 'ALL' && ev.action !== filterAction) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchActor = ev.actor.toLowerCase().includes(q);
      const matchEntity = ev.entity.toLowerCase().includes(q);
      const matchNote = ev.note?.toLowerCase().includes(q) || false;
      if (!matchActor && !matchEntity && !matchNote) return false;
    }
    return true;
  });

  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Actor', 'Action', 'Entity', 'Entity ID', 'Note'];
    const rows = filteredEvents.map((ev) => [
      ev.timestamp,
      `"${ev.actor}"`,
      ev.action,
      ev.entity,
      ev.entityId,
      `"${ev.note || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.href = encodedUri;
    link.download = `audit_trail_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadgeColor = (action: AuditAction) => {
    switch (action) {
      case 'OVERRIDE_LOCK':
        return 'bg-rose-100 text-rose-900 border-rose-200';
      case 'PUBLISH':
        return 'bg-purple-100 text-purple-900 border-purple-200';
      case 'SWAP':
        return 'bg-indigo-100 text-indigo-900 border-indigo-200';
      case 'REBALANCE':
        return 'bg-amber-100 text-amber-900 border-amber-200';
      case 'CREATE':
        return 'bg-emerald-100 text-emerald-900 border-emerald-200';
      case 'DELETE':
        return 'bg-red-100 text-red-900 border-red-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-none font-sans text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Clinical Audit Trail &amp; Ledger
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable log of all operational changes, lock overrides, shift swaps, and publish broadcasts.
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 rounded text-xs font-semibold text-slate-700 cursor-pointer shadow-2xs"
        >
          <Download className="w-3.5 h-3.5 text-slate-500" />
          <span>Export Audit CSV</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-700">Action:</span>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="px-2.5 py-1 border border-slate-300 rounded bg-white font-medium"
            >
              <option value="ALL">All Actions</option>
              <option value="PUBLISH">Publish Broadcast</option>
              <option value="SWAP">Shift Swap</option>
              <option value="OVERRIDE_LOCK">Lock Override</option>
              <option value="REBALANCE">Fairness Rebalance</option>
              <option value="TEMPLATE_APPLY">Template Applied</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
            </select>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search actor, entity or note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 border border-slate-300 rounded text-xs w-64"
            />
          </div>
        </div>

        <span className="font-mono text-slate-500 text-[11px]">
          Showing {filteredEvents.length} of {auditEvents.length} recorded audit events
        </span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs text-xs">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-600 font-mono text-[11px] border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-4">Timestamp</th>
              <th className="py-2.5 px-3">Actor</th>
              <th className="py-2.5 px-3">Action</th>
              <th className="py-2.5 px-3">Entity</th>
              <th className="py-2.5 px-3">Audit Details</th>
              <th className="py-2.5 px-4 text-right">State Diff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {filteredEvents.map((ev) => (
              <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                  {new Date(ev.timestamp).toLocaleString()}
                </td>
                <td className="py-2.5 px-3 font-bold font-sans text-slate-900">
                  {ev.actor}
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getActionBadgeColor(
                      ev.action
                    )}`}
                  >
                    {ev.action}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-slate-700 font-sans">
                  {ev.entity}
                </td>
                <td className="py-2.5 px-3 font-sans text-slate-600 text-[11px] max-w-sm truncate">
                  {ev.note || 'Operational state modification recorded'}
                </td>
                <td className="py-2.5 px-4 text-right font-sans">
                  {(ev.before || ev.after) && (
                    <button
                      onClick={() => setSelectedEvent(ev)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold cursor-pointer"
                    >
                      <Eye className="w-3 h-3 text-slate-500" />
                      <span>Inspect Diff</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {filteredEvents.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400 text-xs font-sans">
                  No matching audit entries recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* State Diff Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden text-xs">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Audit Snapshot Inspector</h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Action: {selectedEvent.action} · Actor: {selectedEvent.actor}
                </p>
              </div>

              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {selectedEvent.note && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-slate-700 italic">
                  "{selectedEvent.note}"
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="font-bold text-slate-700 text-xs">Before State:</span>
                  <pre className="p-3 bg-slate-900 text-rose-300 rounded font-mono text-[10px] overflow-x-auto max-h-60">
                    {JSON.stringify(selectedEvent.before, null, 2) || '// No prior state'}
                  </pre>
                </div>

                <div className="space-y-1">
                  <span className="font-bold text-slate-700 text-xs">After State:</span>
                  <pre className="p-3 bg-slate-900 text-emerald-300 rounded font-mono text-[10px] overflow-x-auto max-h-60">
                    {JSON.stringify(selectedEvent.after, null, 2) || '// State removed'}
                  </pre>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
