/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-console */
import * as fs from 'node:fs';
import * as util from 'node:util';

export interface ILogger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

/**
 * A simple, centralized logger for developer-facing debug messages.
 *
 * WHY USE THIS?
 * - It makes the INTENT of the log clear (it's for developers, not users).
 * - It provides a single point of control for debug logging behavior.
 * - We can lint against direct `console.*` usage to enforce this pattern.
 *
 * HOW IT WORKS:
 * This is a thin wrapper around the native `console` object. The `ConsolePatcher`
 * will intercept these calls and route them to the debug drawer UI.
 */
class DebugLogger implements ILogger {
  private logStream: fs.WriteStream | undefined;
  private delegate: ILogger | undefined;

  constructor() {
    this.logStream = process.env['GEMINI_DEBUG_LOG_FILE']
      ? fs.createWriteStream(process.env['GEMINI_DEBUG_LOG_FILE'], {
          flags: 'a',
        })
      : undefined;
    // Handle potential errors with the stream
    this.logStream?.on('error', (err) => {
      // Log to console as a fallback, but don't crash the app
      console.error('Error writing to debug log stream:', err);
    });
  }

  /**
   * Sets a delegate logger to handle all log calls.
   * This allows integrating with robust server-side loggers (e.g. winston).
   */
  setDelegate(logger: ILogger | undefined) {
    this.delegate = logger;
  }

  private writeToFile(level: string, args: unknown[]) {
    if (this.logStream) {
      const message = util.format(...args);
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] [${level}] ${message}\n`;
      this.logStream.write(logEntry);
    }
  }

  log(...args: unknown[]): void {
    if (this.delegate) {
      this.delegate.log(...args);
    } else {
      this.writeToFile('LOG', args);
      console.log(...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.delegate) {
      this.delegate.warn(...args);
    } else {
      this.writeToFile('WARN', args);
      console.warn(...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.delegate) {
      this.delegate.error(...args);
    } else {
      this.writeToFile('ERROR', args);
      console.error(...args);
    }
  }

  debug(...args: unknown[]): void {
    if (this.delegate) {
      this.delegate.debug(...args);
    } else {
      this.writeToFile('DEBUG', args);
      console.debug(...args);
    }
  }

  /**
   * Returns a logger instance that prefixes all messages with the given name.
   */
  getLogger(name: string): ILogger {
    return {
      log: (...args: unknown[]) => this.log(`[${name}]`, ...args),
      warn: (...args: unknown[]) => this.warn(`[${name}]`, ...args),
      error: (...args: unknown[]) => this.error(`[${name}]`, ...args),
      debug: (...args: unknown[]) => this.debug(`[${name}]`, ...args),
    };
  }
}

export const debugLogger = new DebugLogger();
