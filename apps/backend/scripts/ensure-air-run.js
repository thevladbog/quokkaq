/**
 * Ensures github.com/air-verse/air is installed into apps/backend/bin, then runs it.
 * Used by Nx `backend:serve` so dev reload works on Windows without bash/Git Bash.
 */
const { existsSync, mkdirSync } = require('fs');
const path = require('path');
const { spawnSync, spawn, execSync } = require('child_process');

const isWin = process.platform === 'win32';

/** Only kill listeners that look like our Go/API dev server or air, not random processes on the port. */
function processLooksLikeBackendDevServer(argsLine) {
  if (!argsLine || typeof argsLine !== 'string') return false;
  const a = argsLine.trim();
  return (
    /\bair\b/i.test(a) ||
    /\/main(\s|$)/.test(a) ||
    /\/api(\s|$)/.test(a) ||
    /quokkaq-go-backend/.test(a) ||
    /tmp\/air\b/.test(a)
  );
}

function pidStillAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleepMs(ms) {
  if (isWin) {
    return;
  }
  const sec = Math.max(ms / 1000, 0.05);
  try {
    execSync(`sleep ${sec}`, { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
}

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
  let pids = [];
  try {
    const out = execSync(
      `lsof -t -iTCP:${port} -sTCP:LISTEN 2>/dev/null`,
      { encoding: 'utf8' }
    );
    pids = out
      .split(/\s+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return;
  }
  for (const pid of [...new Set(pids)]) {
    let argsLine = '';
    try {
      argsLine = execSync(`ps -p ${pid} -o args= 2>/dev/null`, {
        encoding: 'utf8'
      });
    } catch {
      continue;
    }
    if (!processLooksLikeBackendDevServer(argsLine)) {
      continue;
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* ignore */
    }
    sleepMs(400);
    if (pidStillAlive(pid)) {
      sleepMs(400);
    }
    if (pidStillAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }
}

const root = path.resolve(__dirname, '..');
const binDir = path.join(root, 'bin');
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

const GRACE_MS = 12000;
let shutdownTimer = null;

function clearShutdownTimer() {
  if (shutdownTimer !== null) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
}

child.on('error', (err) => {
  clearShutdownTimer();
  console.error(err);
  process.exit(1);
});

function mapChildExitToNx(code, signal) {
  clearShutdownTimer();
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
        clearShutdownTimer();
        shutdownTimer = setTimeout(() => {
          shutdownTimer = null;
          try {
            if (child.pid && !child.killed) {
              child.kill('SIGKILL');
            }
          } catch {
            process.exit(1);
          }
        }, GRACE_MS);
      } else {
        process.exit(0);
      }
    } catch {
      process.exit(0);
    }
  });
});
