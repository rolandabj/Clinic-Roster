/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Hours Policy Settings Configuration Model
 */

export interface HoursPolicyConfig {
  defaultFullTimeTarget?: number; // Deprecated; targets are configured per roster/schedule
  maxDutiesPerDay: number; // default 1
  minRestBetweenDuties: number; // default 11h
  maxConsecutiveDays: number; // default 6
  leaveCreditsCountTowardTarget: boolean; // default true
}

export type EmailProviderType = 'GOOGLE' | 'MOCK' | 'SMTP';

export interface EmailSettingsConfig {
  provider: EmailProviderType;
  mockMode: boolean; // default true (Safe Sandbox)
  senderName: string;
  senderEmail: string; // e.g. rolandabj@gmail.com
  googleAppPassword?: string; // Optional for live Google SMTP dispatch
  smtpHost?: string; // default smtp.gmail.com
  smtpPort?: number; // default 587
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
}

export const DEFAULT_HOURS_POLICY: HoursPolicyConfig = {
  maxDutiesPerDay: 1,
  minRestBetweenDuties: 11,
  maxConsecutiveDays: 6,
  leaveCreditsCountTowardTarget: true,
};

export const DEFAULT_EMAIL_SETTINGS: EmailSettingsConfig = {
  provider: 'GOOGLE',
  mockMode: true,
  senderName: 'Dr. Roland / Clinical Director',
  senderEmail: 'rolandabj@gmail.com',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  smtpSecure: false,
};
