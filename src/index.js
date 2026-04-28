import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  radarAssessInputSchema,
  executeRadarAssess,
} from './tool.js';
import { loadRadarConfig, checkLlmKey, checkSegregation } from './config.js';
import { RADAR_INSTRUCTION, extractCurrentBlock } from './instruction.js';

function checkClaudeMdSync() {
  const claudeMdPath = join(homedir(), '.claude', 'CLAUDE.md');
  if (!existsSync(claudeMdPath)) return;
  try {
    const content = readFileSync(claudeMdPath, 'utf-8');
    const currentBlock = extractCurrentBlock(content);
    if (currentBlock && currentBlock.trim() !== RADAR_INSTRUCTION.trim()) {
      console.error(
        '[radar-mcp] CLAUDE.md instruction is out of date with the installed package. ' +
        'Run `npx radar-mcp install` to refresh it.'
      );
    }
  } catch {
    // Ignore — best-effort check
  }
}

const UPDATE_CHECK_CACHE = join(homedir(), '.radar', '.mcp-update-check');
const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function checkRadarLiteVersion() {
  // Read installed radar-lite version
  let installed;
  try {
    const radarPkgPath = require.resolve('@essentianlabs/radar-lite/package.json');
    installed = JSON.parse(readFileSync(radarPkgPath, 'utf-8')).version;
  } catch {
    return; // radar-lite not installed — separate check handles that
  }

  // Read cache
  let cache = null;
  if (existsSync(UPDATE_CHECK_CACHE)) {
    try {
      cache = JSON.parse(readFileSync(UPDATE_CHECK_CACHE, 'utf-8'));
    } catch {
      cache = null;
    }
  }

  const now = Date.now();
  let latest = cache?.latest;

  // Fetch from npm registry if cache is stale
  if (!cache || (now - cache.checkedAt) > UPDATE_CHECK_TTL_MS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://registry.npmjs.org/@essentianlabs%2fradar-lite/latest', {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        latest = data.version;
        try {
          mkdirSync(join(homedir(), '.radar'), { recursive: true });
          writeFileSync(UPDATE_CHECK_CACHE, JSON.stringify({ checkedAt: now, latest }), 'utf-8');
        } catch {
          // Ignore write failure
        }
      }
    } catch {
      return; // Network failure — silent
    }
  }

  if (latest && compareVersions(latest, installed) > 0) {
    console.error(
      `[radar-mcp] @essentianlabs/radar-lite v${latest} is available (installed: v${installed}). ` +
      `Run \`npm install @essentianlabs/radar-lite@latest\` to update.`
    );
  }
}

const SETUP_INSTRUCTIONS = `You MUST call radar_assess before every task. It MUST be your first tool call. No exceptions.

- If the verdict is PROCEED, you may continue.
- If the verdict is HOLD or DENY, you MUST stop. Show the user the verdict, Vela's reasoning, and the strategy options. Ask the user which option to take. You MUST NOT pick a strategy on their behalf or proceed based on prior context.
- If radarEnabled is false, you MUST tell the user RADAR is disabled and this action was not assessed. Ask whether they want to enable RADAR or proceed without assessment.`;

export async function createServer() {
  // Load config and check segregation of duties
  const config = loadRadarConfig();
  checkLlmKey(config);
  checkSegregation(config);
  checkClaudeMdSync();
  // Fire and forget — don't block startup
  checkRadarLiteVersion().catch(() => {});

  // Import radar-lite dynamically (peer dependency)
  let radar;
  try {
    const radarModule = await import('@essentianlabs/radar-lite');
    radar = radarModule.default || radarModule;
  } catch (err) {
    console.error(
      'Failed to import @essentianlabs/radar-lite. Ensure it is installed:\n' +
      '  npm install @essentianlabs/radar-lite\n\n' +
      err.message
    );
    process.exit(1);
  }

  // Configure radar-lite on startup with initial config
  function applyConfig() {
    const cfg = loadRadarConfig();
    const llmKey = cfg.LLM_API_KEY || cfg.RADAR_LLM_KEY || null;
    const llmProvider = cfg.LLM_PROVIDER || cfg.RADAR_LLM_PROVIDER || 'openai';
    const t2Key = cfg.T2_API_KEY || null;
    const t2Provider = cfg.T2_PROVIDER || null;
    if (llmKey && radar.configure) {
      const opts = { llmKey, llmProvider };
      if (t2Key) opts.t2Key = t2Key;
      if (t2Provider) opts.t2Provider = t2Provider;
      radar.configure(opts);
    }
    return cfg;
  }
  applyConfig();

  const server = new McpServer({
    name: 'radar-lite',
    version: '0.3.0',
  });

  // Register the radar_assess tool
  server.tool(
    TOOL_NAME,
    TOOL_DESCRIPTION,
    radarAssessInputSchema.shape,
    async (params) => {
      try {
        // Re-read config and database on every call so dashboard changes are picked up mid-session
        const cfg = applyConfig();
        if (radar.reload) await radar.reload();
        const defaultAgentId = cfg.RADAR_AGENT_ID || null;
        const result = await executeRadarAssess(params, radar, defaultAgentId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: 'RADAR assessment failed. Check radar-lite configuration and logs.',
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Register the setup_instructions resource
  server.resource(
    'setup_instructions',
    'radar://setup_instructions',
    {
      title: 'RADAR Setup Instructions',
      description: 'System prompt template for instructing Claude to use RADAR assessments',
      mimeType: 'text/plain',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: SETUP_INSTRUCTIONS,
        },
      ],
    })
  );

  return server;
}

export async function main() {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
