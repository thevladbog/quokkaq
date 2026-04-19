/**
 * Ensures github.com/air-verse/air is installed into apps/backend/bin, then runs it.
 * Used by Nx `backend:serve` so dev reload works on Windows without bash/Git Bash.
 */
const { existsSync, mkdirSync } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const binDir = path.join(root, 'bin');
const isWin = process.platform === 'win32';
const airBin = path.join(binDir, isWin ? 'air.exe' : 'air');

mkdirSync(binDir, { recursive: true });

if (!existsSync(airBin)) {
  const env = { ...process.env, GOBIN: binDir };
  const install = spawnSync('go', ['install', 'github.com/air-verse/air@v1.65.1'], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (install.error) {
    console.error(install.error);
    process.exit(1);
  }
  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }
}

const run = spawnSync(airBin, [], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
if (run.error) {
  console.error(run.error);
  process.exit(1);
}
if (run.signal) {
  process.kill(process.pid, run.signal);
  return;
}
process.exit(run.status ?? 0);
