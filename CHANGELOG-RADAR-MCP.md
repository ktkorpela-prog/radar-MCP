# Changelog — radar-mcp

## 2026-03-29 — Initial Build

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
