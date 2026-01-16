/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { debugLogger } from './debugLogger.js';

describe('DebugLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call console.log with the correct arguments', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const message = 'This is a log message';
    const data = { key: 'value' };
    debugLogger.log(message, data);
    expect(spy).toHaveBeenCalledWith(message, data);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should call console.warn with the correct arguments', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const message = 'This is a warning message';
    const data = [1, 2, 3];
    debugLogger.warn(message, data);
    expect(spy).toHaveBeenCalledWith(message, data);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should call console.error with the correct arguments', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const message = 'This is an error message';
    const error = new Error('Something went wrong');
    debugLogger.error(message, error);
    expect(spy).toHaveBeenCalledWith(message, error);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should call console.debug with the correct arguments', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const message = 'This is a debug message';
    const obj = { a: { b: 'c' } };
    debugLogger.debug(message, obj);
    expect(spy).toHaveBeenCalledWith(message, obj);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple arguments correctly for all methods', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    debugLogger.log('one', 2, true);
    expect(logSpy).toHaveBeenCalledWith('one', 2, true);

    debugLogger.warn('one', 2, false);
    expect(warnSpy).toHaveBeenCalledWith('one', 2, false);

    debugLogger.error('one', 2, null);
    expect(errorSpy).toHaveBeenCalledWith('one', 2, null);

    debugLogger.debug('one', 2, undefined);
    expect(debugSpy).toHaveBeenCalledWith('one', 2, undefined);
  });

  it('should handle calls with no arguments', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    debugLogger.log();
    expect(logSpy).toHaveBeenCalledWith();
    expect(logSpy).toHaveBeenCalledTimes(1);

    debugLogger.warn();
    expect(warnSpy).toHaveBeenCalledWith();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('should delegate calls when a delegate is set', () => {
    const delegate = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    debugLogger.setDelegate(delegate);

    debugLogger.log('log msg');
    expect(delegate.log).toHaveBeenCalledWith('log msg');

    debugLogger.warn('warn msg');
    expect(delegate.warn).toHaveBeenCalledWith('warn msg');

    debugLogger.error('error msg');
    expect(delegate.error).toHaveBeenCalledWith('error msg');

    debugLogger.debug('debug msg');
    expect(delegate.debug).toHaveBeenCalledWith('debug msg');

    // Reset delegate for other tests (although afterEach restores mocks, global state like singleton instance persists)
    // The previous tests mock console methods, so they check fallback behavior.
    // If I leave delegate set, fallback won't be called.
    debugLogger.setDelegate(undefined);
  });

  it('should prefix messages when using getLogger', () => {
    debugLogger.setDelegate(undefined); // Ensure no delegate

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const logger = debugLogger.getLogger('MyComponent');
    logger.debug('hello');

    expect(debugSpy).toHaveBeenCalledWith('[MyComponent]', 'hello');
  });

  it('should prefix messages and delegate when using getLogger with delegate', () => {
    const delegate = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    debugLogger.setDelegate(delegate);

    const logger = debugLogger.getLogger('MyComponent');
    logger.debug('hello');

    expect(delegate.debug).toHaveBeenCalledWith('[MyComponent]', 'hello');

    // Clean up
    debugLogger.setDelegate(undefined);
  });
});
