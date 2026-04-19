# Changelog — radar-mcp

## 2026-04-19 — v0.2.0 — radar-lite v0.3.0 compatibility + Claude Desktop

### Updated
- **tool.js** — Added `status` and `reviewRequired` fields to response mapping. radar-lite v0.3.0 returns `status` ('PROCEED' | 'HOLD' | 'DENY') as primary verdict and `reviewRequired` (true on HOLD). Both now passed through to Claude.
- **index.js** — SETUP_INSTRUCTIONS updated with three-verdict guidance: PROCEED (continue), HOLD (explain + present options), DENY (hard stop, user must override via dashboard/API). Version bumped to 0.2.0.
- **package.json** — Peer dep bumped from `^0.2.7` to `^0.3.0`. Version bumped to 0.2.0.
- **bin/radar-mcp.js** — Added `--version` / `-v` flag, reads version from package.json.

### Added
- **Claude Desktop config** — Created `%LOCALAPPDATA%\Claude\claude_desktop_config.json` with radar MCP server entry (stdio transport, absolute path to bin/radar-mcp.js).
- **README rewrite** — Full install guide with step-by-step instructions (clone, deps, LLM config, Claude Code vs Desktop setup, system prompt, verification). Added prerequisites, dependencies table, both Claude environments (`claude mcp add` for Code, `claude_desktop_config.json` for Desktop), v0.3.0 output fields (status, reviewRequired, DENY), verdict behaviour section, segregation of duties model table, privacy section. Dashboard section with `npx @essentianlabs/radar-lite dashboard` instructions. Replaces the minimal v0.1.0 README.
- **LLM key warning** — `config.js` now checks for LLM API key at startup. Checks `LLM_API_KEY` (what the dashboard writes) and `RADAR_LLM_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY` as fallbacks. Segregation check also reads `LLM_PROVIDER` first. If no key is found, logs a warning pointing to dashboard or `~/.radar/.env`.
- **agentId passthrough** — `tool.js` now passes `agentId` from the tool input to `radar.assess()` as `options.agentId`. Was previously accepted in the Zod schema but silently dropped.
- **LLM key passthrough** — `index.js` now calls `radar.configure()` on startup using values from `~/.radar/.env`. Supports dual-provider config: `LLM_PROVIDER`/`LLM_API_KEY` for T1, `T2_PROVIDER`/`T2_API_KEY` for T2. Without this, radar-lite had no key and fell back to rules-engine-only scoring. Vela reasoning, strategy options, and recommended strategy now flow through on T2 HOLD verdicts.
- **Install/uninstall CLI commands** — `node bin/radar-mcp.js install` registers the MCP server at user scope (`claude mcp add -s user`) and adds a RADAR instruction block to `~/.claude/CLAUDE.md` so Claude automatically calls `radar_assess` before every task. `uninstall` reverses both. Instruction block is wrapped in `<!-- RADAR-MCP -->` markers for clean add/remove/update. Handles re-install (removes existing server first) and idempotent CLAUDE.md updates. Instruction simplified to: "Call radar_assess before every task. It must be your first tool call."
- **Custom activity types** — `activityType` changed from Zod enum to string. Standard 12 types listed in description for Claude's guidance, but custom types from the dashboard (e.g. `slack_messages`) are now accepted. Removes the gap where dashboard config couldn't flow through the MCP.
- **Hot-reload config and database** — `index.js` now calls `applyConfig()` and `radar.reload()` before every `radar_assess` call. Dashboard changes (LLM keys, sliders, human review, trigger policies) take effect on the next assessment without needing a new session. `radar.reload()` added by package team — re-reads SQLite from disk, WASM engine cached to avoid reinit cost.
- **README rewrite** — Install flow simplified to clone → npm install → `node bin/radar-mcp.js install` → configure LLM key via dashboard. Removed manual `claude mcp add` and system prompt steps. Added install/uninstall to CLI section.

### Verified
- All modules load correctly with radar-lite v0.3.0
- T1 PROCEED: `status: "PROCEED"`, `reviewRequired: false` — correct
- T2 HOLD (email_single, score 12): `status: "HOLD"`, `reviewRequired: true`, `wouldEscalate: true`, `escalateTier: 3` — correct
- DENY (data_delete_bulk, score 25): `status: "DENY"`, `reviewRequired: false`, no options — correct
- `--version` flag returns `radar-mcp v0.2.0`
- MCP server starts cleanly via CLI entry point (stdio, no errors)
- LLM key warning fires correctly when no key is configured
- Claude Code integration: `claude mcp add` works, tool visible and callable in new sessions
- Dashboard shows all assessments made through the MCP server

### Known issues found and fixed (radar-lite side)
- **Dashboard call log didn't auto-refresh** — reported to package team, fix confirmed
- **Agents tab blank** — `agent_id` column missing from assessments table. Package team added column + ALTER TABLE migration. MCP calls now store agent_id correctly.
- **Database location split** — `register.js` used `process.cwd()` for `.radar/` path, causing separate databases per working directory. Package team fixed to `os.homedir()` — all tools now share `~/.radar/register.db`. Also fixed in `index.js` (env reads) and `server.js` (env read/write). Stale database at `radar-mcp/.radar/` deleted.

### Integration test results (post-fix)
- MCP writes to `~/.radar/register.db` — confirmed
- `agent_id: 'mcp-test-agent'` stored in assessments — confirmed
- Dashboard shows MCP calls after restart — confirmed
- Agents tab shows `mcp-test-agent` — confirmed
- T2 HOLD with full Vela reasoning (Anthropic key) — confirmed: four strategy options, recommended strategy, context-specific assessment
- `install` command registers MCP + adds CLAUDE.md instruction — confirmed
- `uninstall` command removes both cleanly — confirmed
- Claude Code auto-calls `radar_assess` before external actions (via CLAUDE.md instruction) — confirmed
- End-to-end: user asks to send email → Claude calls radar_assess → gets HOLD with Vela reasoning → presents options to user — confirmed
- Dual-provider config (T1 Anthropic + T2 OpenAI): Vela T2 reasoning from GPT-4o — confirmed
- Simplified CLAUDE.md instruction ("call radar_assess before every task"): Claude calls tool as first action for all task types — confirmed
- system_files HOLD with OpenAI Vela reasoning: options, recommended strategy, context-specific advice — confirmed

### Not yet done
- Live Claude Desktop integration test (requires restarting Claude Desktop app)
- Bundled dep vs peer dep decision deferred — peer dep works, no user friction reported yet
- Package team test data (10 rows at 17:03:00) needs cleanup from `~/.radar/register.db`

---

## 2026-03-29 — v0.1.0 — Initial Build

### Created
- **Project scaffolding** — initialized `C:\Users\karin\radar-mcp` with ESM package structure
- **package.json** — `@essentianlabs/radar-mcp` v0.1.0, private, deps: `@modelcontextprotocol/sdk` ^1.28.0, `zod` ^3.25.0, peerDep: `@essentianlabs/radar-lite` ^0.2.7
- **src/config.js** — reads `~/.radar/.env` config, parses key-value pairs, checks segregation of duties (warns if `RADAR_LLM_PROVIDER=anthropic`)
- **src/tool.js** — `radar_assess` tool definition with Zod input schema (action, activityType, agentId), `executeRadarAssess()` wrapper that calls `radar.assess()` and maps the response
- **src/index.js** — MCP server entry point using `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` with `StdioServerTransport`; registers `radar_assess` tool and `radar://setup_instructions` resource; dynamic import of radar-lite peer dependency
- **bin/radar-mcp.js** — CLI entry point with shebang
- **README.md** — full documentation: what it does, install instructions, configuration, segregation of duties, system prompt template, tool schema, advisory notice, privacy section
- **VPS-MONITORING.md** — instructions for VPS monitor agent: radar-mcp is NOT a VPS service, monitoring checklist for radar-lite on VPS, PM2 rules
- **.gitignore** — excludes node_modules, .radar/, .env, logs

### Verified
- All modules load correctly (tested with `node --input-type=module`)
- Zod schema validates input correctly
- `McpServer.tool()` and `McpServer.resource()` registration works with `.shape` pattern
- MCP SDK v1.28.0 confirmed as correct package (`@modelcontextprotocol/sdk`, NOT the unreleased v2 `@modelcontextprotocol/server`)

### Deployed
- Git repo initialized, committed, pushed to https://github.com/ktkorpela-prog/radar-MCP (private)
- npm dependencies installed (node_modules present locally)

### Not yet done
- End-to-end test with radar-lite installed (radar-lite npm publish deferred by owner)
- Claude Desktop integration test
- No PM2 process — this is a stdio server, not a daemon
