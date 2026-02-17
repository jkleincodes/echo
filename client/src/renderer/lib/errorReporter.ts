import { getServerUrl } from './serverUrl';

interface ErrorEntry {
  timestamp: string;
  username: string | null;
  userId: string | null;
  appVersion: string;
  os: string;
  type: string;
  message: string;
  stack: string | null;
  source: string | null;
  line: number | null;
  col: number | null;
  url: string | null;
  extra: string | null;
}

const queue: ErrorEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 5000;
const MAX_QUEUE = 100;

function getOS(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Win')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  return ua;
}

function getAppVersion(): string {
  return __APP_VERSION__;
}

function getUserInfo(): { username: string | null; userId: string | null } {
  try {
    // Read from zustand persisted state or localStorage
    const raw = localStorage.getItem('auth-storage');
    if (raw) {
      const parsed = JSON.parse(raw);
      const user = parsed?.state?.user;
      if (user) return { username: user.username || null, userId: user.id || null };
    }
  } catch {}
  return { username: null, userId: null };
}

function enqueue(entry: Partial<ErrorEntry>) {
  const { username, userId } = getUserInfo();
  queue.push({
    timestamp: new Date().toISOString(),
    username,
    userId,
    appVersion: getAppVersion(),
    os: getOS(),
    type: entry.type || 'error',
    message: entry.message || 'Unknown error',
    stack: entry.stack || null,
    source: entry.source || null,
    line: entry.line || null,
    col: entry.col || null,
    url: entry.url || null,
    extra: entry.extra || null,
  });

  if (queue.length >= MAX_QUEUE) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_INTERVAL);
  }
}

async function flush() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;

  const batch = queue.splice(0, 50);
  try {
    await fetch(`${getServerUrl()}/api/client-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errors: batch }),
    });
  } catch {
    // If send fails, put them back (but don't exceed max)
    queue.unshift(...batch.slice(0, MAX_QUEUE - queue.length));
  }
}

export function initErrorReporter() {
  const os = getOS();
  const version = getAppVersion();

  // Global JS errors
  window.onerror = (message, source, line, col, error) => {
    enqueue({
      type: 'onerror',
      message: String(message),
      stack: error?.stack || null,
      source: source || null,
      line: line || null,
      col: col || null,
    });
  };

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    enqueue({
      type: 'unhandledrejection',
      message: reason?.message || String(reason),
      stack: reason?.stack || null,
    });
  });

  // Intercept console.error to catch React/library errors
  const origConsoleError = console.error;
  console.error = (...args: any[]) => {
    origConsoleError.apply(console, args);
    try {
      const msg = args.map(a => {
        if (a instanceof Error) return `${a.message}\n${a.stack}`;
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      }).join(' ');

      enqueue({
        type: 'console.error',
        message: msg.slice(0, 4000),
        stack: args.find(a => a instanceof Error)?.stack || null,
      });
    } catch {}
  };

  // Intercept console.warn for warnings (useful for debugging)
  const origConsoleWarn = console.warn;
  console.warn = (...args: any[]) => {
    origConsoleWarn.apply(console, args);
    try {
      const msg = args.map(a => {
        if (a instanceof Error) return `${a.message}\n${a.stack}`;
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      }).join(' ');

      enqueue({
        type: 'console.warn',
        message: msg.slice(0, 4000),
        stack: args.find(a => a instanceof Error)?.stack || null,
      });
    } catch {}
  };

  // Flush on page unload
  window.addEventListener('beforeunload', () => {
    flush();
  });

  // Log startup
  enqueue({
    type: 'info',
    message: `Client started: ${os}, v${version}`,
  });
}
