# @essentianlabs/radar-mcp

Early beta for evaluation only.

RADAR MCP is in active evaluation. If you try it, assume it's experimental and tell me where it breaks — technically or conceptually.

Local MCP server that wraps [@essentianlabs/radar-lite](https://npmjs.com/package/@essentianlabs/radar-lite) as a tool Claude can call before executing actions. Runs entirely on your machine — same privacy model as radar-lite.

## What It Does

Exposes one tool: **`radar_assess`** — assess an intended action for risk before executing it. Returns `PROCEED`, `HOLD`, or `DENY` with Vela Lite's reasoning and strategy options.

When Claude is about to take an action (send an email, delete data, call an API), it calls `radar_assess` first. If the verdict is `HOLD`, Claude stops and explains the risk. If the verdict is `DENY`, the action is blocked by policy.

**Everything runs locally.** The MCP server calls radar-lite on your machine. radar-lite calls your own LLM provider key (OpenAI, Google, or Anthropic). No calls are made to EssentianLabs servers.

```
Claude → radar-mcp (local) → radar-lite (local) → your LLM key (OpenAI/Google)
```

## Prerequisites

- **Node.js 18+** — [download](https://nodejs.org/)
- **npm** — comes with Node.js
- **An LLM API key** — OpenAI (recommended) or Google. Required for Vela Lite T2 assessments. Without a key, radar-lite falls back to rules-engine-only scoring (T1 works, T2 returns HOLD without reasoning).
- **Claude Code** (VS Code extension) or **Claude Desktop** — whichever you use as your agent

## Install

### Step 1: Install packages

```bash
npm install @essentianlabs/radar-lite @essentianlabs/radar-mcp
```

### Step 2: Register with Claude Code

```bash
npx radar-mcp install
```

This does two things:
1. Registers the MCP server with Claude Code at user scope (available in all sessions)
2. Adds a RADAR instruction to `~/.claude/CLAUDE.md` so Claude automatically calls `radar_assess` before taking external actions

To verify:

```bash
claude mcp list
```

To uninstall (removes MCP server and CLAUDE.md instruction):

```bash
npx radar-mcp uninstall
```

### Step 4: Configure your LLM provider

Launch the radar-lite dashboard:

```bash
npx @essentianlabs/radar-lite dashboard
```

Go to **Settings** and configure your LLM provider and API key. Recommended: OpenAI (see Segregation of Duties below).

Or create `~/.radar/.env` manually:

```env
LLM_PROVIDER=openai
LLM_API_KEY=sk-your-openai-key
RADAR_AGENT_ID=my-agent
```

`RADAR_AGENT_ID` is optional — defaults to `claude-code`. Set it to identify this agent in the dashboard when running multiple agents.

Supported providers: `openai` (recommended), `google`, `anthropic` (not recommended — see Segregation of Duties below).

Without an LLM key, radar-lite still works but only uses the deterministic rules engine. T1 actions get scored and return PROCEED/HOLD. T2 actions return HOLD without Vela's reasoning or strategy options.

#### Claude Desktop (alternative)

If you use Claude Desktop instead of Claude Code, add to your `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%LOCALAPPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "radar": {
      "command": "node",
      "args": ["/absolute/path/to/radar-MCP/bin/radar-mcp.js"]
    }
  }
}
```

Restart Claude Desktop after saving.

#### Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json` in your project, or global settings):

```json
{
  "mcpServers": {
    "radar": {
      "command": "npx",
      "args": ["radar-mcp"]
    }
  }
}
```

Add this to your `.cursorrules` file so Cursor calls RADAR automatically:

```
Call radar_assess before every task. It must be your first tool call.
If the verdict is PROCEED, continue. If HOLD or DENY, stop and explain the verdict to the user.
```

### Step 5: Verify

**Restart any open Claude Code sessions** — MCP servers are loaded when a session starts. Existing sessions won't see the radar tool until restarted.

Then ask Claude to do something that would trigger an assessment — for example:

> "Send a bulk email to 5,000 subscribers announcing our new feature"

Claude should call `radar_assess` before acting. You'll see the tool call and the verdict in the conversation.

**Note:** Dashboard changes (sliders, human review, trigger policies, LLM keys) take effect on the next `radar_assess` call within any running session — no restart needed for config changes. Only the initial install requires a session restart.

## Segregation of Duties

Since Claude is the calling agent, we recommend using a different LLM provider for RADAR assessments — `openai` or `google`. T1 uses a fast model for quick scoring. T2 uses a reasoning model for deeper review. Model selection is handled automatically based on your configured provider.

If `RADAR_LLM_PROVIDER` is set to `anthropic`, the server logs a warning.

## Tool Schema

### `radar_assess`

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | What the agent intends to do — be descriptive for accurate scoring |
| `activityType` | enum | Yes | One of: `email_single`, `email_bulk`, `publish`, `data_read`, `data_write`, `data_delete_single`, `data_delete_bulk`, `web_search`, `external_api_call`, `system_execute`, `system_files`, `financial` |
| `agentId` | string | No | Identifier for this agent (used for per-agent config and history) |

**Output:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"PROCEED"` \| `"HOLD"` \| `"DENY"` | Primary verdict |
| `verdict` | string | Same as status (backwards compatibility) |
| `proceed` | boolean | `true` if safe to proceed |
| `reviewRequired` | boolean | `true` on HOLD — explicit human/system review needed |
| `tier` | number | Assessment tier (1 or 2) |
| `riskScore` | number | 1–25 risk score |
| `triggerReason` | string | Why this score was assigned |
| `vela` | string \| null | Vela Lite's formatted assessment |
| `options` | object \| null | T2 strategy options: `{ avoid, mitigate, transfer, accept }` |
| `recommended` | string \| null | Recommended strategy |
| `holdAction` | string | Configured action on HOLD (halt, queue, log_only, notify) |
| `callId` | string | Unique assessment ID for this call |
| `policyDecision` | string | Policy outcome (assess, human_required, no_assessment, deny) |
| `wouldEscalate` | boolean | Whether this would be T3/T4 on the full RADAR server |
| `escalateTier` | number \| null | Escalation tier (3 or 4) if applicable |

### Verdict behaviour

- **PROCEED** — Below review threshold. Agent may continue.
- **HOLD** — Requires review. Comes with Vela's reasoning, four strategy options (avoid/mitigate/transfer/accept), and a recommended strategy.
- **DENY** — Hard stop. Blocked by policy or extreme risk. Can only be overridden via the radar-lite dashboard — not by the agent.

## Dashboard

radar-lite includes a local dashboard where you can view assessment history, risk scores, Sankey flow charts, agent stats, and configure activity sliders and policies.

To launch it:

```bash
npx @essentianlabs/radar-lite dashboard
```

This starts the dashboard at `http://localhost:4040`. All assessments made through the MCP server are automatically recorded in radar-lite's local SQLite database and visible here.

If you get a "not found" error, install radar-lite globally first:

```bash
npm install -g @essentianlabs/radar-lite
```

Then run:

```bash
radar-lite dashboard
```

## Dependencies

| Package | Version | What it does |
|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | ^1.28.0 | MCP server framework (stdio transport) |
| `zod` | ^3.25.0 | Input schema validation |
| `@essentianlabs/radar-lite` | ^0.3.0 | Risk assessment engine (peer dependency) |

## Advisory notice

RADAR produces risk intelligence, not safety assurance. It structures reasoning — it does not validate decisions.

- RADAR assesses the **action description** supplied by the developer or agent. It does not verify, monitor, or control the real-world action that is actually executed.
- A **PROCEED** verdict means "not held by this assessment." It is not authorization, approval, certification, legal advice, or safety validation.
- RADAR can produce a PROCEED verdict for actions that later prove harmful, incorrect, unethical, or non-compliant. The assessment reflects what was described, not what occurs.
- **Liability remains with the developer, operator, and end user.** RADAR does not transfer, reduce, or share liability for actions taken.
- If an external LLM provider is configured, action text leaves the local machine and is sent to that provider under your own account and API terms.
- **RADAR cannot enforce decisions in MCP integrations.** Claude seeing `HOLD` or `DENY` is advisory. The system prompt instruction is what makes Claude respect verdicts. RADAR does not intercept or block actions by itself.

This is a beta release. Not recommended for enterprise or production use without independent legal and compliance review. By installing this package you agree to the [Beta Terms of Use](https://radar.essentianlabs.com/terms.html).

See the [radar-lite README](https://npmjs.com/package/@essentianlabs/radar-lite) for full advisory terms.

## Privacy and Data Flow

- **No calls to EssentianLabs servers** — everything runs locally
- **LLM calls go to your configured provider** (OpenAI, Google, or Anthropic) using your API key, at your cost. Action descriptions are sent to the provider for assessment. Review your provider's data retention policies.
- **Without an LLM key** — no external calls are made. The rules engine runs entirely locally.
- **Assessment history** — stored locally in SQLite at `~/.radar/register.db`. Action hashes only — never action text.
- **No telemetry, no analytics, no phoning home**

## CLI

```bash
npx radar-mcp install             # Register MCP server + add CLAUDE.md instruction
npx radar-mcp install --dashboard # Same + open the dashboard
npx radar-mcp uninstall           # Remove MCP server + remove CLAUDE.md instruction
npx radar-mcp --version           # Print version
```

## License

MIT — see [LICENSE](LICENSE).

Copyright 2026 EssentianLabs.
