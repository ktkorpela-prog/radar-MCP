import { z } from 'zod';

export const ACTIVITY_TYPES = [
  'email_single',
  'email_bulk',
  'publish',
  'data_read',
  'data_write',
  'data_delete_single',
  'data_delete_bulk',
  'web_search',
  'external_api_call',
  'system_execute',
  'system_files',
  'financial',
];

export const radarAssessInputSchema = z.object({
  action: z.string().describe('What the agent intends to do'),
  activityType: z.string().describe('Category of the intended action. Standard types: ' + ACTIVITY_TYPES.join(', ') + '. Custom types from the dashboard are also accepted.'),
  agentId: z.string().optional().describe('Identifier for this agent'),
});

export const TOOL_NAME = 'radar_assess';

export const TOOL_DESCRIPTION =
  "Assess an intended action for risk before executing it. Returns PROCEED or HOLD with Vela Lite's reasoning and strategy options.";

/**
 * Execute the radar_assess tool by calling radar-lite's assess() function.
 */
export async function executeRadarAssess({ action, activityType, agentId }, radar) {
  const opts = {};
  if (agentId) opts.agentId = agentId;
  const result = await radar.assess(action, activityType, opts);

  return {
    status: result.status,
    verdict: result.verdict,
    proceed: result.proceed,
    reviewRequired: result.reviewRequired || false,
    tier: result.tier,
    riskScore: result.riskScore,
    triggerReason: result.triggerReason,
    vela: result.vela || null,
    options: result.options || null,
    recommended: result.recommended || null,
    holdAction: result.holdAction || undefined,
    callId: result.callId,
    policyDecision: result.policyDecision,
    wouldEscalate: result.wouldEscalate || false,
    escalateTier: result.escalateTier || null,
  };
}
