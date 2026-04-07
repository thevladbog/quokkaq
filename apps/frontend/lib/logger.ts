const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Logging helpers: log/warn are dev-only; errors always go to console.error for production visibility.
 */
export const logger = {
  log: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  }
};
