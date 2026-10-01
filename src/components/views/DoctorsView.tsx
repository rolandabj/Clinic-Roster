import React, { useState, useEffect } from 'react';
import {
  Stethoscope,
  Plus,
  Calendar,
  Clock,
  MapPin,
  Edit2,
  Trash2,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  Save,
  X,
  CalendarRange,
  ChevronRight,
  Filter,
  Check,
  Ban,
  RefreshCw,
  Upload,
  Loader2,
} from 'lucide-react';
import { ClinicContextState } from '../../types/navigation';
import { getRepository } from '../../services/repository';
import {
  Doctor,
  Specialty,
  WeeklyPatternSlot,
  DoctorSession,
  IsoDateString,
  SeniorityLevel,
  ClinicalRole,
} from '../../types';
import { BulkImportModal } from '../modals/BulkImportModal';
import { populateRecurringDoctorSessionsForSchedule } from '../../services/schedule/doctorScheduleService';

interface DoctorsViewProps {
  context: ClinicContextState;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const DoctorsView: React.FC<DoctorsViewProps> = ({ context }) => {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [sessions, setSessions] = useState<DoctorSession[]>([]);
  const [seniorityLevels, setSeniorityLevels] = useState<SeniorityLevel[]>([]);
  const [clinicalRoles, setClinicalRoles] = useState<ClinicalRole[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialtyFilter, setSelectedSpecialtyFilter] = useState<string>('ALL');

  // Active Doctor Detail / Calendar
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);

  // Doctor Form Modal
  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [formData, setFormData] = useState<{
    id?: string;
    fullName: string;
    gmail: string;
    specialtyIds: string[];
    weeklyPattern: WeeklyPatternSlot[];
    notes: string;
    active: boolean;
  }>({
    fullName: '',
    gmail: '',
    specialtyIds: [],
    weeklyPattern: [],
    notes: '',
    active: true,
  });

  // Doctor Form Modal States
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newSpecialtyName, setNewSpecialtyName] = useState('');
  const [isAddingSpecialty, setIsAddingSpecialty] = useState(false);

  // Expand Pattern Modal
  const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);
  const [expandRange, setExpandRange] = useState<{
    startDate: string;
    endDate: string;
    targetDoctorId: string;
  }>({
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    targetDoctorId: 'ALL',
  });

  // Ad-hoc Session Modal
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Partial<DoctorSession> | null>(null);

  const [notification, setNotification] = useState<string | null>(null);

  const repo = getRepository();

  const loadData = async () => {
    try {
      const [dList, spList, sessList, slList, crList] = await Promise.all([
        repo.list('doctors'),
        repo.list('specialties'),
        repo.list('doctorSessions'),
        repo.list('seniorityLevels'),
        repo.list('clinicalRoles'),
      ]);
      setDoctors(dList);
      setSpecialties(spList);
      setSessions(sessList);
      setSeniorityLevels(slList);
      setClinicalRoles(crList);

      if (dList.length > 0 && !selectedDoctorId) {
        setSelectedDoctorId(dList[0].id);
      }
    } catch (err) {
      console.error('Error loading doctors data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleQuickAddSpecialty = async (name: string, code?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const generatedCode = code || trimmed.slice(0, 4).toUpperCase();
      const created = await repo.create('specialties', {
        name: trimmed,
        code: generatedCode,
      });
      setSpecialties((prev) => [...prev, created]);
      setFormData((prev) => ({
        ...prev,
        specialtyIds: Array.from(new Set([...prev.specialtyIds, created.id])),
      }));
      setNewSpecialtyName('');
      setIsAddingSpecialty(false);
      setInlineError(null);
      triggerNotification(`Specialty "${trimmed}" added.`);
    } catch (err: any) {
      setInlineError(`Failed to add specialty: ${err.message}`);
    }
  };

  // Doctor Add / Edit Handlers
  const handleOpenAddDoctor = () => {
    setEditingDoctor(null);
    setInlineError(null);
    setNewSpecialtyName('');
    setIsAddingSpecialty(false);
    setFormData({
      fullName: '',
      gmail: '',
      specialtyIds: specialties.length > 0 ? [specialties[0].id] : [],
      weeklyPattern: [
        { weekday: 0, startTime: '09:00', endTime: '13:00', room: 'Suite 101' },
      ],
      notes: '',
      active: true,
    });
    setIsDoctorModalOpen(true);
  };

  const handleOpenEditDoctor = (doc: Doctor) => {
    setEditingDoctor(doc);
    setInlineError(null);
    setNewSpecialtyName('');
    setIsAddingSpecialty(false);
    setFormData({
      id: doc.id,
      fullName: doc.fullName,
      gmail: doc.gmail || '',
      specialtyIds: doc.specialtyIds || [],
      weeklyPattern: doc.weeklyPattern || [],
      notes: doc.notes || '',
      active: doc.active,
    });
    setIsDoctorModalOpen(true);
  };

  const handleSaveDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineError(null);

    const trimmedName = formData.fullName.trim();
    if (!trimmedName) {
      setInlineError('Doctor full name is required.');
      return;
    }

    let finalSpecialtyIds = [...formData.specialtyIds];

    // If no specialty is selected:
    if (finalSpecialtyIds.length === 0) {
      if (specialties.length > 0) {
        setInlineError('Please select at least one clinical specialty for this doctor.');
        return;
      }
      // If no specialties exist in clinic directory at all, automatically create General Practice
      try {
        const defaultSpec = await repo.create('specialties', {
          name: 'General Practice',
          code: 'GP',
        });
        setSpecialties((prev) => [...prev, defaultSpec]);
        finalSpecialtyIds = [defaultSpec.id];
      } catch (specErr: any) {
        setInlineError(`Failed to create default specialty: ${specErr.message}`);
        return;
      }
    }

    setIsSaving(true);
    try {
      if (formData.id) {
        await repo.update('doctors', formData.id, {
          fullName: trimmedName,
          gmail: formData.gmail.trim() || '',
          specialtyIds: finalSpecialtyIds,
          weeklyPattern: formData.weeklyPattern,
          notes: formData.notes.trim() || '',
          active: formData.active,
        });
        triggerNotification(`Doctor profile for ${trimmedName} updated.`);
      } else {
        const created = await repo.create('doctors', {
          fullName: trimmedName,
          gmail: formData.gmail.trim() || '',
          specialtyIds: finalSpecialtyIds,
          weeklyPattern: formData.weeklyPattern,
          notes: formData.notes.trim() || '',
          active: formData.active,
        });
        triggerNotification(`Added Dr. ${trimmedName}.`);
        setSelectedDoctorId(created.id);
      }
      setIsDoctorModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('[DoctorsView] Error saving doctor:', err);
      setInlineError(`Error saving doctor: ${err.message || 'Please check your connection and try again.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDoctor = async (id: string, name: string) => {
    if (confirm(`Remove doctor "${name}" and their sessions?`)) {
      await repo.remove('doctors', id);
      // Remove associated sessions
      const docSessions = await repo.list('doctorSessions', {
        field: 'doctorId',
        operator: '==',
        value: id,
      });
      for (const s of docSessions) {
        await repo.remove('doctorSessions', s.id);
      }
      triggerNotification(`Removed ${name}.`);
      setSelectedDoctorId(null);
      loadData();
    }
  };

  // Weekly Pattern Row Handlers
  const handleAddPatternRow = () => {
    setFormData({
      ...formData,
      weeklyPattern: [
        ...formData.weeklyPattern,
        { weekday: 1, startTime: '09:00', endTime: '13:00', room: 'Suite 101' },
      ],
    });
  };

  const handleRemovePatternRow = (idx: number) => {
    setFormData({
      ...formData,
      weeklyPattern: formData.weeklyPattern.filter((_, i) => i !== idx),
    });
  };

  const handlePatternChange = (
    idx: number,
    field: keyof WeeklyPatternSlot,
    value: any
  ) => {
    const list = [...formData.weeklyPattern];
    list[idx] = { ...list[idx], [field]: value };
    setFormData({ ...formData, weeklyPattern: list });
  };

  // Expand Pattern to Sessions for a date range
  const handleExpandPatternToSessions = async () => {
    try {
      const targetDocs =
        expandRange.targetDoctorId === 'ALL'
          ? doctors
          : doctors.filter((d) => d.id === expandRange.targetDoctorId);

      if (expandRange.startDate > expandRange.endDate) {
        alert('Start date must be before or equal to end date.');
        return;
      }

      const result = await populateRecurringDoctorSessionsForSchedule({
        repo,
        startDate: expandRange.startDate,
        endDate: expandRange.endDate,
        doctors: targetDocs,
        overwriteExisting: true,
      });

      triggerNotification(
        `Expanded recurring patterns: ${result.createdCount} sessions populated across ${expandRange.startDate} to ${expandRange.endDate}.`
      );
      setIsExpandModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(`Error expanding sessions: ${err.message}`);
    }
  };

  // Toggle Session Cancel / Override
  const handleToggleCancelSession = async (sess: DoctorSession) => {
    const nextCancelled = !sess.cancelled;
    await repo.update('doctorSessions', sess.id, { cancelled: nextCancelled });
    triggerNotification(
      nextCancelled
        ? `Session cancelled for Dr. ${doctors.find((d) => d.id === sess.doctorId)?.fullName} on ${sess.date}.`
        : `Session restored on ${sess.date}.`
    );
    loadData();
  };

  // Save Ad-hoc Session Override
  const handleSaveAdHocSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession || !editingSession.doctorId || !editingSession.date) return;

    try {
      if (editingSession.id) {
        await repo.update('doctorSessions', editingSession.id, {
          startTime: editingSession.startTime,
          endTime: editingSession.endTime,
          room: editingSession.room,
          cancelled: editingSession.cancelled,
          source: 'MANUAL',
        });
        triggerNotification(`Updated session for ${editingSession.date}.`);
      } else {
        await repo.create('doctorSessions', {
          doctorId: editingSession.doctorId,
          date: editingSession.date,
          startTime: editingSession.startTime || '09:00',
          endTime: editingSession.endTime || '13:00',
          specialtyId: editingSession.specialtyId || specialties[0]?.id || '',
          room: editingSession.room || 'Suite 101',
          source: 'MANUAL',
          cancelled: false,
        });
        triggerNotification(`Ad-hoc session created for ${editingSession.date}.`);
      }
      setIsSessionModalOpen(false);
      setEditingSession(null);
      loadData();
    } catch (err: any) {
      alert(`Failed to save session: ${err.message}`);
    }
  };

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);
  const selectedDoctorSessions = sessions
    .filter((s) => s.doctorId === selectedDoctorId)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Doctors' Clinic Schedule</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure weekly recurring patterns and ad-hoc sessions. Doctors' schedules are entered manually — never engine generated.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsBulkImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
            title="Bulk import doctors from CSV"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>Bulk CSV Import</span>
          </button>

          <button
            onClick={() => setIsExpandModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Expand Pattern to Dates...</span>
          </button>
          <button
            onClick={handleOpenAddDoctor}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Doctor</span>
          </button>
        </div>
      </div>

      {/* Explicit Clinical Policy Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900 flex items-start gap-2.5">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block">Demand Rule &amp; Scope Boundary</span>
          <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
            Doctors' schedules are entered here — <strong>ClinicRoster never generates doctor schedules</strong>. The deterministic scheduling engine's only role is to assign qualified nurses to each active doctor session and clinical support quota.
          </p>
        </div>
      </div>

      {/* Main Grid: Doctors Table (Left) + Selected Doctor Sessions Calendar (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Doctors Directory List (7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-xs">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-800">
                Clinic Doctors ({doctors.length})
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Click a doctor to inspect session calendar
              </span>
            </div>

            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-medium">
                <tr>
                  <th className="py-2.5 px-3">Doctor</th>
                  <th className="py-2.5 px-3">Specialties</th>
                  <th className="py-2.5 px-3">Weekly Pattern</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...doctors]
                  .sort((a, b) => a.fullName.localeCompare(b.fullName))
                  .map((doc) => {
                  const isSelected = selectedDoctorId === doc.id;
                  const docSpecialties = specialties.filter((s) =>
                    doc.specialtyIds?.includes(s.id)
                  );

                  return (
                    <tr
                      key={doc.id}
                      onClick={() => setSelectedDoctorId(doc.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/70 border-l-4 border-indigo-600'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0">
                            {doc.fullName.charAt(0)}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-900 block">
                              {doc.fullName}
                            </span>
                            {doc.notes && (
                              <span className="text-[10px] text-slate-400 truncate max-w-[160px] block">
                                {doc.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {docSpecialties.map((s) => (
                            <span
                              key={s.id}
                              className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono text-[10px] border border-slate-200"
                            >
                              {s.code}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-[11px] text-slate-600 font-mono">
                        {doc.weeklyPattern?.length > 0 ? (
                          <div className="space-y-0.5">
                            {doc.weeklyPattern.slice(0, 2).map((p, idx) => (
                              <div key={idx} className="truncate">
                                {WEEKDAY_NAMES[p.weekday].substring(0, 3)} {p.startTime}–{p.endTime}
                              </div>
                            ))}
                            {doc.weeklyPattern.length > 2 && (
                              <span className="text-[10px] text-slate-400">
                                +{doc.weeklyPattern.length - 2} more shifts
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">No pattern</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            doc.active
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {doc.active ? 'Active' : 'Archived'}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleOpenEditDoctor(doc)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                            title="Edit Doctor & Patterns"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteDoctor(doc.id, doc.fullName)}
                            className="p-1 hover:bg-red-50 rounded text-red-600 cursor-pointer"
                            title="Delete Doctor"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {doctors.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 px-4 text-center">
                      <div className="max-w-xs mx-auto space-y-3">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
                          <Stethoscope className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800">No Doctors Registered</h4>
                          <p className="text-[11px] text-slate-500 mt-1">
                            The physician directory is currently empty. Click "Add Doctor" to configure weekly session patterns.
                          </p>
                        </div>
                        <button
                          onClick={handleOpenAddDoctor}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold cursor-pointer shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add First Doctor</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Doctor's Session Calendar & Exceptions (5 Cols) */}
        <div className="lg:col-span-5 space-y-3">
          {selectedDoctor ? (
            <div className="bg-white border border-slate-200 rounded p-4 shadow-xs space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      {selectedDoctor.fullName}
                    </h2>
                    <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      Sessions
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {selectedDoctorSessions.length} sessions scheduled across active schedules.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setEditingSession({
                      doctorId: selectedDoctor.id,
                      date: '2026-10-15',
                      startTime: '09:00',
                      endTime: '13:00',
                      specialtyId: selectedDoctor.specialtyIds[0],
                      room: 'Suite 101',
                      source: 'MANUAL',
                      cancelled: false,
                    });
                    setIsSessionModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium text-[11px] cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Ad-hoc Session</span>
                </button>
              </div>

              {/* Weekly Pattern Summary Card */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                <span className="font-semibold text-slate-800 text-[11px] block">
                  Recurring Weekly Pattern:
                </span>
                <div className="space-y-1 font-mono text-[11px]">
                  {selectedDoctor.weeklyPattern?.map((pat, idx) => (
                    <div key={idx} className="flex items-center justify-between text-slate-600">
                      <span>{WEEKDAY_NAMES[pat.weekday]}</span>
                      <span className="font-semibold text-slate-800">
                        {pat.startTime} – {pat.endTime}
                      </span>
                      <span className="text-slate-400">({pat.room || 'No Room'})</span>
                    </div>
                  ))}
                  {(!selectedDoctor.weeklyPattern || selectedDoctor.weeklyPattern.length === 0) && (
                    <span className="text-slate-400 italic">No recurring pattern configured.</span>
                  )}
                </div>
              </div>

              {/* Concrete Sessions Table */}
              <div className="space-y-2">
                <span className="font-semibold text-slate-800 text-[11px] block">
                  Concrete Session Bookings ({context.activeSchedulePeriod}):
                </span>

                <div className="max-h-[360px] overflow-y-auto border border-slate-200 rounded divide-y divide-slate-100">
                  {selectedDoctorSessions.map((sess) => (
                    <div
                      key={sess.id}
                      className={`p-2.5 flex items-center justify-between text-xs ${
                        sess.cancelled ? 'bg-red-50/50 opacity-60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-slate-900">
                            {sess.date}
                          </span>
                          <span className="font-mono text-slate-600 text-[11px]">
                            {sess.startTime} – {sess.endTime}
                          </span>
                          {sess.source === 'PATTERN' && (
                            <span className="text-[10px] text-slate-400 font-mono" title="Recurring pattern session">
                              ↻
                            </span>
                          )}
                          {sess.cancelled && (
                            <span className="px-1.5 py-0.2 rounded bg-red-100 text-red-700 font-mono text-[10px] font-bold">
                              CANCELLED
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span>Room: {sess.room || 'Suite 101'}</span>
                          <span>·</span>
                          <span>Specialty: {specialties.find((s) => s.id === sess.specialtyId)?.code}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleCancelSession(sess)}
                          className={`px-2 py-1 rounded text-[10px] font-medium cursor-pointer transition-colors ${
                            sess.cancelled
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-red-50 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          {sess.cancelled ? 'Restore' : 'Cancel'}
                        </button>

                        <button
                          onClick={() => {
                            setEditingSession(sess);
                            setIsSessionModalOpen(true);
                          }}
                          className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                          title="Edit Session Times"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {selectedDoctorSessions.length === 0 && (
                    <div className="p-4 text-center text-slate-400 text-xs">
                      No concrete sessions generated yet. Click "Expand Pattern to Dates" to populate October 2026.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded p-8 text-center text-xs space-y-2">
              <Stethoscope className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-700">No Doctor Selected</p>
              <p className="text-slate-400">
                {doctors.length === 0
                  ? 'Add physicians to configure clinic session patterns and room bookings.'
                  : 'Select a doctor on the left to inspect and manage their booked sessions.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* DOCTOR ADD / EDIT MODAL */}
      {isDoctorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-800">
                  {editingDoctor ? `Edit Doctor: ${editingDoctor.fullName}` : 'Add New Doctor'}
                </h2>
              </div>
              <button
                onClick={() => setIsDoctorModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDoctor} className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Inline Validation / Error Banner */}
              {inlineError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-snug">{inlineError}</div>
                  <button
                    type="button"
                    onClick={() => setInlineError(null)}
                    className="text-rose-400 hover:text-rose-600 font-bold px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Full Name (e.g. Dr. Ali Hassan) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Dr. Full Name"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Gmail Address (Optional)
                  </label>
                  <input
                    type="email"
                    value={formData.gmail}
                    onChange={(e) => setFormData({ ...formData, gmail: e.target.value })}
                    placeholder="doctor@alshifa.ae"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-medium text-slate-700">
                      Clinical Specialties <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddingSpecialty(!isAddingSpecialty)}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                    >
                      {isAddingSpecialty ? 'Cancel' : '+ New Specialty'}
                    </button>
                  </div>

                  {/* Inline quick-add specialty box */}
                  {isAddingSpecialty && (
                    <div className="p-2 mb-2 bg-indigo-50/70 border border-indigo-200 rounded flex gap-1.5 items-center animate-in fade-in">
                      <input
                        type="text"
                        placeholder="e.g. Dermatology"
                        value={newSpecialtyName}
                        onChange={(e) => setNewSpecialtyName(e.target.value)}
                        className="flex-1 px-2 py-1 bg-white border border-indigo-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuickAddSpecialty(newSpecialtyName)}
                        disabled={!newSpecialtyName.trim()}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium disabled:opacity-50 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  )}

                  {specialties.length > 0 ? (
                    <div>
                      <select
                        multiple
                        value={formData.specialtyIds}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
                          setFormData({ ...formData, specialtyIds: selected });
                        }}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white h-20 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      >
                        {specialties.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Hold Ctrl / Cmd to select multiple specialties.
                      </span>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-slate-50 border border-dashed border-slate-300 rounded text-xs space-y-1.5">
                      <p className="text-slate-500 text-[11px]">
                        No specialties registered yet. Click a quick preset to assign:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuickAddSpecialty('General Practice', 'GP')}
                          className="px-2 py-1 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded text-[11px] text-indigo-700 font-medium cursor-pointer shadow-2xs"
                        >
                          + General Practice (GP)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAddSpecialty('Internal Medicine', 'IM')}
                          className="px-2 py-1 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded text-[11px] text-indigo-700 font-medium cursor-pointer shadow-2xs"
                        >
                          + Internal Medicine (IM)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAddSpecialty('Pediatrics', 'PED')}
                          className="px-2 py-1 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded text-[11px] text-indigo-700 font-medium cursor-pointer shadow-2xs"
                        >
                          + Pediatrics (PED)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAddSpecialty('Cardiology', 'CARD')}
                          className="px-2 py-1 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded text-[11px] text-indigo-700 font-medium cursor-pointer shadow-2xs"
                        >
                          + Cardiology (CARD)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Weekly Pattern Editor */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block font-semibold text-slate-800">
                      Weekly Recurring Clinic Pattern
                    </label>
                    <p className="text-[10px] text-slate-500">
                      Define the recurring days, operating hours, and room bookings for this doctor.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddPatternRow}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium text-[11px] cursor-pointer"
                  >
                    + Add Day Shift
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.weeklyPattern.map((pat, idx) => (
                    <div
                      key={idx}
                      className="p-2 border border-slate-200 rounded bg-slate-50 flex items-center gap-2"
                    >
                      <select
                        value={pat.weekday}
                        onChange={(e) =>
                          handlePatternChange(idx, 'weekday', Number(e.target.value))
                        }
                        className="px-2 py-1 border border-slate-300 rounded bg-white font-medium"
                      >
                        {WEEKDAY_NAMES.map((name, wIdx) => (
                          <option key={wIdx} value={wIdx}>
                            {name}
                          </option>
                        ))}
                      </select>

                      <input
                        type="time"
                        value={pat.startTime}
                        onChange={(e) => handlePatternChange(idx, 'startTime', e.target.value)}
                        className="w-24 px-1.5 py-1 border border-slate-300 rounded font-mono text-center bg-white"
                      />
                      <span className="text-slate-400">to</span>
                      <input
                        type="time"
                        value={pat.endTime}
                        onChange={(e) => handlePatternChange(idx, 'endTime', e.target.value)}
                        className="w-24 px-1.5 py-1 border border-slate-300 rounded font-mono text-center bg-white"
                      />

                      <input
                        type="text"
                        placeholder="Suite 101"
                        value={pat.room || ''}
                        onChange={(e) => handlePatternChange(idx, 'room', e.target.value)}
                        className="w-24 px-2 py-1 border border-slate-300 rounded bg-white font-mono text-[11px]"
                      />

                      <button
                        type="button"
                        onClick={() => handleRemovePatternRow(idx)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {formData.weeklyPattern.length === 0 && (
                    <div className="text-center py-3 border border-dashed border-slate-200 rounded text-slate-400 text-[11px]">
                      No weekly recurring pattern. Click "+ Add Day Shift".
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes / Bio</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="e.g. Senior Consultant Cardiologist"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <span className="font-semibold text-slate-800">
                    Active doctor (clinic sessions open for roster pairing)
                  </span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDoctorModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Doctor...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Doctor</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXPAND PATTERN MODAL */}
      {isExpandModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900">
              Expand Weekly Patterns to Concrete Sessions
            </h3>
            <p className="text-[11px] text-slate-500">
              Generates concrete doctor session records across a designated date range based on weekly recurring patterns.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Target Doctor</label>
                <select
                  value={expandRange.targetDoctorId}
                  onChange={(e) =>
                    setExpandRange({ ...expandRange, targetDoctorId: e.target.value })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="ALL">All Active Doctors ({doctors.length})</option>
                  {[...doctors]
                    .sort((a, b) => a.fullName.localeCompare(b.fullName))
                    .map((d) => {
                      const docSpec = specialties
                        .filter((s) => d.specialtyIds?.includes(s.id))
                        .map((s) => s.name)
                        .join(', ');
                      return (
                        <option key={d.id} value={d.id}>
                          {d.fullName}{docSpec ? ` — ${docSpec}` : ''}
                        </option>
                      );
                    })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={expandRange.startDate}
                    onChange={(e) =>
                      setExpandRange({ ...expandRange, startDate: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={expandRange.endDate}
                    onChange={(e) =>
                      setExpandRange({ ...expandRange, endDate: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsExpandModalOpen(false)}
                className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExpandPatternToSessions}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium cursor-pointer"
              >
                Expand Sessions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AD-HOC SESSION OVERRIDE MODAL */}
      {isSessionModalOpen && editingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-sm w-full p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900">
              {editingSession.id ? 'Edit Clinic Session' : 'Add Ad-hoc Session'}
            </h3>

            <form onSubmit={handleSaveAdHocSession} className="space-y-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={editingSession.date}
                  onChange={(e) =>
                    setEditingSession({ ...editingSession, date: e.target.value })
                  }
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={editingSession.startTime}
                    onChange={(e) =>
                      setEditingSession({ ...editingSession, startTime: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={editingSession.endTime}
                    onChange={(e) =>
                      setEditingSession({ ...editingSession, endTime: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Room / Suite</label>
                <input
                  type="text"
                  value={editingSession.room || ''}
                  onChange={(e) =>
                    setEditingSession({ ...editingSession, room: e.target.value })
                  }
                  placeholder="Suite 101"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSessionModalOpen(false);
                    setEditingSession(null);
                  }}
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium cursor-pointer"
                >
                  Save Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
