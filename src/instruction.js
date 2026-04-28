export const RADAR_MARKER = '<!-- RADAR-MCP -->';

export const RADAR_INSTRUCTION = `${RADAR_MARKER}
## RADAR — Risk Assessment (MANDATORY)

You MUST call \`radar_assess\` before every task. It MUST be your first tool call. No exceptions.

- If the verdict is **PROCEED**, you may continue.
- If the verdict is **HOLD** or **DENY**, you MUST stop. Show the user the verdict, Vela's reasoning, and the strategy options. Then ask the user which option to take. You MUST NOT pick a strategy on their behalf. You MUST NOT proceed based on prior context, changelogs, conversation history, or your own judgement. Only the user can authorize continuing past a HOLD or DENY.
- If \`radarEnabled\` is **false** in the response, you MUST tell the user that RADAR is currently disabled and this action was not assessed. Ask whether they want to enable RADAR (via the dashboard) or proceed without assessment.
${RADAR_MARKER}`;

export function extractCurrentBlock(claudeMdContent) {
  const regex = new RegExp(`${RADAR_MARKER}[\\s\\S]*?${RADAR_MARKER}`, 'm');
  const match = claudeMdContent.match(regex);
  return match ? match[0] : null;
}
