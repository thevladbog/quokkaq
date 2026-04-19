/**
 * Ensures github.com/air-verse/air is installed into apps/backend/tmp, then runs it.
 * Used by Nx `backend:serve` so dev reload works on Windows without bash/Git Bash.
 */
const { existsSync, mkdirSync } = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const tmpDir = path.join(root, 'tmp');
const isWin = process.platform === 'win32';
const airBin = path.join(tmpDir, isWin ? 'air.exe' : 'air');

mkdirSync(tmpDir, { recursive: true });

if (!existsSync(airBin)) {
  const env = { ...process.env, GOBIN: tmpDir };
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
process.exit(run.status ?? 0);
