/**
 * Runs `go run ./cmd/api` for local dev. Used by Nx `backend:serve`.
 * Node wrapper: frees PORT from a prior backend instance, maps SIGINT to exit 0 so Nx does not show "failed" on Ctrl+C.
 */
const path = require('path');
const { spawn, execSync } = require('child_process');

const isWin = process.platform === 'win32';

/** Only kill listeners that look like our Go/API dev server, not random processes on the port. */
function processLooksLikeBackendDevServer(argsLine) {
  if (!argsLine || typeof argsLine !== 'string') return false;
  const a = argsLine.trim();
  return (
    /\bgo\b.*\brun\b/i.test(a) ||
    /\/main(\s|$)/.test(a) ||
    /\/api(\s|$)/.test(a) ||
    /cmd\/api/.test(a) ||
    /quokkaq-go-backend/.test(a)
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
 * Frees PORT before start so a leftover listener does not block.
 * Set BACKEND_SERVE_NO_KILL_PORT=1 to skip. Windows: no-op.
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
    const out = execSync(`lsof -t -iTCP:${port} -sTCP:LISTEN 2>/dev/null`, {
      encoding: 'utf8',
    });
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
        encoding: 'utf8',
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

killStaleListenerOnPort();

const child = spawn('go', ['run', './cmd/api'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

const GRACE_MS = 12000;
let shutdownTimer = null;
/** Set when user sends SIGINT/SIGTERM to this wrapper. Go often exits with code 1 and signal=null after handling the signal, which would otherwise make Nx report failure. */
let shutdownRequestedByUser = false;

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
  if (shutdownRequestedByUser) {
    process.exit(0);
  }
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
    shutdownRequestedByUser = true;
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
