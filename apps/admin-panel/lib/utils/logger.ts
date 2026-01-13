/**
 * Centralized logging utility
 * In production, logs can be sent to a logging service
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
  error: (message: string, error?: any, context?: Record<string, any>) => {
    if (isDevelopment) {
      console.error(`[ERROR] ${message}`, error || '', context || '');
    }
    // In production, send to logging service (e.g., Sentry, LogRocket)
  },
  
  warn: (message: string, context?: Record<string, any>) => {
    if (isDevelopment) {
      console.warn(`[WARN] ${message}`, context || '');
    }
  },
  
  info: (message: string, context?: Record<string, any>) => {
    if (isDevelopment) {
      console.log(`[INFO] ${message}`, context || '');
    }
  },
  
  debug: (message: string, context?: Record<string, any>) => {
    if (isDevelopment) {
      console.log(`[DEBUG] ${message}`, context || '');
    }
  },
};
