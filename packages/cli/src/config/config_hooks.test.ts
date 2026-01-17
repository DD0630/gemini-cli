/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadCliConfig, parseArguments } from './config.js';
import type { Settings } from './settings.js';
import { isWorkspaceTrusted } from './trustedFolders.js';
import { ExtensionManager } from './extension-manager.js';

vi.mock('./trustedFolders.js');
vi.mock('./sandboxConfig.js', () => ({
  loadSandboxConfig: vi.fn(async () => undefined),
}));

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  return {
    ...actualFs,
    existsSync: vi.fn(() => false),
    statSync: vi.fn((p) => {
        return actualFs.statSync(p as unknown as string);
    }),
    realpathSync: vi.fn((p) => p),
  };
});

vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    homedir: vi.fn(() => path.resolve(path.sep, 'mock', 'home', 'user')),
  };
});

vi.mock('@google/gemini-cli-core', async () => {
  const actualServer = await vi.importActual<typeof import('@google/gemini-cli-core')>(
    '@google/gemini-cli-core',
  );
  return {
    ...actualServer,
    IdeClient: {
      getInstance: vi.fn().mockResolvedValue({
        getConnectionStatus: vi.fn(),
        initialize: vi.fn(),
        shutdown: vi.fn(),
      }),
    },
    loadEnvironment: vi.fn(),
    loadServerHierarchicalMemory: vi.fn(
      () => {
        return Promise.resolve({
          memoryContent: '',
          fileCount: 0,
          filePaths: [],
        });
      },
    ),
  };
});

vi.mock('./extension-manager.js');

describe('loadCliConfig hooks with trust', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
    process.argv = ['node', 'script.js'];
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should pass projectHooks when workspace is trusted', async () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'file',
    });

    const settings: Settings = {};
    const projectHooks = {
      onSessionStart: [{ command: 'echo hello' }],
    };
    const argv = await parseArguments(settings);

    // We pass projectHooks in options, simulating gemini.tsx behavior
    const config = await loadCliConfig(settings, 'test-session', argv, {
      projectHooks: projectHooks as any,
    });

    expect(config.getProjectHooks()).toEqual(projectHooks);
  });

  it('should NOT pass projectHooks when workspace is NOT trusted', async () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });

    const settings: Settings = {};
    const projectHooks = {
      onSessionStart: [{ command: 'echo hello' }],
    };
    const argv = await parseArguments(settings);

    const config = await loadCliConfig(settings, 'test-session', argv, {
      projectHooks: projectHooks as any,
    });

    // This assertion expects the fix I am about to implement
    expect(config.getProjectHooks()).toEqual({});
  });
});
