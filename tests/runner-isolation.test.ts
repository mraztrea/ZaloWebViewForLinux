import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { createTempXdgEnvironment, TestXdgEnvironment, createSampleProfile, createSampleWindowState } from './test-utils';
import { resolveProfileDataDir } from '../src/main/xdg-paths';
import { buildRunnerWindowOptions, getPartitionForProfile } from '../src/main/window-service';

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
});
