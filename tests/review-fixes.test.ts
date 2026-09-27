import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn((_url: string) => Promise.resolve()) }));
vi.mock('electron', () => ({
  shell: { openExternal },
  BrowserWindow: class {},
  screen: {}
}));

import { createSampleProfile, createTempXdgEnvironment, TestXdgEnvironment } from './test-utils';
import { PermissionManager } from '../src/main/permission-manager';
import { attachNavigationGuard, openExternalSafe, requestProfilePermission } from '../src/main/window-service';
import { resolvePermissionsPath } from '../src/main/xdg-paths';
import { ProfileManager } from '../src/main/profile-manager';
import { ManagerService } from '../src/main/manager-handlers';

describe('Quyền camera/micro hỏi người dùng', () => {
  let env: TestXdgEnvironment;
  const profile = createSampleProfile();
  const origin = new URL(profile.url).origin;

  beforeEach(() => {
    env = createTempXdgEnvironment();
    process.env.XDG_DATA_HOME = env.dataHome;
  });
  afterEach(() => env.cleanup());

  it('hỏi khi chưa có quyết định và lưu khi chọn ghi nhớ', async () => {
    const pm = new PermissionManager('p1');
    const confirm = vi.fn(async () => ({ granted: true, remember: true }));
    await expect(requestProfilePermission(profile, 'media', origin, pm, confirm)).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);

    // Lần sau dùng quyết định đã lưu, không hỏi lại (kể cả sau khi nạp lại từ đĩa).
    const reloaded = new PermissionManager('p1');
    await expect(requestProfilePermission(profile, 'media', origin, reloaded, confirm)).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('không ghi nhớ thì không lưu; thiếu prompt thì mặc định từ chối', async () => {
    const pm = new PermissionManager('p2');
    const confirm = vi.fn(async () => ({ granted: false, remember: false }));
    await expect(requestProfilePermission(profile, 'media', origin, pm, confirm)).resolves.toBe(false);
    expect(pm.getPermission(origin, 'media')).toBeUndefined();
    await expect(requestProfilePermission(profile, 'media', origin, pm)).resolves.toBe(false);
  });

  it('không hỏi cho quyền khác media', async () => {
    const pm = new PermissionManager('p3');
    const confirm = vi.fn(async () => ({ granted: true, remember: true }));
    await expect(requestProfilePermission(profile, 'geolocation', origin, pm, confirm)).resolves.toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('bỏ qua permissions.json sai cấu trúc thay vì ném lỗi', () => {
    for (const content of ['null', '[]', '{"https://a.vn": 5}']) {
      const file = resolvePermissionsPath('bad');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      const pm = new PermissionManager('bad');
      expect(() => pm.isPermissionGranted('https://a.vn', 'media')).not.toThrow();
      expect(pm.isPermissionGranted('https://a.vn', 'media')).toBe(false);
    }
  });
});

describe('Guard liên kết ngoài', () => {
  beforeEach(() => openExternal.mockClear());

  it('chỉ mở http/https/mailto bằng trình duyệt hệ thống', () => {
    openExternalSafe('file:///etc/passwd');
    openExternalSafe('smb://host/share');
    openExternalSafe('not a url');
    expect(openExternal).not.toHaveBeenCalled();
    openExternalSafe('https://example.com/a');
    openExternalSafe('mailto:a@b.vn');
    expect(openExternal).toHaveBeenCalledTimes(2);
  });

  it('chặn điều hướng ra ngoài origin và mở ngoài an toàn', () => {
    const handlers: Record<string, (event: { preventDefault: () => void }, url: string) => void> = {};
    let openHandler: ((details: { url: string }) => { action: string }) | undefined;
    const contents = {
      on: (name: string, fn: never) => { handlers[name] = fn; },
      setWindowOpenHandler: (fn: never) => { openHandler = fn; }
    };
    attachNavigationGuard(contents as never, 'https://chat.zalo.me');

    const allowed = { preventDefault: vi.fn() };
    handlers['will-navigate'](allowed, 'https://chat.zalo.me/x');
    expect(allowed.preventDefault).not.toHaveBeenCalled();

    const blocked = { preventDefault: vi.fn() };
    handlers['will-navigate'](blocked, 'file:///etc/passwd');
    expect(blocked.preventDefault).toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();

    expect(openHandler?.({ url: 'https://id.zalo.me/login' }).action).toBe('allow');
    expect(openHandler?.({ url: 'https://example.com' }).action).toBe('deny');
    expect(openExternal).toHaveBeenCalledWith('https://example.com/');
  });
});

describe('Dọn icon mồ côi', () => {
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

  it('xóa icon khi không còn profile nào dùng, giữ icon dùng chung', async () => {
    const iconDir = path.join(env.dataHome, 'zaloview', 'icons');
    fs.mkdirSync(iconDir, { recursive: true });
    const shared = path.join(iconDir, 'icon-shared.png');
    const single = path.join(iconDir, 'icon-single.png');
    fs.writeFileSync(shared, 'a');
    fs.writeFileSync(single, 'b');

    const pm = new ProfileManager();
    pm.createProfile({ id: 'a', name: 'A', url: 'https://a.vn', iconPath: shared });
    pm.createProfile({ id: 'b', name: 'B', url: 'https://b.vn', iconPath: shared });
    pm.createProfile({ id: 'c', name: 'C', url: 'https://c.vn', iconPath: single });

    const service = new ManagerService({
      profileManager: pm,
      iconDir,
      syncShortcut: async () => ({ status: 'unchanged' as const, path: '' }),
      removeShortcut: async () => ({ status: 'unchanged' as const, path: '' })
    });

    await service.deleteProfile('c');
    expect(fs.existsSync(single)).toBe(false);

    await service.deleteProfile('a');
    expect(fs.existsSync(shared)).toBe(true);

    // Bỏ icon của profile cuối cùng dùng nó thì icon được dọn.
    await service.saveProfile({ id: 'b', name: 'B', url: 'https://b.vn', iconPath: undefined });
    expect(fs.existsSync(shared)).toBe(false);
  });
});
