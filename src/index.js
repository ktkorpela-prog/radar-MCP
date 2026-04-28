import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  radarAssessInputSchema,
  executeRadarAssess,
} from './tool.js';
import { loadRadarConfig, checkLlmKey, checkSegregation } from './config.js';

const SETUP_INSTRUCTIONS = `You MUST call radar_assess before every task. It MUST be your first tool call. No exceptions.

- If the verdict is PROCEED, you may continue.
- If the verdict is HOLD or DENY, you MUST stop. Show the user the verdict, Vela's reasoning, and the strategy options. Ask the user which option to take. You MUST NOT pick a strategy on their behalf or proceed based on prior context.`;

export async function createServer() {
  // Load config and check segregation of duties
  const config = loadRadarConfig();
  checkLlmKey(config);
  checkSegregation(config);

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
    version: '0.2.8',
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
