// Collects recent errors and provides a full diagnostic snapshot for support tickets.
// Call initDiagnostics() once at app startup, then getDiagnostics() when creating a ticket.

export type DiagnosticError = {
  message: string;
  stack?: string;
  source?: string;
  ts: string;
};

const MAX_ERRORS = 15;
const recentErrors: DiagnosticError[] = [];

const pushError = (err: DiagnosticError) => {
  recentErrors.push(err);
  if (recentErrors.length > MAX_ERRORS) recentErrors.shift();
};

export function initDiagnostics() {
  if (typeof window === 'undefined') return;

  // Console errors
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    pushError({
      message: args
        .map(a => {
          if (a instanceof Error) return a.message;
          if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
          return String(a);
        })
        .join(' ')
        .slice(0, 600),
      ts: new Date().toISOString(),
    });
    origError(...args);
  };

  // Unhandled JS errors (supplement globalErrorHandler)
  window.addEventListener('error', e => {
    pushError({
      message: (e.message || 'Unknown error').slice(0, 600),
      stack: e.error?.stack?.slice(0, 800),
      source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
      ts: new Date().toISOString(),
    });
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', e => {
    pushError({
      message: String(e.reason?.message || e.reason || 'Unhandled rejection').slice(0, 600),
      stack: e.reason?.stack?.slice(0, 800),
      ts: new Date().toISOString(),
    });
  });
}

const parseBrowser = (ua: string): string => {
  if (/Edg\//.test(ua)) return 'Edge ' + (ua.match(/Edg\/([\d.]+)/) || [])[1];
  if (/OPR\//.test(ua)) return 'Opera ' + (ua.match(/OPR\/([\d.]+)/) || [])[1];
  if (/Firefox\//.test(ua)) return 'Firefox ' + (ua.match(/Firefox\/([\d.]+)/) || [])[1];
  if (/Chrome\//.test(ua)) return 'Chrome ' + (ua.match(/Chrome\/([\d.]+)/) || [])[1];
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari ' + (ua.match(/Version\/([\d.]+)/) || [])[1];
  return ua.slice(0, 80);
};

const parseOS = (ua: string): string => {
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X ([\d_]+)/.test(ua)) return 'macOS ' + (ua.match(/Mac OS X ([\d_]+)/) || [])[1].replace(/_/g, '.');
  if (/Android ([\d.]+)/.test(ua)) return 'Android ' + (ua.match(/Android ([\d.]+)/) || [])[1];
  if (/iPhone OS ([\d_]+)/.test(ua)) return 'iOS ' + (ua.match(/iPhone OS ([\d_]+)/) || [])[1].replace(/_/g, '.');
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown OS';
};

export function getDiagnostics() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const nav = navigator as Navigator & Record<string, unknown>;
  const conn = nav['connection'] as Record<string, unknown> | undefined;
  const mem = (performance as Performance & Record<string, unknown>)['memory'] as Record<string, number> | undefined;

  let loadTimeMs: number | null = null;
  try {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (entry) loadTimeMs = Math.round(entry.domContentLoadedEventEnd);
  } catch {}

  return {
    page: {
      url: typeof window !== 'undefined' ? window.location.href : '',
      title: typeof document !== 'undefined' ? document.title : '',
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
    },
    browser: {
      name: parseBrowser(ua),
      os: parseOS(ua),
      userAgent: ua,
      language: navigator.language,
      online: navigator.onLine,
      screen: typeof screen !== 'undefined'
        ? { width: screen.width, height: screen.height, pixelRatio: window.devicePixelRatio }
        : null,
      viewport: typeof window !== 'undefined'
        ? { width: window.innerWidth, height: window.innerHeight }
        : null,
      connection: conn
        ? { type: String(conn['effectiveType'] || ''), downlink: Number(conn['downlink'] || 0) }
        : null,
    },
    performance: {
      loadTimeMs,
      memory: mem
        ? { usedMB: Math.round(mem['usedJSHeapSize'] / 1024 / 1024), totalMB: Math.round(mem['totalJSHeapSize'] / 1024 / 1024) }
        : null,
    },
    recentErrors: recentErrors.slice(),
    capturedAt: new Date().toISOString(),
  };
}
