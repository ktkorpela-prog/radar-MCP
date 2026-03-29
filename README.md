# @essentianlabs/radar-mcp

Local MCP server that wraps [@essentianlabs/radar-lite](https://npmjs.com/package/@essentianlabs/radar-lite) as a tool Claude can call before executing actions. Runs entirely on your machine — same privacy model as radar-lite.

## What It Does

Exposes one tool: **`radar_assess`** — assess an intended action for risk before executing it. Returns `PROCEED` or `HOLD` with Vela Lite's reasoning and strategy options.

When Claude is about to take an action (send an email, delete data, call an API), it calls `radar_assess` first. If the verdict is `HOLD`, Claude should stop and explain the risk to the user.

## Install

```bash
npm install @essentianlabs/radar-lite
cd radar-mcp
npm install
```

### Add to Claude Desktop

In your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "radar-lite": {
      "command": "node",
      "args": ["/absolute/path/to/radar-mcp/bin/radar-mcp.js"]
    }
  }
}
```

### Add via Claude CLI

```bash
claude mcp add radar-lite node /absolute/path/to/radar-mcp/bin/radar-mcp.js
```

## Configuration

RADAR reads config from `~/.radar/.env`:

```env
RADAR_ENABLED=true
RADAR_LLM_PROVIDER=openai
RADAR_LLM_KEY=sk-your-openai-key
```

### Segregation of Duties

**The LLM provider for Vela Lite must NOT be the same model family as the calling agent.**

Since Claude (Anthropic) is the calling agent, the default and recommended provider is `openai`:

- **T1 assessment:** gpt-4o-mini (fast, low-cost)
- **T2 assessment:** gpt-4o (deeper reasoning)

If `RADAR_LLM_PROVIDER` is set to `anthropic`, the server logs a warning:

> Warning: Vela Lite is using the same model family as the calling agent. Segregation of duties recommends a different provider for T1/T2 assessment.

This is a core design principle — the model being assessed should not be the model doing the assessing.

## System Prompt Template

Add this to your Claude system prompt or CLAUDE.md:

```
Before taking any action that affects external systems, data, users, or files,
call radar_assess with the intended action. If verdict is HOLD, do not proceed —
explain the hold to the user and suggest alternatives. If verdict is PROCEED,
you may continue.
```

This template is also available as an MCP resource at `radar://setup_instructions`.

## Tool Schema

### `radar_assess`

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | What the agent intends to do |
| `activityType` | string | Yes | One of: `email_single`, `email_bulk`, `publish`, `data_read`, `data_write`, `data_delete_single`, `data_delete_bulk`, `web_search`, `external_api_call`, `system_execute`, `system_files`, `financial` |
| `agentId` | string | No | Identifier for this agent |

**Output:**
| Field | Type | Description |
|-------|------|-------------|
| `verdict` | `"PROCEED"` \| `"HOLD"` | The assessment decision |
| `proceed` | boolean | `true` = safe to proceed |
| `tier` | number | Assessment tier (1 or 2) |
| `riskScore` | number | 1–25 risk score |
| `triggerReason` | string | Why this score was assigned |
| `vela` | string \| null | Vela Lite's formatted assessment |
| `options` | object \| null | T2 strategy options (avoid, mitigate, transfer, accept) |
| `recommended` | string \| null | Recommended strategy |
| `holdAction` | string | Action on HOLD (halt, queue, log_only, notify) |
| `callId` | string | Unique assessment ID |
| `policyDecision` | string | Policy outcome |
| `wouldEscalate` | boolean | Whether this would escalate |
| `escalateTier` | number \| null | Escalation tier (3 or 4) |

## Advisory Notice

**RADAR cannot enforce decisions in MCP integrations.** Claude seeing `HOLD` is advisory. For enforcement, your system prompt must instruct Claude to respect `HOLD` verdicts. RADAR does not intercept or block actions by itself.

The MCP tool provides risk assessment data — it is the system prompt and agent design that determine whether the assessment is acted upon.

## Privacy

- Runs 100% locally — no calls to EssentianLabs servers
- LLM calls go directly from your machine to your configured provider (your key, your cost)
- No API keys are hardcoded
- Assessment history is stored locally in SQLite via radar-lite

## License

MIT
