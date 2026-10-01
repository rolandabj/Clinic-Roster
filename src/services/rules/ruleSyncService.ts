/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Rule Management Synchronization & Canonical Template Engine (Phase 3)
 */

import { Rule, RuleTemplateKey } from '../../types';
import { getRepository } from '../repository';
import { resolveRule } from '../engine/SchedulingEngine';

export interface CanonicalRuleDef extends Omit<Rule, 'id'> {
  canonicalId: string;
  templateKey: RuleTemplateKey;
  semanticKeywords: string[];
}

export const CANONICAL_RULES_SPEC: CanonicalRuleDef[] = [
  {
    canonicalId: 'rule-h1',
    name: 'At least one senior nurse on each duty',
    templateKey: 'SENIOR_ON_DUTY',
    scope: 'PER_DUTY_WINDOW',
    metric: 'CONSECUTIVE_DUTIES_ENDING_AT_OR_AFTER',
    operator: 'MIN',
    value: 1,
    severity: 'HARD',
    enabled: true,
    semanticKeywords: ['senior', 'senior nurse', 'seniority'],
  },
  {
    canonicalId: 'rule-h2',
    name: 'Max consecutive working days per nurse = 6',
    templateKey: 'MAX_CONSECUTIVE_DAYS',
    scope: 'PER_NURSE',
    metric: 'CONSECUTIVE_WORKING_DAYS',
    operator: 'MAX',
    value: 6,
    severity: 'HARD',
    enabled: true,
    semanticKeywords: ['consecutive working days', 'consecutive days', 'consecutive duties', 'max consecutive'],
  },
  {
    canonicalId: 'rule-h3',
    name: 'Minimum rest between duties = 11h',
    templateKey: 'MIN_REST_HOURS',
    scope: 'PER_NURSE',
    metric: 'TOTAL_HOURS_IN_WINDOW',
    operator: 'MIN',
    value: 11,
    severity: 'HARD',
    enabled: true,
    semanticKeywords: ['rest between duties', 'minimum rest', 'rest hours'],
  },
  {
    canonicalId: 'rule-h4',
    name: 'Max 1 duty per nurse per day',
    templateKey: 'MAX_DUTIES_PER_DAY',
    scope: 'PER_NURSE',
    metric: 'DUTIES_WITH_END_TIME_X_COUNT',
    operator: 'MAX',
    value: 1,
    severity: 'HARD',
    enabled: true,
    semanticKeywords: ['one duty per nurse', 'max 1 duty', 'duty per day'],
  },
  {
    canonicalId: 'rule-nurse-clinic',
    name: 'Dedicated nurse clinic coverage (not assigned to doctor)',
    templateKey: 'DEDICATED_NURSE_CLINIC',
    scope: 'PER_DAY',
    metric: 'DUTIES_WITH_END_TIME_X_COUNT',
    operator: 'MIN',
    value: 1,
    severity: 'HARD',
    enabled: true,
    semanticKeywords: ['nurse clinic', 'dedicated nurse clinic', 'nc coverage'],
  },
  {
    canonicalId: 'rule-nurse-plus-one',
    name: 'At least one additional nurse above doctors during clinic operating hours',
    templateKey: 'MIN_ADDITIONAL_NURSE_OVER_DOCTORS',
    scope: 'PER_DUTY_WINDOW',
    metric: 'DUTIES_WITH_END_TIME_X_COUNT',
    operator: 'MIN',
    value: 1,
    severity: 'HARD',
    enabled: true,
    semanticKeywords: ['additional nurse', 'plus one', 'above doctors', 'float coverage'],
  },
  {
    canonicalId: 'rule-h7-max-hours',
    name: 'Maximum working hours limit per schedule period (no overwork)',
    templateKey: 'MAX_WORKING_HOURS_PER_PERIOD',
    scope: 'PER_NURSE',
    metric: 'MAX_PERIOD_HOURS',
    operator: 'MAX',
    value: 105,
    severity: 'HARD',
    enabled: true,
    semanticKeywords: ['max working hours', 'maximum working hours', 'period hours', 'no overwork', 'overwork limit'],
  },
  {
    canonicalId: 'rule-h8-strict-allocation',
    name: 'Strict Nurse Allocation: Only pair with doctors or specialties in nurse profile',
    templateKey: 'STRICT_PROFILE_ALLOCATION',
    scope: 'PER_NURSE',
    metric: 'DUTIES_WITH_END_TIME_X_COUNT',
    operator: 'MAX',
    value: 0,
    severity: 'HARD',
    enabled: true,
    semanticKeywords: ['strict allocation', 'profile allocation', 'allocated specialty'],
  },
  {
    canonicalId: 'rule-s1',
    name: 'No more than 3 consecutive duties ending at 21:00',
    templateKey: 'MAX_CONSECUTIVE_LATE_DUTIES',
    scope: 'PER_NURSE',
    metric: 'CONSECUTIVE_DUTIES_ENDING_AT_OR_AFTER',
    params: { thresholdTime: '21:00' },
    operator: 'MAX',
    value: 3,
    severity: 'HARD',
    enabled: true,
    semanticKeywords: ['consecutive night', 'consecutive late', 'ending at 21:00', 'late duties'],
  },
];

export interface RuleSyncResult {
  added: number;
  updated: number;
  unchanged: number;
  total: number;
  rules: Rule[];
}

export class RuleSyncService {
  /**
   * Synchronizes and repairs all canonical rules in the persistent repository.
   * If an existing rule matches a canonical specification by templateKey, id, or semantic keywords:
   *  - Ensures templateKey is present and set
   *  - Retains user-customized value and severity if already set, or sets canonical defaults if missing
   * If a canonical rule does not exist, creates it.
   */
  public static async syncStandardRules(): Promise<RuleSyncResult> {
    const repo = getRepository();
    const existingRules = await repo.list('rules');

    let addedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    for (const spec of CANONICAL_RULES_SPEC) {
      // Find matching rule in database
      const matched = resolveRule(
        existingRules,
        spec.templateKey,
        spec.canonicalId,
        spec.semanticKeywords
      );

      if (matched) {
        // Check if templateKey, name, or params need synchronization
        const needsUpdate =
          !matched.templateKey ||
          matched.templateKey !== spec.templateKey ||
          (spec.params?.thresholdTime && (!matched.params || !matched.params.thresholdTime));

        if (needsUpdate) {
          const updates: Partial<Rule> = {
            templateKey: spec.templateKey,
          };
          if (spec.params?.thresholdTime && (!matched.params || !matched.params.thresholdTime)) {
            updates.params = { ...matched.params, thresholdTime: spec.params.thresholdTime };
          }
          await repo.update('rules', matched.id, updates);
          matched.templateKey = spec.templateKey;
          if (updates.params) {
            matched.params = updates.params;
          }
          updatedCount++;
        } else {
          unchangedCount++;
        }
      } else {
        // Create canonical rule
        const newRule: Rule = {
          id: spec.canonicalId,
          name: spec.name,
          templateKey: spec.templateKey,
          scope: spec.scope,
          metric: spec.metric,
          operator: spec.operator,
          value: spec.value,
          severity: spec.severity,
          enabled: spec.enabled,
          params: spec.params,
        };
        await repo.create('rules', newRule);
        existingRules.push(newRule);
        addedCount++;
      }
    }

    // Deduplicate rules by templateKey if multiple exist (keep canonicalId preference)
    const freshRules = await repo.list('rules');
    const seenTemplates = new Map<string, Rule>();
    for (const r of freshRules) {
      if (!r.templateKey) {
        // If an untemplated rule semantically matches a canonical rule, assign templateKey
        for (const spec of CANONICAL_RULES_SPEC) {
          const lowerName = (r.name || '').toLowerCase();
          if (spec.semanticKeywords.some((k) => lowerName.includes(k.toLowerCase()))) {
            r.templateKey = spec.templateKey;
            await repo.update('rules', r.id, { templateKey: spec.templateKey });
            break;
          }
        }
      }

      if (r.templateKey) {
        const existing = seenTemplates.get(r.templateKey);
        if (existing) {
          // If duplicate exists, keep the one with canonical ID 'rule-*', remove the other
          const toRemove = r.id.startsWith('rule-') ? existing : r;
          const toKeep = r.id.startsWith('rule-') ? r : existing;
          await repo.remove('rules', toRemove.id);
          seenTemplates.set(r.templateKey, toKeep);
        } else {
          seenTemplates.set(r.templateKey, r);
        }
      }
    }

    // Refresh final list
    const finalRules = await repo.list('rules');

    return {
      added: addedCount,
      updated: updatedCount,
      unchanged: unchangedCount,
      total: finalRules.length,
      rules: finalRules,
    };
  }
}
