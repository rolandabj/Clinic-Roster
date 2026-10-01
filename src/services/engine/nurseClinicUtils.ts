import { Nurse, ClinicalRole } from '../../types';

/**
 * Determines whether a nurse is designated as an Exclusive Nurse Clinic staff member:
 * 1. Not assigned as a clinic nurse (isClinicNurse === false)
 * 2. Has no doctor and specialty preferences
 * 3. Only the nurse clinic option is selected in capabilityIds
 *
 * Such nurses are dedicated exclusively to the nurse-led clinic and must never be assigned
 * to doctor sessions or specialty clinic pools.
 */
export function isExclusiveNurseClinic(nurse: Nurse, roles: ClinicalRole[] = []): boolean {
  if (nurse.isClinicNurse) {
    return false;
  }

  // Check if nurse has any doctor or specialty preferences
  const hasDocOrSpecPref = nurse.preferences?.some(
    (p) => p.kind === 'DOCTOR' || p.kind === 'SPECIALTY'
  );
  if (hasDocOrSpecPref) {
    return false;
  }

  // Identify the Nurse Clinic role
  const ncRole = roles.find(
    (r) =>
      r.id === 'role-nurse-clinic' ||
      r.acronym === 'NC' ||
      r.name.toLowerCase().includes('nurse clinic')
  );

  const caps = nurse.capabilityIds || [];
  if (caps.length === 0) {
    return false;
  }

  // Must only have the Nurse Clinic capability (and no other clinical capabilities such as PHL)
  const isOnlyNC = caps.every(
    (cid) =>
      cid === 'role-nurse-clinic' ||
      (ncRole && cid === ncRole.id) ||
      roles.find((r) => r.id === cid)?.acronym === 'NC'
  );

  return isOnlyNC;
}
