/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bulk CSV Import for Nurses & Doctors (Phase 14.6)
 * Supports downloadable CSV templates, client-side parsing, validation preview, and bulk upsert.
 */

import React, { useState } from 'react';
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Users,
  Stethoscope,
  Info,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Nurse, Doctor, SeniorityLevel, Specialty, ClinicalRole } from '../../types';
import { getRepository } from '../../services/repository';

interface BulkImportModalProps {
  seniorityLevels: SeniorityLevel[];
  specialties: Specialty[];
  roles: ClinicalRole[];
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  seniorityLevels,
  specialties,
  roles,
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'NURSES' | 'DOCTORS'>('NURSES');
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [errorCount, setErrorCount] = useState(0);
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  // --- SAMPLE CSV DOWNLOADERS ---
  const handleDownloadNurseTemplate = () => {
    const csvContent =
      'fullName,gmail,employeeCode,seniorityLevel,contractPercent,dateOfBirth,capabilities\n' +
      'Amina Mansoor,amina.mansoor@clinic.ae,N-109,Staff Nurse,100,1992-05-14,Clinic Nurse;Blood Collection & IV\n' +
      'Rashid Al-Blooshi,rashid.blooshi@clinic.ae,N-110,Junior Nurse,100,1996-08-22,Clinic Nurse\n' +
      'Nour Al-Huda,nour.alhuda@clinic.ae,N-111,Senior Nurse,50,1989-11-03,Clinic Nurse';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'nurses_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadDoctorTemplate = () => {
    const csvContent =
      'fullName,gmail,specialties,weeklyPattern\n' +
      'Dr. Hamad Al-Suwaidi,dr.hamad@clinic.ae,Cardiology,Sun 09:00-13:00 Room 1;Tue 09:00-13:00 Room 1\n' +
      'Dr. Reem Al-Kindi,dr.reem@clinic.ae,Pediatrics;Dermatology,Mon 09:00-14:00 Room 3;Wed 09:00-14:00 Room 3';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'doctors_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- PARSE CSV ---
  const handleParseCsv = (text: string) => {
    setCsvText(text);
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      setParsedRows([]);
      setErrorCount(0);
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const rows: any[] = [];
    let errors = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = line.split(',').map((v) => v.trim());

      if (activeTab === 'NURSES') {
        const fullName = values[0] || '';
        const gmail = values[1] || '';
        const employeeCode = values[2] || `N-${Math.floor(100 + Math.random() * 900)}`;
        const seniorityName = values[3] || 'Staff Nurse';
        const contractPercent = parseInt(values[4], 10) || 100;
        const dateOfBirth = values[5] || '1995-01-01';

        // Match seniority level
        const matchedSeniority =
          seniorityLevels.find(
            (s) => s.name.toLowerCase() === seniorityName.toLowerCase()
          ) || seniorityLevels[2] || seniorityLevels[0];

        const isValidGmail = gmail.includes('@') && gmail.includes('.');
        if (!fullName || !isValidGmail) errors++;

        rows.push({
          fullName,
          gmail,
          employeeCode,
          seniorityLevelId: matchedSeniority?.id || '',
          seniorityName: matchedSeniority?.name || seniorityName,
          contractPercent,
          dateOfBirth,
          isValid: fullName && isValidGmail,
        });
      } else {
        const fullName = values[0] || '';
        const gmail = values[1] || '';
        const specialtyNames = (values[2] || '').split(';').map((s) => s.trim());
        const patternStr = values[3] || '';

        // Match specialties
        const matchedSpecialtyIds = specialties
          .filter((s) =>
            specialtyNames.some((sn) => s.name.toLowerCase().includes(sn.toLowerCase()))
          )
          .map((s) => s.id);

        const isValid = !!fullName;
        if (!isValid) errors++;

        rows.push({
          fullName,
          gmail,
          specialtyIds: matchedSpecialtyIds.length > 0 ? matchedSpecialtyIds : [specialties[0]?.id || ''],
          patternStr,
          isValid,
        });
      }
    }

    setParsedRows(rows);
    setErrorCount(errors);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleParseCsv(content);
    };
    reader.readAsText(file);
  };

  // --- IMPORT EXECUTION ---
  const handleExecuteImport = async () => {
    if (parsedRows.length === 0 || errorCount > 0) return;
    setIsImporting(true);

    try {
      const repo = getRepository();
      const nowIso = new Date().toISOString();

      if (activeTab === 'NURSES') {
        const nurseEntities: Nurse[] = parsedRows.map((r) => ({
          id: uuidv4(),
          fullName: r.fullName,
          gmail: r.gmail,
          employeeCode: r.employeeCode,
          seniorityLevelId: r.seniorityLevelId,
          contractPercent: r.contractPercent,
          dateOfBirth: r.dateOfBirth,
          capabilityIds: roles.slice(0, 1).map((ro) => ro.id),
          isClinicNurse: true,
          preferences: [],
          active: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        }));

        await repo.bulkUpsert('nurses', nurseEntities);
      } else {
        const doctorEntities: Doctor[] = parsedRows.map((r) => ({
          id: uuidv4(),
          fullName: r.fullName,
          gmail: r.gmail || undefined,
          specialtyIds: r.specialtyIds,
          weeklyPattern: [
            { weekday: 0, startTime: '09:00', endTime: '13:00', room: 'Room 1' },
            { weekday: 2, startTime: '09:00', endTime: '13:00', room: 'Room 1' },
          ],
          active: true,
        }));

        await repo.bulkUpsert('doctors', doctorEntities);
      }

      await repo.create('audit', {
        actor: 'Administrator',
        action: 'CREATE',
        entity: activeTab === 'NURSES' ? 'Nurse' : 'Doctor',
        entityId: 'bulk',
        note: `Bulk imported ${parsedRows.length} ${activeTab.toLowerCase()} from CSV.`,
        timestamp: nowIso,
      });

      onImportComplete();
      onClose();
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs font-sans text-slate-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Bulk CSV Import Center
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                Batch onboarding for nurses and medical practitioners
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab('NURSES');
                setParsedRows([]);
                setCsvText('');
              }}
              className={`px-3 py-1.5 rounded font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                activeTab === 'NURSES'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Import Nurses</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('DOCTORS');
                setParsedRows([]);
                setCsvText('');
              }}
              className={`px-3 py-1.5 rounded font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                activeTab === 'DOCTORS'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Stethoscope className="w-3.5 h-3.5" />
              <span>Import Doctors</span>
            </button>
          </div>

          <button
            onClick={activeTab === 'NURSES' ? handleDownloadNurseTemplate : handleDownloadDoctorTemplate}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold cursor-pointer shadow-2xs"
          >
            <Download className="w-3 h-3 text-slate-500" />
            <span>Download Sample CSV</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* File Upload / Paste Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 text-xs">
                Upload CSV File or Paste Raw Text:
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="text-[11px] text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-slate-50 hover:file:bg-slate-100 cursor-pointer"
              />
            </div>

            <textarea
              rows={4}
              placeholder={
                activeTab === 'NURSES'
                  ? 'fullName,gmail,employeeCode,seniorityLevel,contractPercent,dateOfBirth\nAmina Mansoor,amina@clinic.ae,N-109,Staff Nurse,100,1992-05-14'
                  : 'fullName,gmail,specialties,weeklyPattern\nDr. Hamad,dr.hamad@clinic.ae,Cardiology,Sun 09:00-13:00'
              }
              value={csvText}
              onChange={(e) => handleParseCsv(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded font-mono text-[11px] focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Validation & Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">
                  Validation Preview ({parsedRows.length} Rows Parsed):
                </span>
                {errorCount > 0 ? (
                  <span className="text-rose-600 font-bold text-[11px] flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{errorCount} rows with invalid data</span>
                  </span>
                ) : (
                  <span className="text-emerald-700 font-bold text-[11px] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>All {parsedRows.length} rows valid and ready</span>
                  </span>
                )}
              </div>

              <div className="border border-slate-200 rounded max-h-48 overflow-y-auto">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Gmail</th>
                      <th className="py-2 px-3">Details</th>
                      <th className="py-2 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((r, i) => (
                      <tr key={i} className={r.isValid ? 'hover:bg-slate-50' : 'bg-rose-50/50'}>
                        <td className="py-2 px-3 font-bold font-sans text-slate-900">{r.fullName}</td>
                        <td className="py-2 px-3 text-slate-600">{r.gmail}</td>
                        <td className="py-2 px-3 text-slate-500 font-sans">
                          {activeTab === 'NURSES' ? (
                            <span>
                              {r.seniorityName} · {r.contractPercent}%
                            </span>
                          ) : (
                            <span>{r.patternStr || 'Standard Sessions'}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {r.isValid ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              VALID
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                              INVALID
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded font-medium cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={parsedRows.length === 0 || errorCount > 0 || isImporting}
            onClick={handleExecuteImport}
            className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold cursor-pointer shadow-xs disabled:opacity-40"
          >
            <Upload className="w-4 h-4" />
            <span>Confirm &amp; Import ({parsedRows.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
