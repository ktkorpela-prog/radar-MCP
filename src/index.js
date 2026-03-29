import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  radarAssessInputSchema,
  executeRadarAssess,
} from './tool.js';
import { loadRadarConfig, checkSegregation } from './config.js';

const SETUP_INSTRUCTIONS = `Before taking any action that affects external systems, data, users, or files, call radar_assess with the intended action. If verdict is HOLD, do not proceed — explain the hold to the user and suggest alternatives. If verdict is PROCEED, you may continue.

IMPORTANT: RADAR cannot enforce decisions in MCP integrations. Claude seeing HOLD is advisory. This system prompt instruction is what makes Claude respect HOLD verdicts. RADAR does not intercept or block actions by itself.`;

export async function createServer() {
  // Load config and check segregation of duties
  const config = loadRadarConfig();
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

  const server = new McpServer({
    name: 'radar-lite',
    version: '0.1.0',
  });

  // Register the radar_assess tool
  server.tool(
    TOOL_NAME,
    TOOL_DESCRIPTION,
    radarAssessInputSchema.shape,
    async (params) => {
      try {
        const result = await executeRadarAssess(params, radar);
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
              text: `RADAR assessment failed: ${err.message}`,
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
