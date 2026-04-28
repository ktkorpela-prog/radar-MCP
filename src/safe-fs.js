import { readFileSync, writeFileSync, lstatSync, existsSync } from 'fs';

const MAX_FILE_SIZE = 1024 * 1024; // 1 MiB

/**
 * Read a file safely:
 *   - Refuse to follow symlinks
 *   - Cap reads at MAX_FILE_SIZE bytes
 * Returns null if the file doesn't exist, is a symlink, or exceeds the cap.
 */
export function safeReadFile(path) {
  if (!existsSync(path)) return null;
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return null;
  }
  if (stat.isSymbolicLink()) {
    console.error(`[radar-mcp] Refusing to follow symlink at ${path}`);
    return null;
  }
  if (!stat.isFile()) return null;
  if (stat.size > MAX_FILE_SIZE) {
    console.error(`[radar-mcp] File too large at ${path} (${stat.size} bytes); skipping.`);
    return null;
  }
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Write a file safely:
 *   - If path exists and is a symlink, refuse
 * Returns true on success, false otherwise.
 */
export function safeWriteFile(path, content) {
  if (existsSync(path)) {
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      return false;
    }
    if (stat.isSymbolicLink()) {
      console.error(`[radar-mcp] Refusing to write through symlink at ${path}`);
      return false;
    }
  }
  try {
    writeFileSync(path, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}
