import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTempXdgEnvironment, TestXdgEnvironment, createSampleProfile } from './test-utils';
import {
  ProfileManager,
  ProfileRegistryCorruptError,
  ProfileValidationError,
  ProfileNotFoundError,
  ProfileDuplicateIdError,
  ProfileDataExistsError
} from '../src/main/profile-manager';
import { resolveProfileDataDir } from '../src/main/xdg-paths';

describe('ProfileManager & Validation', () => {
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

  it('returns empty registry when profiles.json does not exist without creating file', () => {
    const registry = manager.loadRegistry();
    expect(registry.schemaVersion).toBe(1);
    expect(registry.profiles).toEqual([]);
    expect(fs.existsSync(path.join(env.configHome, 'zaloview', 'profiles.json'))).toBe(false);
  });

  it('throws ProfileRegistryCorruptError on malformed JSON and preserves corrupted file', () => {
    const regPath = path.join(env.configHome, 'zaloview', 'profiles.json');
    fs.mkdirSync(path.dirname(regPath), { recursive: true });
    const brokenContent = '{ "schemaVersion": 1, "profiles": [ INVALID_JSON ';
    fs.writeFileSync(regPath, brokenContent, 'utf-8');

    expect(() => manager.loadRegistry()).toThrow(ProfileRegistryCorruptError);
    // Verify file was NOT wiped or replaced
    expect(fs.readFileSync(regPath, 'utf-8')).toBe(brokenContent);
  });

  it('throws ProfileRegistryCorruptError when schemaVersion is unsupported', () => {
    const regPath = path.join(env.configHome, 'zaloview', 'profiles.json');
    fs.mkdirSync(path.dirname(regPath), { recursive: true });
    fs.writeFileSync(regPath, JSON.stringify({ schemaVersion: 99, profiles: [] }), 'utf-8');

    expect(() => manager.loadRegistry()).toThrow(ProfileRegistryCorruptError);
  });

  it('creates profile with auto-generated safe slug ID from Vietnamese name', () => {
    const profile = manager.createProfile({
      name: 'Zalo Công Việc 2026',
      url: 'https://chat.zalo.me'
    });

    expect(profile.id.startsWith('zalo-cong-viec-2026')).toBe(true);
    expect(profile.name).toBe('Zalo Công Việc 2026');
    expect(profile.url).toBe('https://chat.zalo.me');
    expect(profile.createdAt).toBeDefined();
    expect(profile.updatedAt).toBeDefined();

    // Verify written to registry file
    const loaded = manager.getProfile(profile.id);
    expect(loaded).toEqual(profile);
  });

  it('prevents ID collisions by appending unique suffix if slug exists', () => {
    const p1 = manager.createProfile({ name: 'Zalo Work', url: 'https://chat.zalo.me' });
    const p2 = manager.createProfile({ name: 'Zalo Work', url: 'https://chat.zalo.me' });

    expect(p1.id).toBe('zalo-work');
    expect(p2.id.startsWith('zalo-work-')).toBe(true);
    expect(p1.id).not.toBe(p2.id);
  });

  it('rejects invalid profile IDs with path traversal attempts', () => {
    expect(() => manager.createProfile({
      id: '../hack',
      name: 'Hacked',
      url: 'https://chat.zalo.me'
    })).toThrow(ProfileValidationError);

    expect(() => manager.createProfile({
      id: 'bad/id',
      name: 'Bad ID',
      url: 'https://chat.zalo.me'
    })).toThrow(ProfileValidationError);

    expect(() => manager.createProfile({
      id: 'bad id with spaces',
      name: 'Bad ID',
      url: 'https://chat.zalo.me'
    })).toThrow(ProfileValidationError);
  });

  it('rejects invalid or unsafe URLs', () => {
    expect(() => manager.createProfile({
      name: 'FTP Test',
      url: 'ftp://files.example.com'
    })).toThrow(ProfileValidationError);

    expect(() => manager.createProfile({
      name: 'Credentials Test',
      url: 'https://user:password@chat.zalo.me'
    })).toThrow(ProfileValidationError);

    expect(() => manager.createProfile({
      name: 'JS Test',
      url: 'javascript:alert(1)'
    })).toThrow(ProfileValidationError);
  });

  it('rejects invalid poll interval or invalid mode in xpathConfig', () => {
    expect(() => manager.createProfile({
      name: 'Interval Low',
      url: 'https://chat.zalo.me',
      xpathConfig: {
        selector: '//div',
        mode: 'badge_count',
        pollIntervalMs: 500 // Min is 1000
      }
    })).toThrow(ProfileValidationError);

    expect(() => manager.createProfile({
      name: 'Interval High',
      url: 'https://chat.zalo.me',
      xpathConfig: {
        selector: '//div',
        mode: 'badge_count',
        pollIntervalMs: 100000 // Max is 60000
      }
    })).toThrow(ProfileValidationError);

    expect(() => manager.createProfile({
      name: 'Bad Mode',
      url: 'https://chat.zalo.me',
      xpathConfig: {
        selector: '//div',
        // @ts-expect-error testing invalid mode
        mode: 'unknown_mode',
        pollIntervalMs: 3000
      }
    })).toThrow(ProfileValidationError);
  });

  it('updates profile and maintains createdAt while updating updatedAt', () => {
    const profile = manager.createProfile({
      name: 'Original Name',
      url: 'https://chat.zalo.me'
    });

    const updated = manager.updateProfile(profile.id, {
      name: 'Updated Name',
      desktopConfig: {
        ...profile.desktopConfig,
        minimizeToTray: true
      }
    });

    expect(updated.id).toBe(profile.id);
    expect(updated.name).toBe('Updated Name');
    expect(updated.createdAt).toBe(profile.createdAt);
    expect(updated.desktopConfig.minimizeToTray).toBe(true);

    const reloaded = manager.getProfile(profile.id);
    expect(reloaded?.name).toBe('Updated Name');
    expect(reloaded?.desktopConfig.minimizeToTray).toBe(true);
  });

  it('throws ProfileNotFoundError when updating or deleting non-existent profile', () => {
    expect(() => manager.updateProfile('non-existent', { name: 'New' })).toThrow(ProfileNotFoundError);
    expect(() => manager.deleteProfile('non-existent')).toThrow(ProfileNotFoundError);
  });

  it('deletes profile from registry cleanly', () => {
    const profile = manager.createProfile({
      name: 'To Delete',
      url: 'https://chat.zalo.me'
    });

    expect(manager.getProfile(profile.id)).toBeDefined();
    manager.deleteProfile(profile.id);
    expect(manager.getProfile(profile.id)).toBeUndefined();
    expect(manager.loadRegistry().profiles.length).toBe(0);
  });

  it('does not reuse an ID whose profile data remains after deletion', () => {
    const profile = manager.createProfile({
      id: 'saved-session',
      name: 'Saved Session',
      url: 'https://chat.zalo.me'
    });
    const dataDir = resolveProfileDataDir(profile.id);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'session-marker'), 'keep', 'utf8');

    manager.deleteProfile(profile.id);

    expect(() => manager.createProfile({
      id: profile.id,
      name: 'Saved Session Again',
      url: 'https://chat.zalo.me'
    })).toThrow(ProfileDataExistsError);

    const recreated = manager.createProfile({
      name: 'Saved Session',
      url: 'https://chat.zalo.me'
    });
    expect(recreated.id).not.toBe(profile.id);
    expect(fs.readFileSync(path.join(dataDir, 'session-marker'), 'utf8')).toBe('keep');
  });
});
