#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');

process.env.NEXT_TELEMETRY_DISABLED = process.env.NEXT_TELEMETRY_DISABLED || '1';

const timeoutMs = Number.parseInt(process.env.NEXT_BUILD_TIMEOUT_MS || '900000', 10);
const heartbeatMs = Number.parseInt(process.env.NEXT_BUILD_HEARTBEAT_MS || '15000', 10);
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const bundler = String(process.env.NEXT_BUILD_BUNDLER || 'webpack').toLowerCase();
const bundlerArg = bundler === 'turbopack' || bundler === 'turbo' ? '--turbopack' : '--webpack';
const args = ['next', 'build', bundlerArg];
const startedAt = performance.now();

function elapsedSeconds() {
  return Math.round((performance.now() - startedAt) / 1000);
}

console.log(`[next-build] start: ${command} ${args.join(' ')}`);
console.log(`[next-build] node=${process.version} bundler=${bundlerArg.replace('--', '')} timeout=${Math.round(timeoutMs / 1000)}s`);

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});

let finished = false;
const heartbeat = setInterval(() => {
  if (!finished) console.log(`[next-build] still running after ${elapsedSeconds()}s`);
}, Math.max(5000, heartbeatMs));

const timeout = setTimeout(() => {
  if (finished) return;
  console.error(`[next-build] failed: timeout after ${elapsedSeconds()}s.`);
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 5000).unref();
}, Math.max(120000, timeoutMs));

timeout.unref();

child.on('error', (error) => {
  finished = true;
  clearInterval(heartbeat);
  clearTimeout(timeout);
  console.error('[next-build] failed:', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  finished = true;
  clearInterval(heartbeat);
  clearTimeout(timeout);

  if (signal) {
    console.error(`[next-build] stopped by signal ${signal} after ${elapsedSeconds()}s`);
    process.exit(1);
  }

  if (code === 0) {
    console.log(`[next-build] OK in ${elapsedSeconds()}s`);
    process.exit(0);
  }

  console.error(`[next-build] failed with exit code ${code ?? 1} after ${elapsedSeconds()}s`);
  process.exit(code ?? 1);
});
