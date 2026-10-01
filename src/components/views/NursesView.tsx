import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Search,
  Filter,
  Shield,
  ShieldCheck,
  Mail,
  Calendar,
  Percent,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  GripVertical,
  Info,
  Droplets,
  Heart,
  Save,
  X,
  Upload,
  Stethoscope,
} from 'lucide-react';
import { ClinicContextState } from '../../types/navigation';
import { getRepository } from '../../services/repository';
import { isExclusiveNurseClinic } from '../../services/engine/nurseClinicUtils';
import {
  Nurse,
  SeniorityLevel,
  ClinicalRole,
  Specialty,
  Doctor,
  NursePreference,
  LeaveType,
} from '../../types';
import { BulkImportModal } from '../modals/BulkImportModal';

interface NursesViewProps {
  context: ClinicContextState;
}

export const NursesView: React.FC<NursesViewProps> = ({ context }) => {
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [seniorityLevels, setSeniorityLevels] = useState<SeniorityLevel[]>([]);
  const [clinicalRoles, setClinicalRoles] = useState<ClinicalRole[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeniorityFilter, setSelectedSeniorityFilter] = useState<string>('ALL');
  const [activeStatusFilter, setActiveStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal / Drawer state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [editingNurse, setEditingNurse] = useState<Nurse | null>(null);

  // Form State
  const [formData, setFormData] = useState<{
    id?: string;
    fullName: string;
    gmail: string;
    employeeCode: string;
    seniorityLevelId: string;
    contractPercent: number;
    dateOfBirth: string;
    capabilityIds: string[];
    isClinicNurse: boolean;
    preferences: NursePreference[];
    leaveQuotas: Record<string, number>;
    active: boolean;
    notes: string;
  }>({
    fullName: '',
    gmail: '',
    employeeCode: '',
    seniorityLevelId: '',
    contractPercent: 100,
    dateOfBirth: '1995-01-01',
    capabilityIds: [],
    isClinicNurse: true,
    preferences: [],
    leaveQuotas: {},
    active: true,
    notes: '',
  });

  const isOnlyNcCapability =
    formData.capabilityIds.length > 0 &&
    formData.capabilityIds.every(
      (cid) =>
        cid === 'role-nurse-clinic' ||
        clinicalRoles.find((r) => r.id === cid)?.acronym === 'NC' ||
        clinicalRoles.find((r) => r.id === cid)?.name.toLowerCase().includes('nurse clinic')
    );
  const isConfiguredExclusiveNC = !formData.isClinicNurse && isOnlyNcCapability;

  // Validation Warnings
  const [formErrors, setFormErrors] = useState<{ gmail?: string; fullName?: string }>({});
  const [formWarnings, setFormWarnings] = useState<string[]>([]);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  // Drag and drop state for preferences priority
  const [draggedPrefIdx, setDraggedPrefIdx] = useState<number | null>(null);
  const [dragOverPrefIdx, setDragOverPrefIdx] = useState<number | null>(null);

  const repo = getRepository();

  const loadAllData = async () => {
    try {
      const [nList, sList, crList, spList, dList, ltList] = await Promise.all([
        repo.list('nurses'),
        repo.list('seniorityLevels'),
        repo.list('clinicalRoles'),
        repo.list('specialties'),
        repo.list('doctors'),
        repo.list('leaveTypes'),
      ]);
      setNurses(nList);
      setSeniorityLevels(sList.sort((a, b) => a.rank - b.rank));
      setClinicalRoles(crList);
      setSpecialties(spList);
      setDoctors(dList);
      setLeaveTypes(ltList);
    } catch (err) {
      console.error('Error loading nurses data:', err);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const triggerNotification = (msg: string) => {
    setSaveBanner(msg);
    setTimeout(() => setSaveBanner(null), 3000);
  };

  const handleOpenAdd = () => {
    const defaultSeniority = seniorityLevels[2]?.id || seniorityLevels[0]?.id || '';
    setEditingNurse(null);
    setFormData({
      fullName: '',
      gmail: '',
      employeeCode: `N-${100 + nurses.length + 1}`,
      seniorityLevelId: defaultSeniority,
      contractPercent: 100,
      dateOfBirth: '1995-05-15',
      capabilityIds: [],
      isClinicNurse: true,
      preferences: [],
      leaveQuotas: {},
      active: true,
      notes: '',
    });
    setFormErrors({});
    setFormWarnings([]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (nurse: Nurse) => {
    setEditingNurse(nurse);
    const rawQuotas = nurse.leaveQuotas || {};
    const normalizedQuotas: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawQuotas)) {
      const lt = leaveTypes.find((l) => l.id === k);
      const isSick = lt?.id === 'leave-sl' || lt?.acronym?.toUpperCase() === 'SL' || lt?.name?.toLowerCase().includes('sick');
      if (!isSick && typeof v === 'number' && v > 0) {
        // Convert legacy hours to days if > 40 and divisible by 8 (e.g. 240h -> 30d)
        normalizedQuotas[k] = v > 40 && v % 8 === 0 ? v / 8 : v;
      }
    }

    setFormData({
      id: nurse.id,
      fullName: nurse.fullName,
      gmail: nurse.gmail,
      employeeCode: nurse.employeeCode,
      seniorityLevelId: nurse.seniorityLevelId,
      contractPercent: nurse.contractPercent,
      dateOfBirth: nurse.dateOfBirth,
      capabilityIds: nurse.capabilityIds || [],
      isClinicNurse: nurse.isClinicNurse !== false,
      preferences: nurse.preferences || [],
      leaveQuotas: normalizedQuotas,
      active: nurse.active,
      notes: nurse.notes || '',
    });
    setFormErrors({});
    validateFormRealtime(nurse.gmail, nurse.fullName, nurse.preferences || [], nurse.id);
    setIsModalOpen(true);
  };

  const validateFormRealtime = (
    gmail: string,
    fullName: string,
    prefs: NursePreference[],
    nurseId?: string
  ) => {
    const errors: { gmail?: string; fullName?: string } = {};
    const warnings: string[] = [];

    if (!fullName.trim()) {
      errors.fullName = 'Full name is required.';
    }

    const gmailTrimmed = gmail.trim().toLowerCase();
    if (!gmailTrimmed) {
      errors.gmail = 'Gmail address is required for roster publishing and change notifications.';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(gmailTrimmed)) {
        errors.gmail = 'Please enter a valid email address.';
      } else if (!gmailTrimmed.endsWith('@gmail.com') && !gmailTrimmed.includes('.')) {
        warnings.push('Address does not end with @gmail.com — verify this account can receive Google notifications.');
      }

      // Duplicate check
      const duplicate = nurses.find(
        (n) => n.gmail.toLowerCase() === gmailTrimmed && n.id !== nurseId
      );
      if (duplicate) {
        errors.gmail = `Gmail address is already assigned to ${duplicate.fullName}.`;
      }
    }

    if (prefs.length === 0) {
      warnings.push('Nurse has no doctor or specialty preferences — engine will assign any available pairing.');
    }

    setFormErrors(errors);
    setFormWarnings(warnings);
    return Object.keys(errors).length === 0;
  };

  const handleSaveNurse = async (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = validateFormRealtime(
      formData.gmail,
      formData.fullName,
      formData.preferences,
      formData.id
    );
    if (!isValid) return;

    // Sanitize leave quotas: only store non-negative days, purge sick leave completely
    const cleanQuotas: Record<string, number> = {};
    for (const [k, v] of Object.entries(formData.leaveQuotas)) {
      const lt = leaveTypes.find((l) => l.id === k);
      const isSick =
        lt?.id === 'leave-sl' ||
        lt?.acronym?.toUpperCase() === 'SL' ||
        lt?.name?.toLowerCase().includes('sick');
      if (!isSick && typeof v === 'number' && v > 0) {
        cleanQuotas[k] = Math.round(v);
      }
    }

    const isOnlyNcCapability =
      formData.capabilityIds.length > 0 &&
      formData.capabilityIds.every(
        (cid) =>
          cid === 'role-nurse-clinic' ||
          clinicalRoles.find((r) => r.id === cid)?.acronym === 'NC' ||
          clinicalRoles.find((r) => r.id === cid)?.name.toLowerCase().includes('nurse clinic')
      );
    const isConfiguredExclusiveNC = !formData.isClinicNurse && isOnlyNcCapability;
    const finalPreferences = isConfiguredExclusiveNC
      ? formData.preferences.filter((p) => p.kind !== 'DOCTOR' && p.kind !== 'SPECIALTY')
      : formData.preferences;

    try {
      if (formData.id) {
        await repo.update('nurses', formData.id, {
          fullName: formData.fullName.trim(),
          gmail: formData.gmail.trim().toLowerCase(),
          employeeCode: formData.employeeCode.trim(),
          seniorityLevelId: formData.seniorityLevelId,
          contractPercent: Number(formData.contractPercent),
          dateOfBirth: formData.dateOfBirth,
          capabilityIds: formData.capabilityIds,
          isClinicNurse: formData.isClinicNurse,
          preferences: finalPreferences,
          leaveQuotas: cleanQuotas,
          active: formData.active,
          notes: formData.notes,
          updatedAt: new Date().toISOString(),
        });
        triggerNotification(`Updated profile for ${formData.fullName}.`);
      } else {
        await repo.create('nurses', {
          fullName: formData.fullName.trim(),
          gmail: formData.gmail.trim().toLowerCase(),
          employeeCode: formData.employeeCode.trim(),
          seniorityLevelId: formData.seniorityLevelId,
          contractPercent: Number(formData.contractPercent),
          dateOfBirth: formData.dateOfBirth,
          capabilityIds: formData.capabilityIds,
          isClinicNurse: formData.isClinicNurse,
          preferences: finalPreferences,
          leaveQuotas: cleanQuotas,
          active: formData.active,
          notes: formData.notes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        triggerNotification(`Added nurse ${formData.fullName}.`);
      }
      setIsModalOpen(false);
      loadAllData();
    } catch (err: any) {
      alert(`Error saving nurse: ${err.message}`);
    }
  };

  const handleDeleteNurse = async (id: string, name: string) => {
    if (confirm(`Remove nurse "${name}" from roster database?`)) {
      await repo.remove('nurses', id);
      triggerNotification(`Nurse ${name} removed.`);
      loadAllData();
    }
  };

  // Preference list helpers
  const handleAddPreference = (kind: 'DOCTOR' | 'SPECIALTY', refId: string) => {
    if (!refId) return;
    if (formData.preferences.some((p) => p.kind === kind && p.refId === refId)) {
      alert('This doctor or specialty preference has already been added.');
      return;
    }
    const newPref: NursePreference = {
      kind,
      refId,
      rank: formData.preferences.length + 1,
    };
    const nextPrefs = [...formData.preferences, newPref];
    setFormData({ ...formData, preferences: nextPrefs });
    validateFormRealtime(formData.gmail, formData.fullName, nextPrefs, formData.id);
  };

  const handleReorderPreference = (sourceIdx: number, targetIdx: number) => {
    if (sourceIdx === targetIdx || sourceIdx < 0 || targetIdx < 0) return;
    const list = [...formData.preferences];
    const [movedItem] = list.splice(sourceIdx, 1);
    list.splice(targetIdx, 0, movedItem);

    // Recalculate 1-based ranks
    const updated = list.map((p, idx) => ({ ...p, rank: idx + 1 }));
    setFormData({ ...formData, preferences: updated });
    validateFormRealtime(formData.gmail, formData.fullName, updated, formData.id);
  };

  const handleRemovePreference = (index: number) => {
    const list = formData.preferences
      .filter((_, idx) => idx !== index)
      .map((p, idx) => ({ ...p, rank: idx + 1 }));
    setFormData({ ...formData, preferences: list });
    validateFormRealtime(formData.gmail, formData.fullName, list, formData.id);
  };

  const toggleCapability = (roleId: string) => {
    const current = new Set(formData.capabilityIds);
    if (current.has(roleId)) {
      current.delete(roleId);
    } else {
      current.add(roleId);
    }
    setFormData({ ...formData, capabilityIds: Array.from(current) });
  };

  // Filtering
  const filteredNurses = nurses.filter((n) => {
    const matchesSearch =
      n.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.gmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.employeeCode.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSeniority =
      selectedSeniorityFilter === 'ALL' || n.seniorityLevelId === selectedSeniorityFilter;

    const matchesActive =
      activeStatusFilter === 'ALL' ||
      (activeStatusFilter === 'ACTIVE' && n.active) ||
      (activeStatusFilter === 'INACTIVE' && !n.active);

    return matchesSearch && matchesSeniority && matchesActive;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification */}
      {saveBanner && (
        <div className="fixed top-16 right-6 z-50 bg-slate-900 text-white text-xs px-4 py-2.5 rounded shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{saveBanner}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Nursing Staff &amp; Profiles</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage nurse identities, seniority designations, Gmail notification accounts, clinical capabilities (e.g. Blood Collection &amp; IV), and ordered pairing preferences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsBulkImportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
            title="Bulk import nurses from CSV"
          >
            <Upload className="w-3.5 h-3.5 text-slate-500" />
            <span>Bulk CSV Import</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Nurse</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white border border-slate-200 rounded p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-1 items-center gap-2 min-w-[240px] max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search by nurse name, employee code or Gmail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Seniority:</span>
            <select
              value={selectedSeniorityFilter}
              onChange={(e) => setSelectedSeniorityFilter(e.target.value)}
              className="px-2 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
            >
              <option value="ALL">All Levels ({nurses.length})</option>
              {seniorityLevels.map((lvl) => (
                <option key={lvl.id} value={lvl.id}>
                  {lvl.name} {lvl.isSenior ? '(Senior)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-slate-500">Status:</span>
            <select
              value={activeStatusFilter}
              onChange={(e) => setActiveStatusFilter(e.target.value as any)}
              className="px-2 py-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Staff</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Nurses Table */}
      <div className="bg-white border border-slate-200 rounded overflow-hidden shadow-xs">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-medium">
            <tr>
              <th className="py-2.5 px-3">Nurse / Code</th>
              <th className="py-2.5 px-3">Seniority Level</th>
              <th className="py-2.5 px-3">Gmail Notification Account</th>
              <th className="py-2.5 px-3">Contract / Target</th>
              <th className="py-2.5 px-3">Capabilities</th>
              <th className="py-2.5 px-3">Preferences</th>
              <th className="py-2.5 px-3">Date of Birth</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredNurses.map((nurse) => {
              const seniority = seniorityLevels.find((s) => s.id === nurse.seniorityLevelId);
              const hasPhl = nurse.capabilityIds?.includes('role-phl');
              const isExclusiveNC = isExclusiveNurseClinic(nurse, clinicalRoles);

              return (
                <tr key={nurse.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[11px] shrink-0">
                        {nurse.fullName.charAt(0)}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-900 block">
                          {nurse.fullName}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {nurse.employeeCode}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="py-2.5 px-3">
                    {seniority ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
                        style={{
                          backgroundColor: `${seniority.color}15`,
                          color: seniority.color,
                        }}
                      >
                        {seniority.isSenior && <Shield className="w-3 h-3 shrink-0" />}
                        <span>{seniority.name}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 font-mono text-[11px]">—</span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 font-mono text-slate-700">
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[180px]">{nurse.gmail}</span>
                    </div>
                  </td>

                  <td className="py-2.5 px-3 font-mono">
                    <div className="flex items-baseline gap-1">
                      <span className="font-bold text-slate-800">{nurse.contractPercent}%</span>
                      <span className="text-[10px] text-slate-500">
                        ({nurse.contractPercent === 100 ? 'Full-Time' : 'Part-Time'})
                      </span>
                    </div>
                  </td>

                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1">
                      {isExclusiveNC ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-medium text-[10px] border border-emerald-200"
                          title="Exclusively dedicated to Nurse Clinic (no doctor pairings)"
                        >
                          <Stethoscope className="w-3 h-3 text-emerald-600" />
                          <span>Exclusive NC</span>
                        </span>
                      ) : (
                        <>
                          {hasPhl && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-mono text-[10px] font-semibold border border-rose-200"
                              title="Qualified for Blood Collection & IV (PHL) quota"
                            >
                              <Droplets className="w-3 h-3 text-rose-600" />
                              <span>PHL</span>
                            </span>
                          )}
                          {nurse.isClinicNurse && (
                            <span
                              className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[10px] border border-blue-200"
                              title="General Clinic Nurse"
                            >
                              Clinic
                            </span>
                          )}
                          {!hasPhl && !nurse.isClinicNurse && (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </>
                      )}
                    </div>
                  </td>

                  <td className="py-2.5 px-3">
                    {isExclusiveNC ? (
                      <span className="text-emerald-700 text-[10px] font-medium bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                        Dedicated NC (No doctor pairings)
                      </span>
                    ) : nurse.preferences && nurse.preferences.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {nurse.preferences.slice(0, 2).map((pref, i) => {
                          const doc = doctors.find((d) => d.id === pref.refId);
                          const sp = specialties.find((s) => s.id === pref.refId);
                          const docSpec = doc
                            ? specialties.find((s) => doc.specialtyIds?.includes(s.id))
                            : undefined;
                          const label = doc
                            ? `${doc.fullName.split(' ')[1] || doc.fullName}${docSpec ? ` (${docSpec.code || docSpec.name})` : ''}`
                            : sp?.code || pref.refId;
                          return (
                            <span
                              key={i}
                              className="px-1.5 py-0.2 bg-slate-100 rounded text-[10px] font-mono text-slate-700 border border-slate-200"
                            >
                              #{pref.rank} {label}
                            </span>
                          );
                        })}
                        {nurse.preferences.length > 2 && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            +{nurse.preferences.length - 2}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[10px] italic">General Float Pool</span>
                    )}
                  </td>

                  <td className="py-2.5 px-3 font-mono text-slate-600">
                    <span title="Drives automatic Birthday Leave entitlement">
                      {nurse.dateOfBirth}
                    </span>
                  </td>

                  <td className="py-2.5 px-3">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        nurse.active
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {nurse.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  <td className="py-2.5 px-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(nurse)}
                        className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                        title="Edit profile"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteNurse(nurse.id, nurse.fullName)}
                        className="p-1 hover:bg-red-50 rounded text-red-600 cursor-pointer"
                        title="Delete nurse"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredNurses.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 px-4 text-center">
                  <div className="max-w-xs mx-auto space-y-3">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">No Nurses Registered</h4>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {nurses.length === 0
                          ? 'The nurse directory is currently empty. Click "Add Nurse" to register clinical staff.'
                          : 'No nurses matched your current filter criteria.'}
                      </p>
                    </div>
                    {nurses.length === 0 && (
                      <button
                        onClick={handleOpenAdd}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold cursor-pointer shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add First Nurse</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* NURSE PROFILE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-800">
                  {editingNurse ? `Edit Profile: ${editingNurse.fullName}` : 'Add New Nurse'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveNurse} className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Warnings Banner */}
              {formWarnings.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 space-y-1 text-[11px]">
                  {formWarnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Section 1: Identity */}
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-1">
                  1. Identity &amp; Notification Account
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, fullName: val });
                        validateFormRealtime(formData.gmail, val, formData.preferences, formData.id);
                      }}
                      placeholder="e.g. Maryam Al-Nuaimi"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500"
                    />
                    {formErrors.fullName && (
                      <span className="text-red-600 text-[10px] mt-0.5 block">
                        {formErrors.fullName}
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Gmail Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.gmail}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({ ...formData, gmail: val });
                        validateFormRealtime(val, formData.fullName, formData.preferences, formData.id);
                      }}
                      placeholder="e.g. nurse@gmail.com"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                    />
                    {formErrors.gmail ? (
                      <span className="text-red-600 text-[10px] mt-0.5 block">
                        {formErrors.gmail}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Required — no notifications or personal read-only links without Gmail.
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Employee Code
                    </label>
                    <input
                      type="text"
                      value={formData.employeeCode}
                      onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                      placeholder="e.g. N-101"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Drives automatic Birthday Leave entitlement.
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 2: Seniority & Contract */}
              <div className="space-y-3 pt-2">
                <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-1">
                  2. Seniority &amp; Working Contract
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Seniority Level (Designates H1 Senior Rule)
                    </label>
                    <select
                      value={formData.seniorityLevelId}
                      onChange={(e) =>
                        setFormData({ ...formData, seniorityLevelId: e.target.value })
                      }
                      className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      {seniorityLevels.map((lvl) => (
                        <option key={lvl.id} value={lvl.id}>
                          {lvl.name} {lvl.isSenior ? '★ (Fulfills H1 Senior On Duty)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Contract Percentage (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={10}
                        max={100}
                        value={formData.contractPercent}
                        onChange={(e) =>
                          setFormData({ ...formData, contractPercent: Number(e.target.value) })
                        }
                        className="w-24 px-3 py-1.5 border border-slate-300 rounded font-mono text-center font-bold"
                      />
                      <span className="text-slate-500 text-[11px]">
                        {formData.contractPercent === 100
                          ? 'Full-time (100% of roster target hours)'
                          : `Part-time (${formData.contractPercent}% of roster target hours)`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Clinical Capabilities */}
              <div className="space-y-3 pt-2">
                <h3 className="font-semibold text-slate-800 border-b border-slate-100 pb-1">
                  3. Clinical Capabilities &amp; Quotas
                </h3>

                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 p-2 border border-slate-200 rounded cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={formData.isClinicNurse}
                      onChange={(e) =>
                        setFormData({ ...formData, isClinicNurse: e.target.checked })
                      }
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <div>
                      <span className="font-semibold text-slate-800">Clinic Nurse</span>
                      <p className="text-[10px] text-slate-500">
                        Default outpatient clinic doctor-pairing support.
                      </p>
                    </div>
                  </label>

                  {clinicalRoles.map((role) => {
                    const isChecked = formData.capabilityIds.includes(role.id);
                    return (
                      <label
                        key={role.id}
                        className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-rose-50/50 border-rose-300'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCapability(role.id)}
                          className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                        />
                        <div>
                          <div className="flex items-center gap-1">
                            <Droplets className="w-3.5 h-3.5 text-rose-600" />
                            <span className="font-semibold text-slate-800">
                              {role.name} ({role.acronym})
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                              {role.defaultStartTime || '09:00'}–{role.defaultEndTime || '13:00'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500">{role.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {isConfiguredExclusiveNC && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-start gap-2.5 text-emerald-900 mt-2">
                    <Stethoscope className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-xs text-emerald-950 block">
                        ★ Exclusive Nurse Clinic Staff Designation Active
                      </span>
                      <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                        This nurse is not a Clinic Nurse and is dedicated exclusively to the Nurse Clinic. The scheduler will strictly assign them to Nurse Clinic sessions and will never pair them with doctors or specialty clinics.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Ordered Preferences List */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col gap-1 border-b border-slate-100 pb-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">
                      4. Doctor &amp; Specialty Preferences &amp; Department Allocations
                    </h3>
                    <span className="text-[10px] text-slate-500">
                      Drag to reorder priority · Rank 1 = +50 pts · Rank 2 = +30 pts · Rank 3 = +15 pts
                    </span>
                  </div>
                  <div className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200/60 rounded px-2.5 py-1.5 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>
                      <strong>Strict Allocation Rule:</strong> Nurses with specific doctor or specialty allocations will only be scheduled to those departments during roster generation. Staff without allocations remain available for general clinic float pool.
                    </span>
                  </div>
                </div>

                {isConfiguredExclusiveNC ? (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="font-semibold text-xs">
                        Doctor &amp; Specialty Preferences are Inactive
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Because this nurse is designated as <strong>Exclusive Nurse Clinic</strong>, doctor pairings and specialty clinic assignments are not applicable.
                    </p>
                    {formData.preferences.some((p) => p.kind === 'DOCTOR' || p.kind === 'SPECIALTY') && (
                      <div className="pt-1.5 flex items-center justify-between border-t border-slate-200">
                        <span className="text-amber-700 text-[11px] font-medium">
                          ⚠️ {formData.preferences.filter((p) => p.kind === 'DOCTOR' || p.kind === 'SPECIALTY').length} existing doctor/specialty preferences will be cleared on save.
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              preferences: formData.preferences.filter(
                                (p) => p.kind !== 'DOCTOR' && p.kind !== 'SPECIALTY'
                              ),
                            })
                          }
                          className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-xs text-slate-700 cursor-pointer font-medium"
                        >
                          Clear Preferences Now
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Preference Picker Add Row */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded flex flex-wrap items-center gap-2">
                  <span className="text-slate-600 font-medium">Add Preference:</span>
                  <select
                    id="prefKindSelect"
                    defaultValue="DOCTOR"
                    className="px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                  >
                    <option value="DOCTOR">Doctor</option>
                    <option value="SPECIALTY">Specialty</option>
                  </select>

                  <select
                    id="prefRefSelect"
                    className="px-2 py-1 border border-slate-300 rounded bg-white text-xs max-w-xs"
                  >
                    <optgroup label="Doctors (A to Z)">
                      {[...doctors]
                        .sort((a, b) => a.fullName.localeCompare(b.fullName))
                        .map((d) => {
                          const docSpecs = specialties
                            .filter((s) => d.specialtyIds?.includes(s.id))
                            .map((s) => s.name)
                            .join(', ');
                          return (
                            <option key={d.id} value={`DOCTOR:${d.id}`}>
                              {d.fullName}{docSpecs ? ` (${docSpecs})` : ''}
                            </option>
                          );
                        })}
                    </optgroup>
                    <optgroup label="Specialties">
                      {[...specialties]
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((s) => (
                          <option key={s.id} value={`SPECIALTY:${s.id}`}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                    </optgroup>
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      const select = document.getElementById('prefRefSelect') as HTMLSelectElement;
                      if (!select.value) return;
                      const [kind, refId] = select.value.split(':');
                      handleAddPreference(kind as any, refId);
                    }}
                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium cursor-pointer"
                  >
                    + Add to Priority List
                  </button>
                </div>

                {/* Preference Ordered List */}
                <div className="space-y-1.5">
                  {formData.preferences.map((pref, idx) => {
                    const doc = doctors.find((d) => d.id === pref.refId);
                    const sp = specialties.find((s) => s.id === pref.refId);
                    const docSpecs = doc
                      ? specialties
                          .filter((s) => doc.specialtyIds?.includes(s.id))
                          .map((s) => s.name)
                          .join(', ')
                      : '';
                    const title = doc ? doc.fullName : sp ? `${sp.name} (${sp.code})` : pref.refId;
                    const specialtyLabel = doc ? (docSpecs || 'Doctor') : sp ? sp.name : pref.kind;
                    const isDragging = draggedPrefIdx === idx;
                    const isDragOver = dragOverPrefIdx === idx;

                    return (
                      <div
                        key={idx}
                        draggable
                        onDragStart={(e) => {
                          setDraggedPrefIdx(idx);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(idx));
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverPrefIdx !== idx) {
                            setDragOverPrefIdx(idx);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverPrefIdx === idx) {
                            setDragOverPrefIdx(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (draggedPrefIdx !== null && draggedPrefIdx !== idx) {
                            handleReorderPreference(draggedPrefIdx, idx);
                          }
                          setDraggedPrefIdx(null);
                          setDragOverPrefIdx(null);
                        }}
                        onDragEnd={() => {
                          setDraggedPrefIdx(null);
                          setDragOverPrefIdx(null);
                        }}
                        className={`flex items-center justify-between p-2 rounded border transition-all select-none cursor-grab active:cursor-grabbing ${
                          isDragging
                            ? 'opacity-40 border-indigo-400 bg-indigo-50/50 shadow-inner scale-[0.99]'
                            : isDragOver
                            ? 'border-indigo-600 bg-indigo-50/80 shadow-md ring-2 ring-indigo-400 ring-offset-1'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="p-1 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                            title="Drag to change priority rank"
                          >
                            <GripVertical className="w-4 h-4" />
                          </div>
                          <span className="w-5 h-5 rounded bg-indigo-50 text-indigo-700 flex items-center justify-center font-mono font-bold text-[10px]">
                            #{pref.rank}
                          </span>
                          <span className="font-medium text-slate-800">{title}</span>
                          <span className="text-[10px] font-mono font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                            [{specialtyLabel}]
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRemovePreference(idx)}
                            className="p-1 hover:bg-red-50 rounded text-red-500 cursor-pointer ml-1"
                            title="Remove preference"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {formData.preferences.length === 0 && (
                    <div className="text-center py-3 border border-dashed border-slate-200 rounded text-slate-400 text-[11px]">
                      No doctor or specialty allocations configured. Nurse remains available across the general clinic pool.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

              {/* Section 5: Leave Annual Quota (Days per Year) */}
              <div className="space-y-3 pt-2">
                <div className="border-b border-slate-100 pb-1">
                  <h3 className="font-semibold text-slate-800">
                    5. Annual Leave Quotas (Days per Year)
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Specify allowed days per calendar year. Once reached, staff cannot be scheduled beyond their allocated days for capped leave types. Sick leave has no allowed quota ceiling.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {leaveTypes
                    .filter(
                      (lt) =>
                        lt.id !== 'leave-sl' &&
                        lt.acronym?.toUpperCase() !== 'SL' &&
                        !lt.name.toLowerCase().includes('sick') &&
                        !['RO', 'DO'].includes(lt.acronym?.toUpperCase() || '') &&
                        lt.creditedHours !== 0
                    )
                    .map((lt) => (
                      <div key={lt.id} className="p-2 border border-slate-200 rounded bg-slate-50">
                        <label className="block text-[11px] font-medium text-slate-700 truncate" title={lt.name}>
                          {lt.name} ({lt.acronym})
                        </label>
                        <div className="relative mt-1">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder={lt.acronym === 'BL' ? '1' : lt.acronym === 'AL' ? '30' : lt.acronym === 'PH' ? '10' : 'Days'}
                            value={formData.leaveQuotas[lt.id] ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const val = raw !== '' ? Math.max(0, parseInt(raw, 10)) : undefined;
                              const next = { ...formData.leaveQuotas };
                              if (val === undefined || isNaN(val)) {
                                delete next[lt.id];
                              } else {
                                next[lt.id] = val;
                              }
                              setFormData({ ...formData, leaveQuotas: next });
                            }}
                            className="w-full pl-2.5 pr-11 py-1 border border-slate-300 rounded font-mono text-xs bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 select-none">
                            days
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Status & Notes */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <span className="font-semibold text-slate-800">
                    Active staff member (included in roster generation)
                  </span>
                </label>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Certifications, shift requests, or clinical qualifications..."
                    className="w-full px-3 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium transition-colors shadow-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Nurse Profile</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk CSV Import Modal (Phase 14.6) */}
      <BulkImportModal
        seniorityLevels={seniorityLevels}
        specialties={specialties}
        roles={clinicalRoles}
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onImportComplete={() => {
          loadAllData();
          triggerNotification('Nurses imported successfully from CSV.');
        }}
      />
    </div>
  );
};
