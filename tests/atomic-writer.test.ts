import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTempXdgEnvironment, TestXdgEnvironment } from './test-utils';
import { atomicWriteFile } from '../src/main/atomic-writer';
import { resolveConfigDir, resolveDataDir, resolveRegistryPath, resolveProfileDataDir, resolveWindowStatePath, resolveSocketPath } from '../src/main/xdg-paths';

describe('Atomic Writer & XDG Paths', () => {
  let env: TestXdgEnvironment;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    env = createTempXdgEnvironment();
    process.env.XDG_CONFIG_HOME = env.configHome;
    process.env.XDG_DATA_HOME = env.dataHome;
    process.env.XDG_RUNTIME_DIR = env.runtimeDir;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    env.cleanup();
  });

  it('resolves XDG paths correctly when environment variables are set', () => {
    expect(resolveConfigDir()).toBe(path.join(env.configHome, 'zaloview'));
    expect(resolveDataDir()).toBe(path.join(env.dataHome, 'zaloview'));
    expect(resolveRegistryPath()).toBe(path.join(env.configHome, 'zaloview', 'profiles.json'));
    expect(resolveProfileDataDir('acc1')).toBe(path.join(env.dataHome, 'zaloview', 'profiles', 'acc1'));
    expect(resolveWindowStatePath('acc1')).toBe(path.join(env.dataHome, 'zaloview', 'profiles', 'acc1', 'window-state.json'));
    expect(resolveSocketPath('acc1')).toBe(path.join(env.runtimeDir, 'zaloview', 'acc1.sock'));
  });

  it('falls back to default paths when XDG variables are relative or unset', () => {
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_DATA_HOME;
    delete process.env.XDG_RUNTIME_DIR;

    const configDir = resolveConfigDir();
    const dataDir = resolveDataDir();
    expect(path.isAbsolute(configDir)).toBe(true);
    expect(configDir.endsWith(path.join('.config', 'zaloview'))).toBe(true);
    expect(dataDir.endsWith(path.join('.local', 'share', 'zaloview'))).toBe(true);
  });

  it('writes content atomically to a file', () => {
    const target = path.join(env.configHome, 'test.txt');
    atomicWriteFile(target, 'hello world');

    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('hello world');
  });

  it('overwrites existing file cleanly without leaving tmp files', () => {
    const target = path.join(env.configHome, 'test.txt');
    atomicWriteFile(target, 'v1');
    expect(fs.readFileSync(target, 'utf-8')).toBe('v1');

    atomicWriteFile(target, 'v2');
    expect(fs.readFileSync(target, 'utf-8')).toBe('v2');

    const files = fs.readdirSync(env.configHome);
    expect(files).toEqual(['test.txt']);
  });

  it('supports desktop entry permissions without changing the private default', () => {
    const privateTarget = path.join(env.configHome, 'private.json');
    const desktopTarget = path.join(env.configHome, 'zaloview-test.desktop');

    atomicWriteFile(privateTarget, '{}');
    atomicWriteFile(desktopTarget, '[Desktop Entry]\n', 0o644);

    expect(fs.statSync(privateTarget).mode & 0o777).toBe(0o600);
    expect(fs.statSync(desktopTarget).mode & 0o777).toBe(0o644);
  });
});
