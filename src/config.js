import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Reads configuration from .radar/.env in the user's home directory.
 * Returns parsed key-value pairs.
 */
export function loadRadarConfig() {
  const envPath = join(homedir(), '.radar', '.env');
  const config = {};

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
      config[key] = value;
    }
  }

  return config;
}

/**
 * Check if an LLM key is configured. Logs a warning if missing.
 */
export function checkLlmKey(config) {
  const key = config.LLM_API_KEY || config.RADAR_LLM_KEY || config.T2_API_KEY || config.OPENAI_API_KEY || config.GOOGLE_API_KEY || config.ANTHROPIC_API_KEY;
  if (!key) {
    console.error(
      'Warning: No LLM API key configured. RADAR will use rules-engine scoring only. ' +
      'T2 assessments will return HOLD without Vela reasoning or strategy options. ' +
      'Configure via the dashboard (npx @essentianlabs/radar-lite dashboard) or set LLM_API_KEY in ~/.radar/.env.'
    );
  }
}

/**
 * Check if the configured LLM provider is the same family as the calling agent (Anthropic/Claude).
 * Logs a warning if segregation of duties is violated.
 */
export function checkSegregation(config) {
  const provider = (config.LLM_PROVIDER || config.RADAR_LLM_PROVIDER || 'openai').toLowerCase();
  if (provider === 'anthropic') {
    console.error(
      'Warning: Vela Lite is using the same model family as the calling agent. ' +
      'Segregation of duties recommends a different provider for T1/T2 assessment.'
    );
  }
}
