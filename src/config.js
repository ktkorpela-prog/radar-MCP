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
 * Check if the configured LLM provider is the same family as the calling agent (Anthropic/Claude).
 * Logs a warning if segregation of duties is violated.
 */
export function checkSegregation(config) {
  const provider = (config.RADAR_LLM_PROVIDER || 'openai').toLowerCase();
  if (provider === 'anthropic') {
    console.error(
      'Warning: Vela Lite is using the same model family as the calling agent. ' +
      'Segregation of duties recommends a different provider for T1/T2 assessment.'
    );
  }
}
