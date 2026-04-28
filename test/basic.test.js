import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TOOL_NAME, TOOL_DESCRIPTION, radarAssessInputSchema, ACTIVITY_TYPES, executeRadarAssess } from '../src/tool.js';
import { loadRadarConfig, checkLlmKey, checkSegregation } from '../src/config.js';

describe('tool.js', () => {
  it('exports correct tool name', () => {
    assert.strictEqual(TOOL_NAME, 'radar_assess');
  });

  it('tool description mentions all three verdicts', () => {
    assert.ok(TOOL_DESCRIPTION.includes('PROCEED'));
    assert.ok(TOOL_DESCRIPTION.includes('HOLD'));
    assert.ok(TOOL_DESCRIPTION.includes('DENY'));
  });

  it('has 12 standard activity types', () => {
    assert.strictEqual(ACTIVITY_TYPES.length, 12);
    assert.ok(ACTIVITY_TYPES.includes('email_single'));
    assert.ok(ACTIVITY_TYPES.includes('financial'));
    assert.ok(ACTIVITY_TYPES.includes('data_delete_bulk'));
  });

  it('schema accepts valid input', () => {
    const result = radarAssessInputSchema.safeParse({
      action: 'Send email to user',
      activityType: 'email_single',
    });
    assert.ok(result.success);
  });

  it('schema accepts custom activity types', () => {
    const result = radarAssessInputSchema.safeParse({
      action: 'Post to Slack',
      activityType: 'slack_messages',
    });
    assert.ok(result.success);
  });

  it('schema accepts optional agentId', () => {
    const result = radarAssessInputSchema.safeParse({
      action: 'Delete file',
      activityType: 'system_files',
      agentId: 'my-agent',
    });
    assert.ok(result.success);
  });

  it('schema rejects missing action', () => {
    const result = radarAssessInputSchema.safeParse({
      activityType: 'email_single',
    });
    assert.ok(!result.success);
  });

  it('schema rejects missing activityType', () => {
    const result = radarAssessInputSchema.safeParse({
      action: 'Send email',
    });
    assert.ok(!result.success);
  });

  it('executeRadarAssess maps response fields correctly', async () => {
    const mockRadar = {
      assess: async () => ({
        status: 'PROCEED',
        verdict: 'PROCEED',
        proceed: true,
        reviewRequired: false,
        tier: 1,
        riskScore: 2,
        triggerReason: 'test',
        vela: 'test vela',
        options: null,
        recommended: null,
        holdAction: 'halt',
        callId: 'ra_test123',
        policyDecision: 'assess',
        wouldEscalate: false,
        escalateTier: null,
      }),
    };

    const result = await executeRadarAssess(
      { action: 'test', activityType: 'data_read' },
      mockRadar,
      'default-agent'
    );

    assert.strictEqual(result.status, 'PROCEED');
    assert.strictEqual(result.verdict, 'PROCEED');
    assert.strictEqual(result.proceed, true);
    assert.strictEqual(result.reviewRequired, false);
    assert.strictEqual(result.tier, 1);
    assert.strictEqual(result.riskScore, 2);
    assert.strictEqual(result.callId, 'ra_test123');
    assert.strictEqual(result.policyDecision, 'assess');
  });

  it('executeRadarAssess maps HOLD with options', async () => {
    const mockRadar = {
      assess: async () => ({
        status: 'HOLD',
        verdict: 'HOLD',
        proceed: false,
        reviewRequired: true,
        tier: 2,
        riskScore: 12,
        triggerReason: 'elevated risk',
        vela: 'VELA LITE (T2) | HOLD',
        options: { avoid: 'x', mitigate: 'y', transfer: 'z', accept: 'w' },
        recommended: 'mitigate',
        holdAction: 'halt',
        callId: 'ra_hold123',
        policyDecision: 'assess',
        wouldEscalate: true,
        escalateTier: 3,
      }),
    };

    const result = await executeRadarAssess(
      { action: 'test', activityType: 'email_bulk' },
      mockRadar,
      null
    );

    assert.strictEqual(result.status, 'HOLD');
    assert.strictEqual(result.reviewRequired, true);
    assert.deepStrictEqual(Object.keys(result.options), ['avoid', 'mitigate', 'transfer', 'accept']);
    assert.strictEqual(result.recommended, 'mitigate');
    assert.strictEqual(result.wouldEscalate, true);
    assert.strictEqual(result.escalateTier, 3);
  });

  it('executeRadarAssess maps DENY with no options', async () => {
    const mockRadar = {
      assess: async () => ({
        status: 'DENY',
        verdict: 'DENY',
        proceed: false,
        reviewRequired: false,
        tier: 2,
        riskScore: 25,
        triggerReason: 'irreversibility',
        vela: null,
        options: null,
        recommended: null,
        callId: 'ra_deny123',
        policyDecision: 'assess',
        wouldEscalate: true,
        escalateTier: 4,
      }),
    };

    const result = await executeRadarAssess(
      { action: 'delete everything', activityType: 'data_delete_bulk' },
      mockRadar,
      null
    );

    assert.strictEqual(result.status, 'DENY');
    assert.strictEqual(result.proceed, false);
    assert.strictEqual(result.vela, null);
    assert.strictEqual(result.options, null);
    assert.strictEqual(result.recommended, null);
  });

  it('executeRadarAssess uses default agentId when none provided', async () => {
    let passedOpts;
    const mockRadar = {
      assess: async (action, type, opts) => {
        passedOpts = opts;
        return { status: 'PROCEED', verdict: 'PROCEED', proceed: true, tier: 1, riskScore: 1, triggerReason: 'test', callId: 'ra_test' };
      },
    };

    await executeRadarAssess(
      { action: 'test', activityType: 'data_read' },
      mockRadar,
      'my-default-agent'
    );

    assert.strictEqual(passedOpts.agentId, 'my-default-agent');
  });

  it('executeRadarAssess prefers explicit agentId over default', async () => {
    let passedOpts;
    const mockRadar = {
      assess: async (action, type, opts) => {
        passedOpts = opts;
        return { status: 'PROCEED', verdict: 'PROCEED', proceed: true, tier: 1, riskScore: 1, triggerReason: 'test', callId: 'ra_test' };
      },
    };

    await executeRadarAssess(
      { action: 'test', activityType: 'data_read', agentId: 'explicit-agent' },
      mockRadar,
      'my-default-agent'
    );

    assert.strictEqual(passedOpts.agentId, 'explicit-agent');
  });

  it('executeRadarAssess includes warning when radar is disabled', async () => {
    const mockRadar = {
      assess: async () => ({
        status: 'PROCEED',
        verdict: 'PROCEED',
        proceed: true,
        radarEnabled: false,
        tier: 0,
        riskScore: 0,
        triggerReason: 'RADAR disabled',
        callId: 'ra_disabled',
      }),
    };

    const result = await executeRadarAssess(
      { action: 'test', activityType: 'data_read' },
      mockRadar,
      null
    );

    assert.strictEqual(result.radarEnabled, false);
    assert.ok(result.warning);
    assert.ok(result.warning.includes('disabled'));
  });

  it('executeRadarAssess has no warning when radar is enabled', async () => {
    const mockRadar = {
      assess: async () => ({
        status: 'PROCEED',
        verdict: 'PROCEED',
        proceed: true,
        radarEnabled: true,
        tier: 1,
        riskScore: 1,
        triggerReason: 'test',
        callId: 'ra_enabled',
      }),
    };

    const result = await executeRadarAssess(
      { action: 'test', activityType: 'data_read' },
      mockRadar,
      null
    );

    assert.strictEqual(result.radarEnabled, true);
    assert.strictEqual(result.warning, undefined);
  });

  it('executeRadarAssess falls back to claude-code when no agentId at all', async () => {
    let passedOpts;
    const mockRadar = {
      assess: async (action, type, opts) => {
        passedOpts = opts;
        return { status: 'PROCEED', verdict: 'PROCEED', proceed: true, tier: 1, riskScore: 1, triggerReason: 'test', callId: 'ra_test' };
      },
    };

    await executeRadarAssess(
      { action: 'test', activityType: 'data_read' },
      mockRadar,
      null
    );

    assert.strictEqual(passedOpts.agentId, 'claude-code');
  });
});

describe('config.js', () => {
  it('loadRadarConfig returns an object', () => {
    const config = loadRadarConfig();
    assert.strictEqual(typeof config, 'object');
  });

  it('checkLlmKey does not throw', () => {
    assert.doesNotThrow(() => checkLlmKey({}));
  });

  it('checkSegregation does not throw', () => {
    assert.doesNotThrow(() => checkSegregation({}));
  });
});
