#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');

process.env.NEXT_TELEMETRY_DISABLED = process.env.NEXT_TELEMETRY_DISABLED || '1';

const isWindows = process.platform === 'win32';
const command = isWindows ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['next', 'build'], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
