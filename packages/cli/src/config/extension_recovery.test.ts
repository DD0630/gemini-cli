
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
} from '@google/gemini-cli-core';
import { loadSettings } from './settings.js';
import {
  isWorkspaceTrusted,
  resetTrustedFoldersForTesting,
} from './trustedFolders.js';
import { createExtension } from '../test-utils/createExtension.js';
import { EXTENSIONS_DIRECTORY_NAME } from './extensions/variables.js';
import { ExtensionManager } from './extension-manager.js';

const mockGit = {
  clone: vi.fn(),
  getRemotes: vi.fn(),
  fetch: vi.fn(),
  checkout: vi.fn(),
  listRemote: vi.fn(),
  revparse: vi.fn(),
  path: vi.fn(),
};

const mockDownloadFromGithubRelease = vi.hoisted(() => vi.fn());

vi.mock('./extensions/github.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('./extensions/github.js')>();
  return {
    ...original,
    downloadFromGitHubRelease: mockDownloadFromGithubRelease,
  };
});

vi.mock('simple-git', () => ({
  simpleGit: vi.fn((path: string) => {
    mockGit.path.mockReturnValue(path);
    return mockGit;
  }),
}));

const mockHomedir = vi.hoisted(() => vi.fn(() => '/tmp/mock-home'));

vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof os>();
  return {
    ...mockedOs,
    homedir: mockHomedir,
  };
});

vi.mock('./trustedFolders.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./trustedFolders.js')>();
  return {
    ...actual,
    isWorkspaceTrusted: vi.fn(),
  };
});

const mockLogExtensionEnable = vi.hoisted(() => vi.fn());
const mockLogExtensionInstallEvent = vi.hoisted(() => vi.fn());
const mockLogExtensionUninstall = vi.hoisted(() => vi.fn());
const mockLogExtensionUpdateEvent = vi.hoisted(() => vi.fn());
const mockLogExtensionDisable = vi.hoisted(() => vi.fn());
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    logExtensionEnable: mockLogExtensionEnable,
    logExtensionInstallEvent: mockLogExtensionInstallEvent,
    logExtensionUninstall: mockLogExtensionUninstall,
    logExtensionUpdateEvent: mockLogExtensionUpdateEvent,
    logExtensionDisable: mockLogExtensionDisable,
    ExtensionEnableEvent: vi.fn(),
    ExtensionInstallEvent: vi.fn(),
    ExtensionUninstallEvent: vi.fn(),
    ExtensionDisableEvent: vi.fn(),
    KeychainTokenStorage: vi.fn().mockImplementation(() => ({
      getSecret: vi.fn(),
      setSecret: vi.fn(),
      deleteSecret: vi.fn(),
      listSecrets: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    })),
  };
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

describe('Extension Update Failure Recovery', () => {
  let tempHomeDir: string;
  let tempWorkspaceDir: string;
  let userExtensionsDir: string;
  let extensionManager: ExtensionManager;
  let mockRequestConsent: any;
  let mockPromptForSettings: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(tempHomeDir, 'gemini-cli-test-workspace-'),
    );
    userExtensionsDir = path.join(tempHomeDir, EXTENSIONS_DIRECTORY_NAME);
    mockRequestConsent = vi.fn();
    mockRequestConsent.mockResolvedValue(true);
    mockPromptForSettings = vi.fn();
    mockPromptForSettings.mockResolvedValue('');
    fs.mkdirSync(userExtensionsDir, { recursive: true });
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: undefined,
    });
    vi.spyOn(process, 'cwd').mockReturnValue(tempWorkspaceDir);
    extensionManager = new ExtensionManager({
      workspaceDir: tempWorkspaceDir,
      requestConsent: mockRequestConsent,
      requestSetting: mockPromptForSettings,
      settings: loadSettings(tempWorkspaceDir).merged,
    });
    resetTrustedFoldersForTesting();
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should restore the previous extension version if the new version fails to load', async () => {
    // 1. Install version 1.0.0
    const sourceExtDirV1 = createExtension({
      extensionsDir: tempHomeDir,
      name: 'my-extension',
      version: '1.0.0',
    });
    // Add a file to identify v1
    fs.writeFileSync(path.join(sourceExtDirV1, 'v1.txt'), 'version 1');

    await extensionManager.loadExtensions();
    await extensionManager.installOrUpdateExtension({
      source: sourceExtDirV1,
      type: 'local',
    });

    const extensionV1 = extensionManager.getExtensions().find(e => e.name === 'my-extension');
    expect(extensionV1).toBeDefined();
    expect(extensionV1!.version).toBe('1.0.0');
    expect(fs.existsSync(path.join(extensionV1!.path, 'v1.txt'))).toBe(true);

    // 2. Prepare version 2.0.0
    const sourceExtDirV2 = createExtension({
      extensionsDir: tempHomeDir,
      name: 'my-extension',
      version: '2.0.0',
    });
     // Add a file to identify v2
    fs.writeFileSync(path.join(sourceExtDirV2, 'v2.txt'), 'version 2');

    // 3. Mock loadExtension to fail on the second call (which corresponds to loading v2)
    // We access the private method via casting to any
    const originalLoadExtension = (extensionManager as any).loadExtension.bind(extensionManager);

    vi.spyOn(extensionManager as any, 'loadExtension').mockImplementation(async (dir: any) => {
      // Check if this is the loading of the installed extension (v2)
      // The path will be in userExtensionsDir/my-extension
      if (dir.includes(path.join(userExtensionsDir, 'my-extension'))) {
         // We can distinguish v1 from v2 by checking the files in the directory
         if (fs.existsSync(path.join(dir, 'v2.txt'))) {
             // This is v2, simulate failure!
             console.log("Simulating loadExtension failure for v2");
             return null;
         }
      }
      return originalLoadExtension(dir);
    });

    // 4. Attempt update
    const previousConfig = await extensionManager.loadExtensionConfig(extensionV1!.path);

    await expect(extensionManager.installOrUpdateExtension(
      { source: sourceExtDirV2, type: 'local' },
      previousConfig
    )).rejects.toThrow();

    // 5. Verify v1 is restored
    // We need to reload extensions to see what is on disk
    // But since extensionManager might have stale state, we check the disk first.

    const installedExtPath = path.join(userExtensionsDir, 'my-extension');
    expect(fs.existsSync(installedExtPath)).toBe(true);
    expect(fs.existsSync(path.join(installedExtPath, 'v1.txt'))).toBe(true);
    expect(fs.existsSync(path.join(installedExtPath, 'v2.txt'))).toBe(false);

    // Also verify the manager state if possible (though in a real run we might need to reload)
    // The current implementation of uninstallExtension updates the in-memory list.
    // So if restore is implemented, it should also ideally update the in-memory list or at least leave the disk correct.

  });
});
