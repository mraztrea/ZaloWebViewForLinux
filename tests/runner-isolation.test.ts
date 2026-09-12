import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { createTempXdgEnvironment, TestXdgEnvironment, createSampleProfile, createSampleWindowState } from './test-utils';
import { resolveProfileDataDir } from '../src/main/xdg-paths';
import {
  buildRunnerWindowOptions,
  getChromeCompatibleUserAgent,
  getPartitionForProfile,
  isAllowedProfileNavigation
} from '../src/main/window-service';

describe('Runner Isolation & Window Options', () => {
  let env: TestXdgEnvironment;

  beforeEach(() => {
    env = createTempXdgEnvironment();
    process.env.XDG_CONFIG_HOME = env.configHome;
    process.env.XDG_DATA_HOME = env.dataHome;
  });

  afterEach(() => {
    env.cleanup();
  });

  it('allocates strictly isolated userData directories for different profiles', () => {
    const dirA = resolveProfileDataDir('acc-a');
    const dirB = resolveProfileDataDir('acc-b');

    expect(dirA).not.toBe(dirB);
    expect(dirA).toBe(path.join(env.dataHome, 'zaloview', 'profiles', 'acc-a'));
    expect(dirB).toBe(path.join(env.dataHome, 'zaloview', 'profiles', 'acc-b'));
  });

  it('generates correct persistent partition string for profiles', () => {
    expect(getPartitionForProfile('acc-a')).toBe('persist:zaloview_acc-a');
    expect(getPartitionForProfile('acc-b')).toBe('persist:zaloview_acc-b');
  });

  it('builds secure BrowserWindow options complying with specification', () => {
    const profile = createSampleProfile({ id: 'acc-1', name: 'Zalo Main', url: 'https://chat.zalo.me' });
    const windowState = createSampleWindowState({ width: 1200, height: 800, x: 50, y: 50 });

    const options = buildRunnerWindowOptions(profile, windowState, '/path/to/preload.js');

    expect(options.title).toBe('Zalo Main');
    expect(options.width).toBe(1200);
    expect(options.height).toBe(800);
    expect(options.x).toBe(50);
    expect(options.y).toBe(50);
    expect(options.autoHideMenuBar).toBe(true);

    // Verify security boundaries
    expect(options.webPreferences).toBeDefined();
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.nodeIntegration).toBe(false);
    expect(options.webPreferences?.sandbox).toBe(true);
    expect(options.webPreferences?.webSecurity).toBe(true);
    expect(options.webPreferences?.partition).toBe('persist:zaloview_acc-1');
    expect(options.webPreferences?.preload).toBe('/path/to/preload.js');
  });

  it('keeps profile and Zalo auth URLs inside the runner', () => {
    expect(isAllowedProfileNavigation('https://chat.zalo.me', 'https://chat.zalo.me/')).toBe(true);
    expect(isAllowedProfileNavigation(
      'https://chat.zalo.me',
      'https://id.zalo.me/account?continue=https%3A%2F%2Fchat.zalo.me%2F'
    )).toBe(true);
    expect(isAllowedProfileNavigation(
      'https://chat.zalo.me',
      'https://id.zalo.me/login?from=chat'
    )).toBe(true);
    expect(isAllowedProfileNavigation(
      'https://chat.zalo.me',
      'https://id.zalo.me.evil.example/account'
    )).toBe(false);
    expect(isAllowedProfileNavigation('https://chat.zalo.me', 'https://accounts.zalo.me')).toBe(false);
  });

  it('removes Electron app markers from the default user agent', () => {
    const electronUserAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ZaloWebView/0.1.0 Chrome/152.0.7977.78 Electron/44.3.0 Safari/537.36';
    const chromeUserAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.78 Safari/537.36';

    expect(getChromeCompatibleUserAgent(electronUserAgent)).toBe(chromeUserAgent);
    expect(getChromeCompatibleUserAgent(chromeUserAgent)).toBe(chromeUserAgent);
  });
});
