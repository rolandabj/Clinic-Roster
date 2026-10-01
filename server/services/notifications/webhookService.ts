/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Clinical Communication & ChatOps Webhook Service
 * Supports incoming webhooks for Slack, Microsoft Teams, Discord, and Generic/WhatsApp endpoints.
 * Automatically dispatches alerts on Roster Publication, Shift Swaps, and Severe Rule Violations.
 */

import { v4 as uuidv4 } from 'uuid';
import { IRepository } from '../../../src/services/repository/IRepository';
import { ClinicProfile, WebhookConfig, WebhookEndpoint, WebhookPlatform } from '../../../src/types';

export interface WebhookPayloadData {
  event: 'ROSTER_PUBLISHED' | 'SHIFT_SWAP_FINALIZED' | 'SEVERE_VIOLATION_DETECTED' | 'TEST';
  title: string;
  summary: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  fields: Array<{ name: string; value: string }>;
  timestamp: string;
  metadata?: Record<string, any>;
}

export class WebhookService {
  /**
   * Format payload to match the destination platform's webhook specification
   */
  public static formatPayload(platform: WebhookPlatform, data: WebhookPayloadData): any {
    const themeColors = {
      INFO: '2563eb', // Blue
      WARNING: 'f59e0b', // Amber
      CRITICAL: 'dc2626', // Red
    };

    const discordColors = {
      INFO: 0x2563eb,
      WARNING: 0xf59e0b,
      CRITICAL: 0xdc2626,
    };

    switch (platform) {
      case 'SLACK': {
        const fieldsMrkdwn = data.fields
          .map((f) => `*${f.name}:* ${f.value}`)
          .join('\n');

        return {
          text: `${data.title}: ${data.summary}`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: data.title.slice(0, 150),
                emoji: true,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${data.summary}\n\n${fieldsMrkdwn}`,
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `🏥 *ClinicRoster ChatOps* • Severity: *${data.severity}* • <!date^${Math.floor(
                    new Date(data.timestamp).getTime() / 1000
                  )}^{date_num} {time_secs}|${data.timestamp}>`,
                },
              ],
            },
          ],
        };
      }

      case 'TEAMS': {
        return {
          '@type': 'MessageCard',
          '@context': 'http://schema.org/extensions',
          themeColor: themeColors[data.severity] || '2563eb',
          summary: data.title,
          sections: [
            {
              activityTitle: data.title,
              activitySubtitle: `ClinicRoster Clinical Notification [${data.severity}]`,
              text: data.summary,
              facts: data.fields.map((f) => ({
                name: f.name,
                value: f.value,
              })),
              markdown: true,
            },
          ],
        };
      }

      case 'DISCORD': {
        return {
          username: 'ClinicRoster Bot',
          avatar_url: 'https://img.icons8.com/color/96/hospital-3.png',
          embeds: [
            {
              title: data.title,
              description: data.summary,
              color: discordColors[data.severity] || 0x2563eb,
              fields: data.fields.map((f) => ({
                name: f.name,
                value: f.value,
                inline: true,
              })),
              footer: {
                text: 'ClinicRoster • American Hospital Nad Al Sheba OutPatient clinic',
              },
              timestamp: data.timestamp,
            },
          ],
        };
      }

      case 'GENERIC':
      default: {
        return {
          event: data.event,
          severity: data.severity,
          title: data.title,
          summary: data.summary,
          fields: data.fields,
          timestamp: data.timestamp,
          metadata: data.metadata || {},
        };
      }
    }
  }

  /**
   * Dispatch payload to a single endpoint
   */
  public static async dispatchToEndpoint(
    endpoint: WebhookEndpoint,
    data: WebhookPayloadData,
    repo?: IRepository
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    if (!endpoint.enabled || !endpoint.url) {
      return { success: false, error: 'Endpoint is disabled or missing URL' };
    }

    const payload = this.formatPayload(endpoint.platform, data);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ClinicRoster-ChatOps/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const isSuccess = res.ok || res.status === 204;
      const result = {
        success: isSuccess,
        statusCode: res.status,
        error: isSuccess ? undefined : `HTTP ${res.status} ${res.statusText}`,
      };

      if (repo) {
        await repo.create('audit', {
          id: `aud-${uuidv4().slice(0, 8)}`,
          timestamp: new Date().toISOString(),
          actorName: 'Webhook Service',
          actorRole: 'SYSTEM',
          action: 'UPDATE',
          entity: 'Webhook',
          entityId: endpoint.id,
          details: `Dispatched ${data.event} notification to ${endpoint.name} (${endpoint.platform}): ${
            isSuccess ? 'Delivered (HTTP ' + res.status + ')' : 'Failed: ' + result.error
          }`,
        } as any);
      }

      return result;
    } catch (err: any) {
      const errorMsg = err.name === 'AbortError' ? 'Webhook request timed out (6s)' : err.message;

      if (repo) {
        await repo.create('audit', {
          id: `aud-${uuidv4().slice(0, 8)}`,
          timestamp: new Date().toISOString(),
          actorName: 'Webhook Service',
          actorRole: 'SYSTEM',
          action: 'UPDATE',
          entity: 'Webhook',
          entityId: endpoint.id,
          details: `Error dispatching ${data.event} to ${endpoint.name}: ${errorMsg}`,
        } as any);
      }

      return { success: false, error: errorMsg };
    }
  }

  /**
   * Helper to retrieve configured webhook endpoints from clinic profile
   */
  private static async getEndpoints(
    repo: IRepository,
    eventKey: keyof WebhookEndpoint['events']
  ): Promise<WebhookEndpoint[]> {
    try {
      const clinics = await repo.list('clinics');
      const clinic = clinics[0] as ClinicProfile | undefined;
      const config: WebhookConfig | undefined = clinic?.webhookConfig;

      if (!config || !config.enabled || !Array.isArray(config.endpoints)) {
        return [];
      }

      return config.endpoints.filter((ep) => ep.enabled && ep.url && ep.events?.[eventKey]);
    } catch (err) {
      console.warn('[WebhookService] Failed to load clinic webhook configuration:', err);
      return [];
    }
  }

  /**
   * 1. Alert: Roster Published
   */
  public static async notifyRosterPublished(
    info: {
      clinicName: string;
      scheduleId: string;
      scheduleName: string;
      versionNumber: number;
      period: string;
      totalNursesAssigned: number;
      publishedBy: string;
      rosterUrl?: string;
    },
    repo: IRepository
  ): Promise<number> {
    const endpoints = await this.getEndpoints(repo, 'rosterPublished');
    if (endpoints.length === 0) return 0;

    const data: WebhookPayloadData = {
      event: 'ROSTER_PUBLISHED',
      title: `📋 New Roster Published: ${info.scheduleName}`,
      summary: `A new official roster schedule has been published for ${info.clinicName}.`,
      severity: 'INFO',
      timestamp: new Date().toISOString(),
      fields: [
        { name: 'Schedule Name', value: info.scheduleName },
        { name: 'Version', value: `v${info.versionNumber}` },
        { name: 'Coverage Period', value: info.period },
        { name: 'Staff Assigned', value: `${info.totalNursesAssigned} nurses` },
        { name: 'Published By', value: info.publishedBy },
      ],
      metadata: {
        scheduleId: info.scheduleId,
        versionNumber: info.versionNumber,
      },
    };

    const promises = endpoints.map((ep) => this.dispatchToEndpoint(ep, data, repo));
    const results = await Promise.allSettled(promises);
    return results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
  }

  /**
   * 2. Alert: Critical Shift Swap Finalized
   */
  public static async notifyShiftSwapFinalized(
    info: {
      clinicName: string;
      scheduleName: string;
      nurseAName: string;
      dateA: string;
      dutyA: string;
      nurseBName: string;
      dateB: string;
      dutyB: string;
      reason?: string;
      approvedBy: string;
    },
    repo: IRepository
  ): Promise<number> {
    const endpoints = await this.getEndpoints(repo, 'shiftSwapFinalized');
    if (endpoints.length === 0) return 0;

    const data: WebhookPayloadData = {
      event: 'SHIFT_SWAP_FINALIZED',
      title: `🔄 Shift Swap Approved: ${info.nurseAName} ↔ ${info.nurseBName}`,
      summary: `A mutual clinical shift swap has been approved and committed to the live schedule.`,
      severity: 'WARNING',
      timestamp: new Date().toISOString(),
      fields: [
        { name: 'Schedule', value: info.scheduleName },
        { name: 'Nurse A', value: `${info.nurseAName} (${info.dateA} • ${info.dutyA})` },
        { name: 'Nurse B', value: `${info.nurseBName} (${info.dateB} • ${info.dutyB})` },
        { name: 'Reason', value: info.reason || 'Mutual Clinical Exchange' },
        { name: 'Approved By', value: info.approvedBy },
      ],
    };

    const promises = endpoints.map((ep) => this.dispatchToEndpoint(ep, data, repo));
    const results = await Promise.allSettled(promises);
    return results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
  }

  /**
   * 3. Alert: Severe Rule Violation Detected
   */
  public static async notifySevereRuleViolation(
    info: {
      clinicName: string;
      scheduleName: string;
      violationCount: number;
      criticalIssues: string[];
      detectedBy: string;
    },
    repo: IRepository
  ): Promise<number> {
    const endpoints = await this.getEndpoints(repo, 'severeViolationDetected');
    if (endpoints.length === 0) return 0;

    const sampleText = info.criticalIssues.slice(0, 4).join('\n• ');

    const data: WebhookPayloadData = {
      event: 'SEVERE_VIOLATION_DETECTED',
      title: `🚨 Severe Staffing Violation Alert: ${info.scheduleName}`,
      summary: `Immediate attention required: ${info.violationCount} severe clinical rule violation(s) detected during schedule validation.`,
      severity: 'CRITICAL',
      timestamp: new Date().toISOString(),
      fields: [
        { name: 'Clinic', value: info.clinicName },
        { name: 'Schedule', value: info.scheduleName },
        { name: 'Total Violations', value: `${info.violationCount}` },
        { name: 'Key Findings', value: `• ${sampleText}` },
        { name: 'Evaluated By', value: info.detectedBy },
      ],
    };

    const promises = endpoints.map((ep) => this.dispatchToEndpoint(ep, data, repo));
    const results = await Promise.allSettled(promises);
    return results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
  }

  /**
   * Test a specific endpoint configuration
   */
  public static async testEndpoint(
    endpoint: WebhookEndpoint
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const testData: WebhookPayloadData = {
      event: 'TEST',
      title: `🔔 Test Notification from ClinicRoster`,
      summary: `This is a verification test message confirming successful webhook connectivity for ${endpoint.name}.`,
      severity: 'INFO',
      timestamp: new Date().toISOString(),
      fields: [
        { name: 'Platform', value: endpoint.platform },
        { name: 'Status', value: 'Operational' },
        { name: 'Sent At', value: new Date().toLocaleTimeString() },
      ],
    };

    return this.dispatchToEndpoint(endpoint, testData);
  }
}
