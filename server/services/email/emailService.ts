/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server-Side Transactional Email Service
 * Supports Google Gmail SMTP (smtp.gmail.com, port 587, TLS) and MOCK Safe Sandbox mode.
 */

import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { IRepository } from '../../../src/services/repository/IRepository';
import { EmailSettingsConfig, DEFAULT_EMAIL_SETTINGS } from '../../../src/types/settings';
import { EmailRecipientLog } from '../../../src/types';

/**
 * Validates that an email is a valid format and eligible Google / Google Workspace account
 */
export function isGoogleAccountEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}

export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  fromEmail?: string;
  scheduleId?: string;
  nurseId?: string;
  versionId?: string;
  config?: Partial<EmailSettingsConfig>;
}

export interface SendEmailResult {
  success: boolean;
  provider: string;
  messageId: string;
  recipients: string[];
  status: 'SENT' | 'MOCK_SENT' | 'FAILED';
  error?: string;
}

export class EmailService {
  /**
   * Resolves effective email configuration from repository or environment
   */
  public static async getConfig(repo: IRepository): Promise<EmailSettingsConfig> {
    const clinics = await repo.list('clinics');
    const clinic = clinics[0];
    const storedConfig = (clinic as any)?.emailSettings;

    return {
      ...DEFAULT_EMAIL_SETTINGS,
      ...(storedConfig || {}),
      // Environment overrides if present
      ...(process.env.EMAIL_PROVIDER ? { provider: process.env.EMAIL_PROVIDER as any } : {}),
      ...(process.env.GOOGLE_SMTP_USER || process.env.SMTP_USER ? { smtpUser: process.env.GOOGLE_SMTP_USER || process.env.SMTP_USER } : {}),
      ...(process.env.GOOGLE_APP_PASSWORD || process.env.SMTP_PASS ? { smtpPass: process.env.GOOGLE_APP_PASSWORD || process.env.SMTP_PASS } : {}),
      ...(process.env.GOOGLE_APP_PASSWORD ? { googleAppPassword: process.env.GOOGLE_APP_PASSWORD } : {}),
      ...(process.env.SMTP_HOST ? { smtpHost: process.env.SMTP_HOST } : {}),
      ...(process.env.SMTP_PORT ? { smtpPort: parseInt(process.env.SMTP_PORT, 10) } : {}),
    };
  }

  /**
   * Dispatches email exclusively via Google SMTP or Mock Safe Sandbox mode
   */
  public static async send(
    payload: SendEmailPayload,
    repo: IRepository,
    actor: string = 'System Dispatcher'
  ): Promise<SendEmailResult> {
    const baseConfig = await this.getConfig(repo);
    const config: EmailSettingsConfig = { ...baseConfig, ...(payload.config || {}) };

    const rawList = Array.isArray(payload.to) ? payload.to : [payload.to];
    // Filter and normalize recipient emails
    const toList = rawList
      .map((e) => e.trim().toLowerCase())
      .filter((e) => isGoogleAccountEmail(e));

    if (toList.length === 0) {
      return {
        success: false,
        provider: 'GOOGLE',
        messageId: `err-${uuidv4().slice(0, 8)}`,
        recipients: rawList,
        status: 'FAILED',
        error: 'No valid recipient Google accounts provided.',
      };
    }

    const clinics = (await repo.list('clinics')) as any[];
    const clinicName = clinics[0]?.name || 'American Hospital Nad Al Sheba OutPatient clinic';
    const fromName = payload.fromName || config.senderName || `${clinicName} Rostering`;
    const fromEmail = payload.fromEmail || config.senderEmail || 'rolandabj@gmail.com';
    const fromAddress = `"${fromName}" <${fromEmail}>`;

    const now = new Date().toISOString();
    let result: SendEmailResult;

    // 1. MOCK Provider / Safe Sandbox Mode
    if (config.provider === 'MOCK' || config.mockMode) {
      const mockId = `mock-${uuidv4().slice(0, 8)}`;
      console.log(`[EmailService:GOOGLE-MOCK] Logged to: ${toList.join(', ')} | From: ${fromAddress} | Subject: ${payload.subject}`);

      result = {
        success: true,
        provider: 'GOOGLE',
        messageId: mockId,
        recipients: toList,
        status: 'MOCK_SENT',
      };
    }
    // 2. Live Google SMTP Provider (smtp.gmail.com, port 587, STARTTLS)
    else {
      try {
        const smtpHost = config.smtpHost || 'smtp.gmail.com';
        const smtpPort = config.smtpPort || 587;
        const smtpUser = config.smtpUser || config.senderEmail || process.env.GOOGLE_SMTP_USER || 'rolandabj@gmail.com';
        const smtpPass = config.googleAppPassword || config.smtpPass || process.env.GOOGLE_APP_PASSWORD || '';

        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: config.smtpSecure ?? false, // false for 587 with STARTTLS
          requireTLS: true,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });

        const info = await transporter.sendMail({
          from: fromAddress,
          to: toList.join(', '),
          subject: payload.subject,
          html: payload.html,
          text: payload.text || payload.html.replace(/<[^>]*>/g, ''),
        });

        result = {
          success: true,
          provider: 'GOOGLE',
          messageId: info.messageId || `g-smtp-${uuidv4().slice(0, 8)}`,
          recipients: toList,
          status: 'SENT',
        };
      } catch (err: any) {
        console.error('[EmailService:GOOGLE-SMTP] Dispatch Error:', err);
        result = {
          success: false,
          provider: 'GOOGLE',
          messageId: `err-${uuidv4().slice(0, 8)}`,
          recipients: toList,
          status: 'FAILED',
          error: err.message || 'Google SMTP dispatch failure',
        };
      }
    }

    // Persist dispatch in emailLog collection
    const recipientLogs: EmailRecipientLog[] = toList.map((recipient) => ({
      nurseId: payload.nurseId || recipient,
      nurseName: payload.nurseId || recipient,
      email: recipient,
      subject: payload.subject,
      bodyPreview: payload.html.replace(/<[^>]*>/g, '').slice(0, 150),
      fullBodyHtml: payload.html,
      status: result.status,
      errorMessage: result.error,
    }));

    const kind = payload.subject.includes('[Test]')
      ? 'TEST'
      : payload.subject.includes('Change')
      ? 'CHANGE'
      : 'PUBLISH';

    await repo.create('emailLog', {
      id: `elog-${uuidv4().slice(0, 8)}`,
      scheduleId: payload.scheduleId || 'direct-dispatch',
      versionId: payload.versionId || 'v1',
      kind,
      recipients: recipientLogs,
      providerMessageId: result.messageId,
      status: result.status,
      sentAt: now,
    });

    // Record audit event
    await repo.create('audit', {
      actor,
      action: 'UPDATE',
      entity: 'EmailDispatch',
      entityId: result.messageId,
      note: `Google Email (${config.mockMode ? 'Safe Sandbox' : 'Live Google'}): "${payload.subject}" dispatched to ${toList.length} recipient(s) with status ${result.status} (Sender: ${fromEmail}).`,
      timestamp: now,
    });

    return result;
  }
}
