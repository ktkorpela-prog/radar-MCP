#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  console.log(`radar-mcp v${pkg.version}`);
  process.exit(0);
}

if (process.argv.includes('install')) {
  const binPath = join(__dirname, 'radar-mcp.js').replace(/\\/g, '/');

  // 0. Check radar-lite is installed and version-compatible
  const ownPkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  const requiredRange = ownPkg.peerDependencies?.['@essentianlabs/radar-lite'] || '^0.3.0';
  const requiredMajor = requiredRange.match(/(\d+)\.(\d+)/);

  let installedVersion;
  try {
    const radarPkgPath = require.resolve('@essentianlabs/radar-lite/package.json', { paths: [process.cwd(), __dirname] });
    installedVersion = JSON.parse(readFileSync(radarPkgPath, 'utf-8')).version;
  } catch {
    try {
      // Fallback: try dynamic import
      await import('@essentianlabs/radar-lite');
      installedVersion = 'unknown';
    } catch {
      console.error(
        'Error: @essentianlabs/radar-lite is not installed.\n\n' +
        '  npm install @essentianlabs/radar-lite@latest\n'
      );
      process.exit(1);
    }
  }

  // Simple major.minor check — peer dep is ^0.3.0, so installed must be 0.3.x
  if (installedVersion !== 'unknown' && requiredMajor) {
    const [, reqMaj, reqMin] = requiredMajor;
    const installedMatch = installedVersion.match(/(\d+)\.(\d+)/);
    if (installedMatch) {
      const [, insMaj, insMin] = installedMatch;
      const compatible = insMaj === reqMaj && (reqMaj !== '0' ? true : insMin === reqMin);
      if (!compatible) {
        console.error(
          `Error: @essentianlabs/radar-lite version mismatch.\n` +
          `  Installed: ${installedVersion}\n` +
          `  Required:  ${requiredRange}\n\n` +
          `Update radar-lite:\n\n` +
          `  npm install @essentianlabs/radar-lite@latest\n`
        );
        process.exit(1);
      }
    }
  }

  // 1. Register MCP server at user scope
  console.log('Registering radar MCP server...');
  try {
    // Remove existing first (may not exist, that's fine)
    try { execFileSync('claude', ['mcp', 'remove', '-s', 'user', 'radar'], { stdio: 'ignore' }); } catch {}
    execFileSync('claude', ['mcp', 'add', '-s', 'user', 'radar', 'node', binPath], { stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to register MCP server. Is Claude Code CLI installed?');
    process.exit(1);
  }

  // 2. Add instruction to ~/.claude/CLAUDE.md
  const RADAR_MARKER = '<!-- RADAR-MCP -->';
  const RADAR_INSTRUCTION = `${RADAR_MARKER}
## RADAR — Risk Assessment (MANDATORY)

You MUST call \`radar_assess\` before every task. It MUST be your first tool call. No exceptions.

- If the verdict is **PROCEED**, you may continue.
- If the verdict is **HOLD** or **DENY**, you MUST stop. Show the user the verdict, Vela's reasoning, and the strategy options. Then ask the user which option to take. You MUST NOT pick a strategy on their behalf. You MUST NOT proceed based on prior context, changelogs, conversation history, or your own judgement. Only the user can authorize continuing past a HOLD or DENY.
${RADAR_MARKER}`;

  const claudeDir = join(homedir(), '.claude');
  const claudeMdPath = join(claudeDir, 'CLAUDE.md');

  mkdirSync(claudeDir, { recursive: true });

  let existing = '';
  if (existsSync(claudeMdPath)) {
    existing = readFileSync(claudeMdPath, 'utf-8');
  }

  if (existing.includes(RADAR_MARKER)) {
    // Replace existing RADAR block
    const regex = new RegExp(`${RADAR_MARKER}[\\s\\S]*?${RADAR_MARKER}`, 'm');
    const updated = existing.replace(regex, RADAR_INSTRUCTION);
    writeFileSync(claudeMdPath, updated, 'utf-8');
    console.log('Updated RADAR instructions in ~/.claude/CLAUDE.md');
  } else {
    // Append
    const separator = existing.length > 0 ? '\n\n' : '';
    writeFileSync(claudeMdPath, existing + separator + RADAR_INSTRUCTION + '\n', 'utf-8');
    console.log('Added RADAR instructions to ~/.claude/CLAUDE.md');
  }

  console.log('\nDone. RADAR is now installed.');
  console.log('New Claude Code sessions will use RADAR automatically.');
  console.log('Existing sessions need to be restarted to pick up RADAR.');

  if (process.argv.includes('--dashboard')) {
    console.log('\nStarting dashboard...');
    const { spawn } = await import('child_process');
    spawn('npx', ['@essentianlabs/radar-lite', 'dashboard'], {
      stdio: 'inherit',
      shell: true,
    });
  } else {
    console.log('\nConfigure your LLM key: npx @essentianlabs/radar-lite dashboard');
    process.exit(0);
  }
}

if (process.argv.includes('uninstall')) {
  // 1. Remove MCP server
  console.log('Removing radar MCP server...');
  try {
    execFileSync('claude', ['mcp', 'remove', '-s', 'user', 'radar'], { stdio: 'inherit' });
  } catch (err) {
    // May not exist, that's fine
  }

  // 2. Remove instruction from CLAUDE.md
  const RADAR_MARKER = '<!-- RADAR-MCP -->';
  const claudeMdPath = join(homedir(), '.claude', 'CLAUDE.md');

  if (existsSync(claudeMdPath)) {
    let content = readFileSync(claudeMdPath, 'utf-8');
    if (content.includes(RADAR_MARKER)) {
      const regex = new RegExp(`\\n?\\n?${RADAR_MARKER}[\\s\\S]*?${RADAR_MARKER}\\n?`, 'm');
      content = content.replace(regex, '').trim();
      writeFileSync(claudeMdPath, content + (content ? '\n' : ''), 'utf-8');
      console.log('Removed RADAR instructions from ~/.claude/CLAUDE.md');
    }
  }

  console.log('Done. RADAR removed.');
  process.exit(0);
}

const { main } = await import('../src/index.js');

main().catch((err) => {
  console.error('radar-mcp failed to start:', err);
  process.exit(1);
});
