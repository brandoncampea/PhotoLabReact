// src/utils/globalErrorHandler.ts
export function registerGlobalErrorHandler() {
  if (typeof window === 'undefined') return;
  // JS runtime errors
  window.onerror = function (message, source, lineno, colno, error) {
    fetch('/api/log-frontend-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: message,
        source,
        lineno,
        colno,
        stack: error && error.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }),
    });
  };
  // Unhandled promise rejections
  window.onunhandledrejection = function (event) {
    fetch('/api/log-frontend-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: event.reason?.message || 'Unhandled rejection',
        stack: event.reason?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }),
    });
  };
}
