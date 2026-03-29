#!/usr/bin/env node
import { main } from '../src/index.js';

main().catch((err) => {
  console.error('radar-mcp failed to start:', err);
  process.exit(1);
});
