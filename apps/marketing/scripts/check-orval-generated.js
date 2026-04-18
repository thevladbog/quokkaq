#!/usr/bin/env node
/**
 * After Orval runs, verify `lib/api/generated/` has no untracked files and no
 * diff vs the index — same checks as the former bash one-liner, without
 * bash-specific syntax (Windows-friendly when git is on PATH).
 */
const { spawnSync } = require('child_process');

const GENERATED = 'lib/api/generated';

function git(args) {
  return spawnSync('git', args, {
    encoding: 'utf8',
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024
  });
}

const untracked = git([
  'ls-files',
  '--others',
  '--exclude-standard',
  '--',
  GENERATED
]);

if (untracked.error) {
  console.error(untracked.error.message);
  process.exit(1);
}

if (untracked.status !== 0 && untracked.status !== null) {
  console.error(
    untracked.stderr?.trim() ||
      `git ls-files failed with status ${untracked.status}`
  );
  process.exit(1);
}

const untrackedList = untracked.stdout.trim();
if (untrackedList) {
  console.error(
    'Untracked files under lib/api/generated/ (run from apps/marketing or commit generated output):'
  );
  console.error(untrackedList);
  process.exit(1);
}

const diff = git(['diff', '--quiet', '--exit-code', '--', GENERATED]);

if (diff.error) {
  console.error(diff.error.message);
  process.exit(1);
}

if (diff.status === 1) {
  console.error(
    'Generated Orval output under lib/api/generated/ does not match git. Regenerate with `pnpm --dir apps/marketing run orval` or `pnpm nx run marketing:orval`, then commit.'
  );
  process.exit(1);
}

if (diff.status !== 0) {
  console.error(diff.stderr || 'git diff failed');
  process.exit(diff.status ?? 1);
}

process.exit(0);
