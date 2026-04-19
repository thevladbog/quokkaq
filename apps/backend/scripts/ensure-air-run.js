/**
 * Ensures github.com/air-verse/air is installed into apps/backend/bin, then runs it.
 * Used by Nx `backend:serve` so dev reload works on Windows without bash/Git Bash.
 */
const { existsSync, mkdirSync } = require('fs');
const path = require('path');
const { spawnSync, spawn, execSync } = require('child_process');

/**
 * Frees PORT before Air starts so a leftover `main` from a crashed/stopped session
 * does not block the new listener. Set BACKEND_SERVE_NO_KILL_PORT=1 to skip.
 * Windows: no-op (use Task Manager / netstat if needed).
 */
function killStaleListenerOnPort() {
  if (isWin || process.env.BACKEND_SERVE_NO_KILL_PORT === '1') {
    return;
  }
  const port = (process.env.PORT || '3001').trim();
  if (!/^\d{1,5}$/.test(port)) {
    return;
  }
  try {
    execSync(
      `/bin/sh -c 'for pid in $(lsof -t -iTCP:${port} -sTCP:LISTEN 2>/dev/null); do kill -9 "$pid" 2>/dev/null; done'`,
      { stdio: 'ignore' }
    );
  } catch {
    /* no listener or lsof missing */
  }
}

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

killStaleListenerOnPort();

// Use spawn (not spawnSync) so we can handle SIGINT/SIGTERM: with spawnSync, Node often
// exits with 130 before we map the child's exit code — Nx then shows "failed".
const child = spawn(airBin, [], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (err) => {
  console.error(err);
  process.exit(1);
});

function mapChildExitToNx(code, signal) {
  if (signal === 'SIGINT' || signal === 'SIGTERM') {
    process.exit(0);
  }
  const st = code ?? 0;
  if (st === 130 || st === 143) {
    process.exit(0);
  }
  process.exit(st);
}

child.on('exit', (code, signal) => {
  mapChildExitToNx(code, signal);
});

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    try {
      if (child.pid && !child.killed) {
        child.kill(sig);
      } else {
        process.exit(0);
      }
    } catch {
      process.exit(0);
    }
  });
});
