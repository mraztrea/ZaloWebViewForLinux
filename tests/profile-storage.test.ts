import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTempXdgEnvironment, TestXdgEnvironment } from './test-utils';
import { ProfileManager } from '../src/main/profile-manager';
import { WindowState } from '../src/shared/types';

describe('Profile Storage & Window State', () => {
  let env: TestXdgEnvironment;
  let manager: ProfileManager;

  beforeEach(() => {
    env = createTempXdgEnvironment();
    process.env.XDG_CONFIG_HOME = env.configHome;
    process.env.XDG_DATA_HOME = env.dataHome;
    process.env.XDG_RUNTIME_DIR = env.runtimeDir;
    manager = new ProfileManager();
  });

  afterEach(() => {
    env.cleanup();
  });

  it('returns default window state when window-state.json does not exist', () => {
    const state = manager.loadWindowState('acc1');
    expect(state.width).toBe(1024);
    expect(state.height).toBe(768);
    expect(state.isMaximized).toBe(false);
  });

  it('saves and loads window state independently without touching registry', () => {
    const profile = manager.createProfile({
      name: 'Test Profile',
      url: 'https://chat.zalo.me'
    });

    const newState: WindowState = {
      x: 150,
      y: 200,
      width: 1280,
      height: 800,
      isMaximized: true
    };

    manager.saveWindowState(profile.id, newState);

    const loadedState = manager.loadWindowState(profile.id);
    expect(loadedState).toEqual(newState);

    // Verify window-state.json is inside profile's data directory
    const stateFile = path.join(env.dataHome, 'zaloview', 'profiles', profile.id, 'window-state.json');
    expect(fs.existsSync(stateFile)).toBe(true);

    // Verify registry file was not modified
    const registry = manager.loadRegistry();
    expect(registry.profiles.length).toBe(1);
    expect(registry.profiles[0].id).toBe(profile.id);
    // Profile object itself does NOT contain window state
    expect((registry.profiles[0] as unknown as Record<string, unknown>).windowState).toBeUndefined();
  });

  it('falls back to default window state when window-state.json is malformed', () => {
    const profile = manager.createProfile({
      name: 'Test Profile',
      url: 'https://chat.zalo.me'
    });

    const stateFile = path.join(env.dataHome, 'zaloview', 'profiles', profile.id, 'window-state.json');
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, 'INVALID_JSON', 'utf-8');

    const state = manager.loadWindowState(profile.id);
    expect(state.width).toBe(1024);
    expect(state.height).toBe(768);
    expect(state.isMaximized).toBe(false);
  });
});
