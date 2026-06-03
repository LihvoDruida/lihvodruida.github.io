#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const failures = [];
const warnings = [];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(dir, files = []) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return files;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(relative, files);
    else files.push(relative.replaceAll(path.sep, '/'));
  }
  return files;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

const sourceFiles = walk('src').filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file));
const textFiles = [
  ...sourceFiles,
  ...walk('scripts').filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)),
  'package.json',
  'vercel.json',
  'next.config.mjs',
  'tsconfig.json',
].filter((file, index, array) => exists(file) && array.indexOf(file) === index);

assert(!(exists('src/middleware.ts') && exists('src/proxy.ts')), 'Next 16 conflict: src/middleware.ts and src/proxy.ts cannot exist together. Keep proxy.ts only.');
assert(!exists('middleware.ts'), 'Stale root middleware.ts detected. Keep src/proxy.ts only.');
assert(!exists('src/src/middleware.ts'), 'Stale nested src/src/middleware.ts detected.');
assert(!exists('src/src/proxy.ts'), 'Stale nested src/src/proxy.ts detected.');

const combined = textFiles.map((file) => `\n/* ${file} */\n${read(file)}`).join('\n');
const runtimeCombined = [
  ...sourceFiles,
  '.env.example',
  'package.json',
  'next.config.mjs',
  'vercel.json',
].filter((file, index, array) => exists(file) && array.indexOf(file) === index)
  .map((file) => `\n/* ${file} */\n${read(file)}`)
  .join('\n');

assert(!/Warcraft\s*Logs|warcraftLogs|WCL_|GUILD_ROSTER_WCL_|WARCRAFTLOGS_/i.test(runtimeCombined), 'Warcraft Logs/WCL reference detected in source/config after WCL removal.');
assert(!/\.collection\((['"])dashboardAdminAudit\1\)/.test(combined), 'Firestore dashboardAdminAudit collection access detected. Audit logs must stay Discord-only.');
assert(!/\.collection\((['"])dashboardProfiles\1\)\s*\.limit\(1000\)/.test(combined), 'Heavy dashboardProfiles LIMIT 1000 scan detected. Use dashboardProfileCharacterLinks or bounded fallback.');
assert(!/guildRuntimeCache[\s\S]{0,300}\.collection\((['"])members\1\)/.test(combined), 'Deprecated guildRuntimeCache/*/members read/write detected. Use guildRosterRecords/memberChunks.');

if (exists('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  const packages = lock.packages || {};
  for (const [name, meta] of Object.entries(packages)) {
    if (name.endsWith('node_modules/uuid')) {
      assert(/^11\./.test(String(meta.version || '')), `Deprecated uuid version in package-lock: ${meta.version || 'unknown'}.`);
    }
    if (name.endsWith('node_modules/node-domexception')) {
      assert(String(meta.resolved || '').includes('vendor/node-domexception'), 'node-domexception must resolve to the native DOMException shim to avoid npm deprecated warnings.');
    }
  }
}

warn(/"installCommand"\s*:\s*"[^"]*--prefer-offline/.test(read('vercel.json')), 'Vercel installCommand should use --prefer-offline to reuse cache and avoid slow online metadata checks.');
warn(/"build"\s*:\s*"npm run typecheck && npm run inspect:ci && node scripts\/next-build\.cjs"/.test(read('package.json')), 'Build script should run typecheck + inspect:ci before next build.');

for (const message of warnings) console.warn(`[inspect-ci:warn] ${message}`);
if (failures.length > 0) {
  for (const message of failures) console.error(`[inspect-ci:error] ${message}`);
  process.exit(1);
}

console.log(`[inspect-ci] OK — checked ${textFiles.length} files, ${failures.length} blocking issues.`);
