import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSampleProfile, createTempXdgEnvironment, TestXdgEnvironment } from './test-utils';
import { resolveDataDir } from '../src/main/xdg-paths';
import { removeProfileShortcut, syncProfileShortcut } from '../src/main/desktop-service';
import { ProfileManager } from '../src/main/profile-manager';

describe('Desktop shortcut service', () => {
  let env: TestXdgEnvironment;
  let launcherPath: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    env = createTempXdgEnvironment();
    process.env.XDG_CONFIG_HOME = env.configHome;
    process.env.XDG_DATA_HOME = env.dataHome;
    launcherPath = path.join(env.tempRoot, 'bundle with spaces', 'zaloview');
    fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
    fs.writeFileSync(launcherPath, '#!/bin/sh\n', 'utf8');
    fs.chmodSync(launcherPath, 0o755);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    env.cleanup();
  });

  function parseExecArguments(value: string): string[] {
    let desktopDecoded = '';
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === '\\' && value[index + 1] === '\\') {
        desktopDecoded += '\\';
        index += 1;
      } else {
        desktopDecoded += value[index];
      }
    }
    const args: string[] = [];
    let current = '';
    let quoted = false;
    let escaped = false;
    for (const character of desktopDecoded) {
      if (escaped) {
        current += character;
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        quoted = !quoted;
      } else if (/\s/.test(character) && !quoted) {
        if (current) args.push(current.replaceAll('%%', '%'));
        current = '';
      } else {
        current += character;
      }
    }
    if (escaped) current += '\\';
    if (current) args.push(current.replaceAll('%%', '%'));
    return args;
  }

  it('resolves absolute, empty and relative XDG_DATA_HOME safely', () => {
    expect(resolveDataDir()).toBe(path.join(env.dataHome, 'zaloview'));

    delete process.env.XDG_DATA_HOME;
    expect(resolveDataDir()).toBe(path.join(os.homedir(), '.local', 'share', 'zaloview'));

    process.env.XDG_DATA_HOME = '';
    expect(resolveDataDir()).toBe(path.join(os.homedir(), '.local', 'share', 'zaloview'));

    process.env.XDG_DATA_HOME = 'relative-data-home';
    expect(resolveDataDir()).toBe(path.join(os.homedir(), '.local', 'share', 'zaloview'));
  });

  it('creates a fixed Desktop Entry for a Vietnamese profile name', async () => {
    const profile = createSampleProfile({ id: 'zalo-ca-nhan', name: 'Tài khoản Nguyễn' });

    const result = await syncProfileShortcut(profile, launcherPath);

    const expectedPath = path.join(env.dataHome, 'applications', 'zaloview-zalo-ca-nhan.desktop');
    expect(result).toEqual({ status: 'created', path: expectedPath });
    expect(fs.readFileSync(expectedPath, 'utf8')).toBe(
      [
        '[Desktop Entry]',
        'Version=1.5',
        'Type=Application',
        'Name=Tài khoản Nguyễn',
        `Exec="${launcherPath}" --profile "zalo-ca-nhan"`,
        'Icon=applications-internet',
        'Terminal=false',
        'Categories=Network;',
        'StartupWMClass=zaloview-zalo-ca-nhan',
        'X-ZaloWebView-ProfileId=zalo-ca-nhan',
        ''
      ].join('\n')
    );
    expect(fs.statSync(expectedPath).mode & 0o777).toBe(0o644);
    if (fs.existsSync('/usr/bin/desktop-file-validate')) {
      execFileSync('/usr/bin/desktop-file-validate', [expectedPath], { stdio: 'pipe' });
    }
  });

  it('encodes special launcher characters as independent Exec arguments', async () => {
    const specialLauncher = path.join(env.tempRoot, 'bundle "space" $cash`tick`\\percent%', 'zaloview');
    fs.mkdirSync(path.dirname(specialLauncher), { recursive: true });
    fs.writeFileSync(specialLauncher, '#!/bin/sh\n', 'utf8');
    fs.chmodSync(specialLauncher, 0o755);
    const profile = createSampleProfile({ id: 'special-profile', name: 'Tên \\ đặc biệt' });

    const result = await syncProfileShortcut(profile, specialLauncher);
    const execLine = fs.readFileSync(result.path, 'utf8').split('\n').find((line) => line.startsWith('Exec='));
    expect(execLine).toBeDefined();
    expect(parseExecArguments(execLine!.slice('Exec='.length))).toEqual([
      specialLauncher,
      '--profile',
      profile.id
    ]);
    expect(execLine).toContain('%%');
    if (fs.existsSync('/usr/bin/desktop-file-validate')) {
      execFileSync('/usr/bin/desktop-file-validate', [result.path], { stdio: 'inherit' });
    }
  });

  it('keeps shortcut lifecycle idempotent and preserves other files', async () => {
    const profile = createSampleProfile({ id: 'lifecycle-profile', name: 'Ban đầu' });
    const other = createSampleProfile({ id: 'other-profile', name: 'Profile khác' });

    expect((await syncProfileShortcut(profile, launcherPath)).status).toBe('created');
    expect((await syncProfileShortcut(profile, launcherPath)).status).toBe('unchanged');

    const iconPath = path.join(env.dataHome, 'zaloview', 'icons', 'profile.png');
    fs.mkdirSync(path.dirname(iconPath), { recursive: true });
    fs.writeFileSync(iconPath, 'icon');
    const updated = await syncProfileShortcut(
      { ...profile, name: 'Đã đổi tên', iconPath },
      launcherPath
    );
    expect(updated.status).toBe('updated');
    expect(fs.readFileSync(updated.path, 'utf8')).toContain('Name=Đã đổi tên');
    expect(fs.readFileSync(updated.path, 'utf8')).toContain(`Icon=${iconPath}`);

    expect((await syncProfileShortcut(other, launcherPath)).status).toBe('created');
    const otherPath = path.join(env.dataHome, 'applications', 'zaloview-other-profile.desktop');
    const foreignPath = path.join(env.dataHome, 'applications', 'other.desktop');
    fs.writeFileSync(foreignPath, 'owned by another application\n');

    const disabled = { ...profile, desktopConfig: { ...profile.desktopConfig, createDesktopShortcut: false } };
    expect((await syncProfileShortcut(disabled, launcherPath)).status).toBe('removed');
    expect((await removeProfileShortcut(profile.id)).status).toBe('unchanged');
    expect(fs.existsSync(otherPath)).toBe(true);
    expect(fs.readFileSync(foreignPath, 'utf8')).toBe('owned by another application\n');
  });

  it('rejects collisions, symlinks, traversal IDs and invalid launchers without changing files', async () => {
    const profile = createSampleProfile({ id: 'collision-profile' });
    const targetPath = path.join(env.dataHome, 'applications', 'zaloview-collision-profile.desktop');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, '[Desktop Entry]\nName=other\n');

    const collision = await syncProfileShortcut(profile, launcherPath);
    expect(collision.status).toBe('error');
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('[Desktop Entry]\nName=other\n');
    expect((await removeProfileShortcut(profile.id)).status).toBe('error');

    fs.unlinkSync(targetPath);
    const victimPath = path.join(env.tempRoot, 'victim.desktop');
    fs.writeFileSync(victimPath, 'do not remove');
    fs.symlinkSync(victimPath, targetPath);
    expect((await syncProfileShortcut(profile, launcherPath)).status).toBe('error');
    expect((await removeProfileShortcut(profile.id)).status).toBe('error');
    expect(fs.existsSync(victimPath)).toBe(true);

    await expect(syncProfileShortcut({ ...profile, id: '../escape' } as never, launcherPath)).rejects.toThrow();
    await expect(removeProfileShortcut('../escape')).rejects.toThrow();

    await expect(syncProfileShortcut(profile, path.join(env.tempRoot, 'missing'))).rejects.toThrow();
    const nonExecutable = path.join(env.tempRoot, 'not-executable');
    fs.writeFileSync(nonExecutable, 'no');
    fs.chmodSync(nonExecutable, 0o644);
    await expect(syncProfileShortcut(profile, nonExecutable)).rejects.toThrow();
  });

  it('uses fallback icon for missing or unmanaged icon and keeps registry mode private', async () => {
    const outsideIcon = path.join(env.tempRoot, 'outside.png');
    fs.writeFileSync(outsideIcon, 'outside');
    const profile = createSampleProfile({ id: 'fallback-icon', iconPath: outsideIcon });
    const result = await syncProfileShortcut(profile, launcherPath);
    expect(result.status).toBe('created');
    expect(fs.readFileSync(result.path, 'utf8')).toContain('Icon=applications-internet');

    const iconRoot = path.join(env.dataHome, 'zaloview', 'icons');
    fs.mkdirSync(iconRoot, { recursive: true });
    fs.symlinkSync(env.tempRoot, path.join(iconRoot, 'external'));
    const escapedIcon = path.join(iconRoot, 'external', 'outside.png');
    const escapedResult = await syncProfileShortcut({ ...profile, id: 'fallback-link', iconPath: escapedIcon }, launcherPath);
    expect(fs.readFileSync(escapedResult.path, 'utf8')).toContain('Icon=applications-internet');

    const manager = new ProfileManager();
    manager.createProfile({ name: 'Registry profile', url: 'https://example.com' });
    const registryPath = path.join(env.configHome, 'zaloview', 'profiles.json');
    expect(fs.statSync(registryPath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(result.path).mode & 0o777).toBe(0o644);
  });

  it('rejects control characters before creating the applications directory', async () => {
    const profile = createSampleProfile({ id: 'control-name', name: 'bad\nname' });
    await expect(syncProfileShortcut(profile, launcherPath)).rejects.toThrow(/điều khiển/);
    expect(fs.existsSync(path.join(env.dataHome, 'applications'))).toBe(false);
  });

  it('returns an error on a write failure and leaves the previous entry readable for retry', async () => {
    const profile = createSampleProfile({ id: 'retry-profile', name: 'Version 1' });
    await syncProfileShortcut(profile, launcherPath);
    const targetPath = path.join(env.dataHome, 'applications', 'zaloview-retry-profile.desktop');
    const previous = fs.readFileSync(targetPath, 'utf8');
    const atomicWriter = await import('../src/main/atomic-writer.js');
    const writeSpy = vi.spyOn(atomicWriter, 'atomicWriteFile').mockImplementationOnce(() => {
      throw new Error('simulated write failure');
    });

    const failed = await syncProfileShortcut({ ...profile, name: 'Version 2' }, launcherPath);
    expect(failed).toMatchObject({ status: 'error', path: targetPath });
    expect(fs.readFileSync(targetPath, 'utf8')).toBe(previous);
    writeSpy.mockRestore();

    expect((await syncProfileShortcut({ ...profile, name: 'Version 2' }, launcherPath)).status).toBe('updated');
  });

  it('keeps the old entry when rename fails and does not duplicate a saved profile', async () => {
    const manager = new ProfileManager();
    const profile = manager.createProfile({ name: 'Saved once', url: 'https://example.com' });
    const targetPath = path.join(env.dataHome, 'applications', `zaloview-${profile.id}.desktop`);
    await syncProfileShortcut(profile, launcherPath);
    const previous = fs.readFileSync(targetPath, 'utf8');
    const atomicWriter = await import('../src/main/atomic-writer.js');
    const renameSpy = vi.spyOn(atomicWriter, 'atomicWriteFile').mockImplementationOnce(() => {
      throw new Error('simulated rename failure');
    });

    const failed = await syncProfileShortcut({ ...profile, name: 'Changed' }, launcherPath);
    expect(failed).toMatchObject({ status: 'error', path: targetPath });
    expect(fs.readFileSync(targetPath, 'utf8')).toBe(previous);
    renameSpy.mockRestore();

    expect(manager.loadRegistry().profiles).toHaveLength(1);
    expect((await syncProfileShortcut({ ...profile, name: 'Changed' }, launcherPath)).status).toBe('updated');
    expect(manager.loadRegistry().profiles).toHaveLength(1);
  });
});
