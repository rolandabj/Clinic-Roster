/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Enterprise Role Directory & Email Mapping Engine (Phase 2)
 * Master Admin Lock (rolandabj@gmail.com) & In-App User Whitelist Gatekeeper.
 */

import { IRepository } from '../../../src/services/repository/IRepository';
import { getServerRepository } from '../../db/index';
import { BackendRole } from '../../middleware/auth';
import { Nurse, SeniorityLevel, Doctor, ClinicProfile, UserAccessRecord } from '../../../src/types';

export const MASTER_ADMIN_EMAIL = 'rolandabj@gmail.com';

export interface RolePrivileges {
  canEditClinicSettings: boolean;
  canCreateSchedules: boolean;
  canPublishSchedules: boolean;
  canRunSolver: boolean;
  canEditRosterAssignments: boolean;
  canApproveSwaps: boolean;
  canApproveLeave: boolean;
  canApproveAvailability: boolean;
  canRequestSwaps: boolean;
  canAcknowledgeShifts: boolean;
  canViewSchedules: boolean;
  canExportReports: boolean;
  canManageStaff: boolean;
  canConfigureWebhooks: boolean;
}

export interface ResolvedDirectoryIdentity {
  email: string;
  name: string;
  role: BackendRole;
  uid: string;
  accessStatus: 'APPROVED' | 'PENDING' | 'REVOKED';
  isManager: boolean;
  appRole: 'VIEWER' | 'EDITOR';
  matchedEntity:
    | 'CLINIC_OWNER'
    | 'ADMINISTRATOR'
    | 'CHARGE_NURSE'
    | 'SENIOR_NURSE'
    | 'STAFF_NURSE'
    | 'JUNIOR_NURSE'
    | 'DOCTOR'
    | 'CLINIC_DOMAIN_MEMBER'
    | 'EXTERNAL_VIEWER';
  nurseId?: string;
  nurseCode?: string;
  seniorityLevel?: {
    id: string;
    name: string;
    rank: number;
    isSenior: boolean;
  };
  doctorId?: string;
  isRegisteredStaff: boolean;
  privileges: RolePrivileges;
  description: string;
}

export interface DirectoryStaffEntry {
  id: string;
  type: 'NURSE' | 'DOCTOR' | 'ADMIN';
  name: string;
  email: string;
  role: BackendRole;
  appRole: 'VIEWER' | 'EDITOR';
  isManager: boolean;
  accessStatus: 'APPROVED' | 'PENDING' | 'REVOKED';
  seniorityName?: string;
  employeeCode?: string;
  linkedNurseId?: string;
  privileges: RolePrivileges;
  status: 'ACTIVE' | 'INACTIVE';
}

export class RoleDirectoryService {
  /**
   * Computes granular permissions matrix based on assigned role and Manager status
   */
  public static computePrivileges(role: BackendRole, isManager: boolean = false): RolePrivileges {
    const isOwner = role === 'OWNER';
    const isEditorOrOwner = isOwner || role === 'EDITOR' || role === 'PLANNER';
    const canApprove = isOwner || isManager;

    return {
      canEditClinicSettings: isOwner,
      canCreateSchedules: isEditorOrOwner,
      canPublishSchedules: isEditorOrOwner,
      canRunSolver: isEditorOrOwner,
      canEditRosterAssignments: isEditorOrOwner,
      canApproveSwaps: canApprove,
      canApproveLeave: canApprove,
      canApproveAvailability: canApprove,
      canRequestSwaps: true, // all authenticated staff can submit swap requests
      canAcknowledgeShifts: true, // all authenticated staff can acknowledge shifts
      canViewSchedules: true,
      canExportReports: isEditorOrOwner || isManager,
      canManageStaff: isOwner, // strictly reserved for the Master Admin (rolandabj@gmail.com)
      canConfigureWebhooks: isOwner,
    };
  }

  /**
   * Resolves an email address to a clinical entity, evaluating Master Admin Lock and Whitelist
   */
  public static async resolveRoleFromEmail(
    email: string,
    displayName?: string,
    repoOverride?: IRepository
  ): Promise<ResolvedDirectoryIdentity> {
    const repo = repoOverride || getServerRepository();
    const normalizedEmail = (email || '').trim().toLowerCase();
    const safeName = (displayName || '').trim() || normalizedEmail.split('@')[0] || 'User';

    if (!normalizedEmail) {
      const privileges = this.computePrivileges('VIEWER', false);
      return {
        email: '',
        name: safeName,
        role: 'VIEWER',
        appRole: 'VIEWER',
        isManager: false,
        accessStatus: 'REVOKED',
        uid: 'usr-anonymous',
        matchedEntity: 'EXTERNAL_VIEWER',
        isRegisteredStaff: false,
        privileges,
        description: 'Anonymous or unauthenticated user - access denied',
      };
    }

    // 1. MASTER ADMIN RULE: rolandabj@gmail.com is unconditional OWNER / SUPER_ADMIN
    if (normalizedEmail === MASTER_ADMIN_EMAIL) {
      const privileges = this.computePrivileges('OWNER', true);
      return {
        email: normalizedEmail,
        name: displayName || 'Dr. Roland / Clinical Director',
        role: 'OWNER',
        appRole: 'EDITOR',
        isManager: true,
        accessStatus: 'APPROVED',
        uid: `usr-admin-${normalizedEmail.replace(/[^a-z0-9]/g, '_')}`,
        matchedEntity: 'CLINIC_OWNER',
        isRegisteredStaff: true,
        privileges,
        description: 'Sole Master Administrator & System Owner with exclusive governance and role delegation authority',
      };
    }

    try {
      // 2. WHITELIST GATEKEEPER: Query userAccess collection
      const [userAccessList, nurses, doctors, seniorityLevels] = await Promise.all([
        (repo.list('userAccess') as Promise<UserAccessRecord[]>),
        (repo.list('nurses') as Promise<Nurse[]>),
        (repo.list('doctors') as Promise<Doctor[]>),
        (repo.list('seniorityLevels') as Promise<SeniorityLevel[]>),
      ]);

      const accessRecord = userAccessList.find(
        (u) => u.email && u.email.trim().toLowerCase() === normalizedEmail
      );

      const matchedNurse = nurses.find(
        (n) =>
          (n.gmail && n.gmail.trim().toLowerCase() === normalizedEmail) ||
          ((n as any).email && (n as any).email.trim().toLowerCase() === normalizedEmail)
      );

      const matchedDoctor = doctors.find(
        (d) =>
          (d.gmail && d.gmail.trim().toLowerCase() === normalizedEmail) ||
          ((d as any).email && (d as any).email.trim().toLowerCase() === normalizedEmail)
      );

      const seniority = matchedNurse
        ? seniorityLevels.find((s) => s.id === matchedNurse.seniorityLevelId)
        : undefined;

      // Determine entity type for display
      let matchedEntity: ResolvedDirectoryIdentity['matchedEntity'] = 'EXTERNAL_VIEWER';
      if (matchedNurse) {
        const rank = seniority?.rank ?? 3;
        if (rank === 1 || seniority?.name.toLowerCase().includes('charge')) {
          matchedEntity = 'CHARGE_NURSE';
        } else if (rank === 2 || seniority?.isSenior) {
          matchedEntity = 'SENIOR_NURSE';
        } else if (rank >= 4 || seniority?.name.toLowerCase().includes('junior')) {
          matchedEntity = 'JUNIOR_NURSE';
        } else {
          matchedEntity = 'STAFF_NURSE';
        }
      } else if (matchedDoctor) {
        matchedEntity = 'DOCTOR';
      }

      // CASE A: User is NOT in the whitelist -> Strict non-persisting evaluation.
      // NEVER silently create database records during simulation or unwhitelisted login.
      if (!accessRecord) {
        const assignedRole: BackendRole = matchedNurse ? 'STAFF' : 'VIEWER';
        const privileges = this.computePrivileges(assignedRole, false);
        return {
          email: normalizedEmail,
          name: displayName || matchedNurse?.fullName || matchedDoctor?.fullName || safeName,
          role: assignedRole,
          appRole: 'VIEWER',
          isManager: false,
          accessStatus: 'PENDING',
          uid: `usr-pending-${normalizedEmail.replace(/[^a-z0-9]/g, '_')}`,
          matchedEntity,
          nurseId: matchedNurse?.id,
          nurseCode: matchedNurse?.employeeCode,
          doctorId: matchedDoctor?.id,
          isRegisteredStaff: !!matchedNurse || !!matchedDoctor,
          privileges,
          description: `Unwhitelisted account (${assignedRole}). Access pending administrator authorization.`,
        };
      }

      // CASE B: User is marked PENDING
      if (accessRecord.status === 'PENDING') {
        const privileges = this.computePrivileges('VIEWER', false);
        return {
          email: normalizedEmail,
          name: accessRecord.name || displayName || safeName,
          role: 'VIEWER',
          appRole: accessRecord.appRole || 'VIEWER',
          isManager: false,
          accessStatus: 'PENDING',
          uid: accessRecord.id,
          matchedEntity,
          nurseId: accessRecord.linkedNurseId || matchedNurse?.id,
          nurseCode: matchedNurse?.employeeCode,
          doctorId: matchedDoctor?.id,
          isRegisteredStaff: !!matchedNurse || !!matchedDoctor,
          privileges,
          description: `Account access request is pending approval by ${MASTER_ADMIN_EMAIL}.`,
        };
      }

      // CASE C: User is marked REVOKED
      if (accessRecord.status === 'REVOKED') {
        const privileges = this.computePrivileges('VIEWER', false);
        return {
          email: normalizedEmail,
          name: accessRecord.name || displayName || safeName,
          role: 'VIEWER',
          appRole: 'VIEWER',
          isManager: false,
          accessStatus: 'REVOKED',
          uid: accessRecord.id,
          matchedEntity,
          nurseId: accessRecord.linkedNurseId || matchedNurse?.id,
          nurseCode: matchedNurse?.employeeCode,
          doctorId: matchedDoctor?.id,
          isRegisteredStaff: !!matchedNurse || !!matchedDoctor,
          privileges,
          description: `Access for this account was revoked by ${MASTER_ADMIN_EMAIL}.`,
        };
      }

      // CASE D: User is APPROVED by rolandabj@gmail.com
      const assignedRole: BackendRole = accessRecord.appRole === 'EDITOR' ? 'EDITOR' : 'VIEWER';
      const isManager = accessRecord.isManager === true;
      const privileges = this.computePrivileges(assignedRole, isManager);

      return {
        email: normalizedEmail,
        name: accessRecord.name || matchedNurse?.fullName || matchedDoctor?.fullName || safeName,
        role: assignedRole,
        appRole: accessRecord.appRole || 'VIEWER',
        isManager,
        accessStatus: 'APPROVED',
        uid: accessRecord.id,
        matchedEntity,
        nurseId: accessRecord.linkedNurseId || matchedNurse?.id,
        nurseCode: matchedNurse?.employeeCode,
        seniorityLevel: seniority
          ? {
              id: seniority.id,
              name: seniority.name,
              rank: seniority.rank,
              isSenior: seniority.isSenior,
            }
          : undefined,
        doctorId: matchedDoctor?.id,
        isRegisteredStaff: !!matchedNurse || !!matchedDoctor,
        privileges,
        description: isManager
          ? `Approved ${assignedRole} & Designated Manager/Approver by ${MASTER_ADMIN_EMAIL}`
          : `Approved ${assignedRole} (Roster ${assignedRole === 'EDITOR' ? 'Editing' : 'View-Only'}) by ${MASTER_ADMIN_EMAIL}`,
      };
    } catch (err: any) {
      console.error('[RoleDirectoryService] Error resolving role from database:', err);
      const privileges = this.computePrivileges('VIEWER', false);
      return {
        email: normalizedEmail,
        name: safeName,
        role: 'VIEWER',
        appRole: 'VIEWER',
        isManager: false,
        accessStatus: 'PENDING',
        uid: `usr-err-${normalizedEmail.replace(/[^a-z0-9]/g, '_')}`,
        matchedEntity: 'EXTERNAL_VIEWER',
        isRegisteredStaff: false,
        privileges,
        description: 'Temporary directory resolution fallback - access pending approval.',
      };
    }
  }

  /**
   * Returns all active clinical personnel and whitelist records
   */
  public static async getDirectoryStaff(repoOverride?: IRepository): Promise<DirectoryStaffEntry[]> {
    const repo = repoOverride || getServerRepository();

    const [userAccessList, nurses, doctors, seniorityLevels] = await Promise.all([
      (repo.list('userAccess') as Promise<UserAccessRecord[]>),
      (repo.list('nurses') as Promise<Nurse[]>),
      (repo.list('doctors') as Promise<Doctor[]>),
      (repo.list('seniorityLevels') as Promise<SeniorityLevel[]>),
    ]);

    const entries: DirectoryStaffEntry[] = [];

    // Master Admin Entry
    entries.push({
      id: 'admin-owner-roland',
      type: 'ADMIN',
      name: 'Dr. Roland / Clinical Director',
      email: MASTER_ADMIN_EMAIL,
      role: 'OWNER',
      appRole: 'EDITOR',
      isManager: true,
      accessStatus: 'APPROVED',
      seniorityName: 'Medical Director / Master Admin',
      privileges: this.computePrivileges('OWNER', true),
      status: 'ACTIVE',
    });

    // Nurses
    for (const nurse of nurses) {
      const seniority = seniorityLevels.find((s) => s.id === nurse.seniorityLevelId);
      const email = nurse.gmail?.trim().toLowerCase() || '';
      const accessRec = userAccessList.find(
        (u) => u.email && u.email.trim().toLowerCase() === email
      );

      const status = accessRec?.status || 'PENDING';
      const appRole = accessRec?.appRole || 'VIEWER';
      const isManager = accessRec?.isManager === true;
      const role: BackendRole = accessRec?.status === 'APPROVED' ? (appRole === 'EDITOR' ? 'EDITOR' : 'VIEWER') : 'VIEWER';

      entries.push({
        id: nurse.id,
        type: 'NURSE',
        name: nurse.fullName,
        email: nurse.gmail,
        role,
        appRole,
        isManager,
        accessStatus: status,
        seniorityName: seniority?.name || 'Staff Nurse',
        employeeCode: nurse.employeeCode,
        linkedNurseId: nurse.id,
        privileges: this.computePrivileges(role, isManager),
        status: nurse.active ? 'ACTIVE' : 'INACTIVE',
      });
    }

    // Doctors
    for (const doc of doctors) {
      const email = doc.gmail?.trim().toLowerCase() || '';
      const accessRec = userAccessList.find(
        (u) => u.email && u.email.trim().toLowerCase() === email
      );
      const status = accessRec?.status || 'PENDING';
      const appRole = accessRec?.appRole || 'VIEWER';
      const isManager = accessRec?.isManager === true;
      const role: BackendRole = accessRec?.status === 'APPROVED' ? (appRole === 'EDITOR' ? 'EDITOR' : 'VIEWER') : 'VIEWER';

      entries.push({
        id: doc.id,
        type: 'DOCTOR',
        name: doc.fullName,
        email: doc.gmail || '',
        role,
        appRole,
        isManager,
        accessStatus: status,
        seniorityName: 'Consultant Physician',
        privileges: this.computePrivileges(role, isManager),
        status: doc.active ? 'ACTIVE' : 'INACTIVE',
      });
    }

    // Additional User Access Records not mapped to nurse/doctor
    for (const u of userAccessList) {
      if (
        u.email.toLowerCase() !== MASTER_ADMIN_EMAIL &&
        !entries.some((e) => e.email.toLowerCase() === u.email.toLowerCase())
      ) {
        const role: BackendRole = u.status === 'APPROVED' ? (u.appRole === 'EDITOR' ? 'EDITOR' : 'VIEWER') : 'VIEWER';
        entries.push({
          id: u.id,
          type: 'ADMIN',
          name: u.name || u.email,
          email: u.email,
          role,
          appRole: u.appRole || 'VIEWER',
          isManager: u.isManager === true,
          accessStatus: u.status,
          linkedNurseId: u.linkedNurseId,
          seniorityName: u.isManager ? 'Manager / Charge Approver' : 'Institutional User',
          privileges: this.computePrivileges(role, u.isManager),
          status: u.status === 'APPROVED' ? 'ACTIVE' : 'INACTIVE',
        });
      }
    }

    return entries;
  }
}
