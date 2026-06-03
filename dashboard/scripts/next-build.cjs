#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

process.env.NEXT_TELEMETRY_DISABLED = process.env.NEXT_TELEMETRY_DISABLED || '1';

const timeoutMs = Number.parseInt(process.env.NEXT_BUILD_TIMEOUT_MS || '600000', 10);
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['next', 'build'];
const startedAt = performance.now();

console.log(`[next-build] start: ${command} ${args.join(' ')}`);

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: process.env,
  timeout: Math.max(120000, timeoutMs),
});

const elapsedSeconds = Math.round((performance.now() - startedAt) / 1000);

if (result.error) {
  if (result.error.code === 'ETIMEDOUT') {
    console.error(`[next-build] failed: timeout after ${elapsedSeconds}s.`);
  } else {
    console.error('[next-build] failed:', result.error);
  }
  process.exit(1);
}

if (result.signal) {
  console.error(`[next-build] stopped by signal ${result.signal} after ${elapsedSeconds}s`);
  process.exit(1);
}

if (result.status === 0) {
  console.log(`[next-build] OK in ${elapsedSeconds}s`);
  process.exit(0);
}

console.error(`[next-build] failed with exit code ${result.status ?? 1} after ${elapsedSeconds}s`);
process.exit(result.status ?? 1);
