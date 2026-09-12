import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Profile, ProfileRegistry, WindowState } from '../src/shared/types';

export interface TestXdgEnvironment {
  tempRoot: string;
  configHome: string;
  dataHome: string;
  runtimeDir: string;
  cleanup: () => void;
}

export function createTempXdgEnvironment(): TestXdgEnvironment {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zaloview-test-'));
  const configHome = path.join(tempRoot, 'config');
  const dataHome = path.join(tempRoot, 'data');
  const runtimeDir = path.join(tempRoot, 'runtime');

  fs.mkdirSync(configHome, { recursive: true, mode: 0o700 });
  fs.mkdirSync(dataHome, { recursive: true, mode: 0o700 });
  fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });

  return {
    tempRoot,
    configHome,
    dataHome,
    runtimeDir,
    cleanup: () => {
      try {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  };
}

export function createSampleProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'test-profile',
    name: 'Test Profile',
    url: 'https://chat.zalo.me',
    xpathConfig: {
      selector: '',
      mode: 'badge_count',
      pollIntervalMs: 3000
    },
    desktopConfig: {
      flashTaskbar: true,
      showTaskbarBadge: true,
      minimizeToTray: false,
      showDesktopNotification: true,
      createDesktopShortcut: true
    },
    createdAt: '2026-09-12T10:00:00.000Z',
    updatedAt: '2026-09-12T10:00:00.000Z',
    ...overrides
  };
}

export function createSampleRegistry(profiles: Profile[] = [createSampleProfile()]): ProfileRegistry {
  return {
    schemaVersion: 1,
    profiles
  };
}

export function createSampleWindowState(overrides: Partial<WindowState> = {}): WindowState {
  return {
    x: 100,
    y: 100,
    width: 1024,
    height: 768,
    isMaximized: false,
    ...overrides
  };
}
