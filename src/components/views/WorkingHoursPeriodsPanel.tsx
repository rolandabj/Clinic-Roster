/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WorkingHoursPeriodsPanel
 * Configuration section for Dedicated Time Periods & Target Working Hours.
 * Allows clinical administrators to enter, edit, delete, and test working hours
 * per roster period and verifies prorated hours calculations for short-range schedules.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarRange,
  Clock,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
  Calculator,
  RotateCcw,
  X,
  Check,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { WorkingHoursPeriod } from '../../types';
import { getRepository } from '../../services/repository';
import { SEED_WORKING_HOURS_PERIODS } from '../../services/seed/seedData';
import {
  calculateWorkingHoursForDateRange,
  getInclusiveDays,
  getPeriodDailyRate,
} from '../../services/periods/workingHoursPeriodService';

interface WorkingHoursPeriodsPanelProps {
  onNotify?: (message: string) => void;
}

export const WorkingHoursPeriodsPanel: React.FC<WorkingHoursPeriodsPanelProps> = ({ onNotify }) => {
  const [periods, setPeriods] = useState<WorkingHoursPeriod[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [yearFilter, setYearFilter] = useState<string>('ALL');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [formYear, setFormYear] = useState<string>('2026');
  const [formName, setFormName] = useState<string>('');
  const [formStartDate, setFormStartDate] = useState<string>('2026-01-19');
  const [formEndDate, setFormEndDate] = useState<string>('2026-02-18');
  const [formWorkingHours, setFormWorkingHours] = useState<number | string>(227);
  const [formNote, setFormNote] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Delete State
  const [deletingPeriod, setDeletingPeriod] = useState<WorkingHoursPeriod | null>(null);

  // Restore Baseline Confirmation
  const [isRestoreConfirmOpen, setIsRestoreConfirmOpen] = useState<boolean>(false);

  // Interactive Prorating Tester State
  const [testStartDate, setTestStartDate] = useState<string>('2026-01-19');
  const [testEndDate, setTestEndDate] = useState<string>('2026-02-01'); // 14-day sample

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (onNotify) onNotify(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadPeriods = async () => {
    try {
      setIsLoading(true);
      const repo = getRepository();
      const list = await repo.list('workingHoursPeriods');
      if (list.length === 0) {
        // Automatically seed standard baseline if empty
        await repo.bulkUpsert('workingHoursPeriods', SEED_WORKING_HOURS_PERIODS);
        const refreshed = await repo.list('workingHoursPeriods');
        setPeriods(refreshed);
      } else {
        setPeriods(list);
      }
    } catch (err) {
      console.error('Failed to load working hours periods:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPeriods();
  }, []);

  // Sorted periods chronologically by startDate
  const sortedPeriods = useMemo(() => {
    return [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [periods]);

  // Distinct Years
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    sortedPeriods.forEach((p) => {
      if (p.year) set.add(p.year);
    });
    return Array.from(set).sort();
  }, [sortedPeriods]);

  // Filtered Periods
  const filteredPeriods = useMemo(() => {
    return sortedPeriods.filter((p) => {
      if (yearFilter !== 'ALL' && p.year !== yearFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesYear = p.year.toLowerCase().includes(q);
        const matchesNote = (p.note || '').toLowerCase().includes(q);
        const matchesDates = p.startDate.includes(q) || p.endDate.includes(q);
        return matchesName || matchesYear || matchesNote || matchesDates;
      }
      return true;
    });
  }, [sortedPeriods, yearFilter, searchQuery]);

  // Analytics Metrics
  const stats = useMemo(() => {
    const totalPeriods = sortedPeriods.length;
    const totalHours = sortedPeriods.reduce((acc, p) => acc + (p.workingHours || 0), 0);
    const avgHours = totalPeriods > 0 ? Math.round(totalHours / totalPeriods) : 0;
    const totalDays = sortedPeriods.reduce((acc, p) => acc + getInclusiveDays(p.startDate, p.endDate), 0);
    const avgDays = totalPeriods > 0 ? (totalDays / totalPeriods).toFixed(1) : '0';
    return { totalPeriods, totalHours, avgHours, totalDays, avgDays };
  }, [sortedPeriods]);

  // Interactive Prorating Test Result
  const testCalculation = useMemo(() => {
    return calculateWorkingHoursForDateRange(testStartDate, testEndDate, sortedPeriods);
  }, [testStartDate, testEndDate, sortedPeriods]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingPeriodId(null);
    setFormYear('2026');
    setFormName('');
    setFormStartDate('2026-01-19');
    setFormEndDate('2026-02-18');
    setFormWorkingHours(220);
    setFormNote('');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (period: WorkingHoursPeriod) => {
    setEditingPeriodId(period.id);
    setFormYear(period.year);
    setFormName(period.name);
    setFormStartDate(period.startDate);
    setFormEndDate(period.endDate);
    setFormWorkingHours(period.workingHours);
    setFormNote(period.note || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Handle Save (Create or Update)
  const handleSavePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formName.trim();
    const trimmedYear = formYear.trim();
    const hoursNum = typeof formWorkingHours === 'string' ? parseFloat(formWorkingHours) : formWorkingHours;

    if (!trimmedYear) {
      setFormError('Please enter a year (e.g. 2026 or 2025-2026).');
      return;
    }
    if (!trimmedName) {
      setFormError('Please enter a period name (e.g. Dec19-Jan18).');
      return;
    }
    if (!formStartDate || !formEndDate) {
      setFormError('Please specify both start and end dates.');
      return;
    }
    if (formStartDate > formEndDate) {
      setFormError('Start date must be before or equal to end date.');
      return;
    }
    if (isNaN(hoursNum) || hoursNum <= 0) {
      setFormError('Working hours must be a positive number.');
      return;
    }

    try {
      setIsSaving(true);
      const repo = getRepository();
      const now = new Date().toISOString();

      if (editingPeriodId) {
        // Update
        const updated = await repo.update('workingHoursPeriods', editingPeriodId, {
          year: trimmedYear,
          name: trimmedName,
          startDate: formStartDate,
          endDate: formEndDate,
          workingHours: Math.round(hoursNum),
          note: formNote.trim() || undefined,
          updatedAt: now,
        });

        setPeriods((prev) => prev.map((p) => (p.id === editingPeriodId ? updated : p)));
        showToast(`Period "${trimmedName}" updated successfully.`);
      } else {
        // Create
        const newId = `whp-${trimmedYear.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}`;
        const created = await repo.create('workingHoursPeriods', {
          id: newId,
          year: trimmedYear,
          name: trimmedName,
          startDate: formStartDate,
          endDate: formEndDate,
          workingHours: Math.round(hoursNum),
          note: formNote.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        });

        setPeriods((prev) => [...prev, created]);
        showToast(`Created period "${trimmedName}" (${Math.round(hoursNum)}h).`);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving working hours period:', err);
      setFormError(err.message || 'Failed to save dedicated time period.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Delete
  const handleConfirmDelete = async () => {
    if (!deletingPeriod) return;
    try {
      const repo = getRepository();
      await repo.remove('workingHoursPeriods', deletingPeriod.id);
      setPeriods((prev) => prev.filter((p) => p.id !== deletingPeriod.id));
      showToast(`Period "${deletingPeriod.name}" deleted.`);
      setDeletingPeriod(null);
    } catch (err) {
      console.error('Failed to delete period:', err);
      showToast('Error deleting period.');
    }
  };

  // Handle Restore Standard 2025-2026 Baseline
  const handleRestoreBaseline = async () => {
    try {
      setIsLoading(true);
      const repo = getRepository();
      await repo.bulkUpsert('workingHoursPeriods', SEED_WORKING_HOURS_PERIODS);
      const reloaded = await repo.list('workingHoursPeriods');
      setPeriods(reloaded);
      setIsRestoreConfirmOpen(false);
      showToast('Loaded all 12 standard dedicated time periods from clinic baseline.');
    } catch (err) {
      console.error('Failed to restore standard periods:', err);
      showToast('Error loading standard periods.');
    } finally {
      setIsLoading(false);
    }
  };

  const formDurationDays = useMemo(() => {
    return getInclusiveDays(formStartDate, formEndDate);
  }, [formStartDate, formEndDate]);

  const formDailyRate = useMemo(() => {
    const hours = typeof formWorkingHours === 'string' ? parseFloat(formWorkingHours) || 0 : formWorkingHours;
    return formDurationDays > 0 ? (hours / formDurationDays).toFixed(2) : '0';
  }, [formWorkingHours, formDurationDays]);

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg text-xs flex items-center justify-between shadow-2xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-medium">{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-indigo-400 hover:text-indigo-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <CalendarRange className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Dedicated Time Periods & Working Hours</h2>
              <p className="text-xs text-slate-500">
                Configure cycle-specific working hours (e.g. 19th-to-18th cycles) and contract baselines. The engine references these numbers and prorates schedules of any duration.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsRestoreConfirmOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Load all 12 standard periods from 2025-2026 clinic roster baseline"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Load 2025–2026 Baseline</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Dedicated Period</span>
          </button>
        </div>
      </div>

      {/* Analytics Summary Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">Configured Cycles</span>
          <span className="text-lg font-bold text-slate-900 mt-0.5 block">{stats.totalPeriods} periods</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">{availableYears.join(', ') || 'None'}</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">Annual Working Hours (FT)</span>
          <span className="text-lg font-bold text-indigo-700 mt-0.5 block">{stats.totalHours.toLocaleString()} hrs</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Sum of full-time contracted baselines</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">Average Cycle Target</span>
          <span className="text-lg font-bold text-slate-900 mt-0.5 block">{stats.avgHours} hrs/cycle</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">~{Math.round(stats.avgHours * 0.5)}h for 50% part-time</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs">
          <span className="text-[11px] font-medium text-slate-500 block">Average Cycle Length</span>
          <span className="text-lg font-bold text-slate-900 mt-0.5 block">{stats.avgDays} days</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Total {stats.totalDays} calendar days covered</span>
        </div>
      </div>

      {/* Main Content Layout: Periods Table + Live Prorating Tester */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Table and Filters */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search periods or dates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Year:</span>
              <button
                type="button"
                onClick={() => setYearFilter('ALL')}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  yearFilter === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              {availableYears.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setYearFilter(yr)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    yearFilter === yr
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          </div>

          {/* Periods Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Year</th>
                    <th className="py-2.5 px-3">Dedicated Period</th>
                    <th className="py-2.5 px-3">Calendar Date Range</th>
                    <th className="py-2.5 px-3">Days</th>
                    <th className="py-2.5 px-3">Daily Rate</th>
                    <th className="py-2.5 px-3 text-right">Target (FT)</th>
                    <th className="py-2.5 px-3 text-right">Part-Time (50%)</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        <RefreshCw className="w-4 h-4 animate-spin inline mr-2 text-indigo-500" />
                        Loading dedicated periods...
                      </td>
                    </tr>
                  ) : filteredPeriods.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No dedicated periods found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredPeriods.map((period) => {
                      const days = getInclusiveDays(period.startDate, period.endDate);
                      const dailyRate = (period.workingHours / Math.max(1, days)).toFixed(2);
                      const ptHours = (period.workingHours * 0.5).toFixed(1).replace('.0', '');

                      return (
                        <tr key={period.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-mono font-medium">
                              {period.year}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                            <span className="text-indigo-900">{period.name}</span>
                            {period.note && (
                              <span className="block text-[10px] font-normal text-slate-400 truncate max-w-xs">
                                {period.note}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {period.startDate} <span className="text-slate-400">→</span> {period.endDate}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            {days}d
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                            {dailyRate} h/d
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-indigo-700 whitespace-nowrap">
                            {period.workingHours} hrs
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600 whitespace-nowrap">
                            {ptHours} hrs
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(period)}
                                className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Edit dedicated period"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingPeriod(period)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Delete dedicated period"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Interactive Prorating Calculator & Tester */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Schedule Hours Tester</h3>
              <p className="text-[11px] text-slate-500">
                Preview exact and prorated working hours for any schedule duration.
              </p>
            </div>
          </div>

          {/* Quick Presets Buttons */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Quick Test Durations
            </span>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => {
                  setTestStartDate('2026-01-19');
                  setTestEndDate('2026-01-23'); // 5 days
                }}
                className="py-1 px-1.5 text-[11px] font-medium rounded border border-slate-200 hover:bg-slate-50 text-slate-700 text-center transition-colors cursor-pointer"
              >
                5 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  setTestStartDate('2026-01-19');
                  setTestEndDate('2026-02-01'); // 14 days (2 weeks)
                }}
                className="py-1 px-1.5 text-[11px] font-medium rounded border border-slate-200 hover:bg-slate-50 text-slate-700 text-center transition-colors cursor-pointer"
              >
                2 Weeks
              </button>
              <button
                type="button"
                onClick={() => {
                  setTestStartDate('2026-01-19');
                  setTestEndDate('2026-02-18'); // Full cycle
                }}
                className="py-1 px-1.5 text-[11px] font-medium rounded border border-slate-200 hover:bg-slate-50 text-slate-700 text-center transition-colors cursor-pointer"
              >
                Full Period
              </button>
            </div>
          </div>

          {/* Date Pickers */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Start Date</label>
              <input
                type="date"
                value={testStartDate}
                onChange={(e) => setTestStartDate(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono text-slate-800 bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">End Date</label>
              <input
                type="date"
                value={testEndDate}
                onChange={(e) => setTestEndDate(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono text-slate-800 bg-white"
              />
            </div>
          </div>

          {/* Test Calculation Output Card */}
          <div className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
            testCalculation.isExactMatch
              ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
              : 'bg-indigo-50/60 border-indigo-200 text-indigo-950'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Calculated Target
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                testCalculation.isExactMatch
                  ? 'bg-emerald-200 text-emerald-800'
                  : 'bg-indigo-200 text-indigo-800'
              }`}>
                {testCalculation.isExactMatch ? 'Exact Period Match' : 'Prorated Target'}
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  {testCalculation.targetHours}
                </span>
                <span className="text-xs font-semibold text-slate-500 ml-1">hours (Full-Time)</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-700">
                  {Math.round(testCalculation.targetHours * 0.5)}h
                </span>
                <span className="text-[10px] text-slate-400 block">50% Part-Time</span>
              </div>
            </div>

            <div className="text-[11px] leading-relaxed text-slate-700 bg-white/80 p-2.5 rounded-lg border border-slate-200/60 space-y-1">
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>{testCalculation.description}</span>
              </div>
              <div className="text-[10px] text-slate-500">
                Duration: {testCalculation.totalScheduleDays} calendar days ({testStartDate} to {testEndDate})
              </div>
            </div>

            {/* Breakdown detail list if multiple or prorated */}
            {testCalculation.breakdown.length > 0 && (
              <div className="space-y-1 pt-1">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                  Contributing Periods:
                </span>
                {testCalculation.breakdown.map((item) => (
                  <div
                    key={item.periodId}
                    className="flex items-center justify-between text-[11px] bg-white px-2 py-1 rounded border border-slate-200/70"
                  >
                    <span className="font-medium text-slate-800">
                      {item.periodName} ({item.year})
                    </span>
                    <span className="font-mono text-slate-600 text-[10px]">
                      {item.daysCovered}d × {item.periodDailyRate}h = <b>{item.contributedHours}h</b>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Period Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-2xs animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <CalendarRange className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingPeriodId ? 'Edit Dedicated Time Period' : 'New Dedicated Time Period'}
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Define cycle dates and contracted full-time working hours.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePeriod} className="p-4 space-y-3.5 text-xs">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Year / Cycle <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2026 or 2025-2026"
                    value={formYear}
                    onChange={(e) => setFormYear(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Period Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jan19-Feb18"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    End Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Full-Time Working Hours (Target) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min={1}
                    max={500}
                    step={1}
                    placeholder="e.g. 210, 227, 145"
                    value={formWorkingHours}
                    onChange={(e) => setFormWorkingHours(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-indigo-700"
                  />
                  <span className="absolute right-3 top-2 text-[11px] text-slate-400 font-medium">hours</span>
                </div>
              </div>

              {/* Calculated Rate Preview in Modal */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-[11px]">
                <span className="text-slate-600">
                  Duration: <b>{formDurationDays} days</b>
                </span>
                <span className="text-indigo-700 font-semibold">
                  Daily Baseline: ~{formDailyRate} hrs/day
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Notes / Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramadan hours adjustments, standard 210h cycle"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{editingPeriodId ? 'Update Period' : 'Create Period'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingPeriod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-2xs animate-in fade-in duration-100">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4 text-xs space-y-3">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Delete Dedicated Period?</span>
            </div>
            <p className="text-slate-600 text-xs">
              Are you sure you want to delete <b>{deletingPeriod.name} ({deletingPeriod.year})</b> with {deletingPeriod.workingHours}h target? Future schedule generations spanning this range will fall back to default hours policy.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingPeriod(null)}
                className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg shadow-2xs"
              >
                Delete Period
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Standard 2025-2026 Confirmation Modal */}
      {isRestoreConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-2xs animate-in fade-in duration-100">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-4 text-xs space-y-3">
            <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
              <RotateCcw className="w-5 h-5 shrink-0" />
              <span>Load 2025–2026 Baseline Periods?</span>
            </div>
            <p className="text-slate-600 text-xs leading-relaxed">
              This will restore all 12 standard dedicated time periods from your clinic roster table:
              <br />
              <span className="font-mono text-[11px] block mt-1.5 bg-slate-50 p-2 rounded border border-slate-200 text-slate-700">
                • Dec19–Jan18: 210h<br />
                • Jan19–Feb18: 227h<br />
                • Feb19–Mar18: 145h<br />
                • Mar19–Apr18: 207h<br />
                • Apr19–May18: 220h<br />
                • May19–Jun18: 230h<br />
                • Jun19–Jul18: 200h<br />
                • Jul19–Aug18: 230h<br />
                • Aug19–Sep18: 220h<br />
                • Sep19–Oct18: 210h<br />
                • Oct19–Nov18: 230h<br />
                • Nov19–Dec18: 210h
              </span>
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsRestoreConfirmOpen(false)}
                className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestoreBaseline}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-2xs"
              >
                Confirm & Load Baseline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
