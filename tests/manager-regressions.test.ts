import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ManagerService, isTrustedManagerEvent } from '../src/main/manager-handlers';
import { ProfileManager } from '../src/main/profile-manager';
import { ICON_MAX_BYTES, fetchIconBuffer } from '../src/main/icon-fetcher';
import { resolveProfileDataDir } from '../src/main/xdg-paths';
import { createTempXdgEnvironment, type TestXdgEnvironment } from './test-utils';

describe('Hồi quy review Phase 5', () => {
  let env: TestXdgEnvironment;
  const originalEnv = { ...process.env };
  const stopped = async () => { throw new Error('ENOENT'); };
  const syncShortcut = async () => ({ status: 'unchanged' as const, path: '/tmp/test.desktop' });
  const runner = (profileId: string) => ({
    status: 'running', profileId, pid: 123, url: 'https://example.org', uptimeSeconds: 1,
    windowState: { width: 1024, height: 768, isMaximized: false }
  });

  beforeEach(() => {
    env = createTempXdgEnvironment();
    process.env.XDG_CONFIG_HOME = env.configHome;
    process.env.XDG_DATA_HOME = env.dataHome;
    process.env.XDG_RUNTIME_DIR = env.runtimeDir;
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
    env.cleanup();
  });

  it('chỉ tin đúng file Manager, không tin file trùng hậu tố', () => {
    for (const url of ['file:///tmp/renderer/manager/index.html', 'file:///tmp/x#renderer/manager/index.html']) {
      const mainFrame = { url };
      expect(isTrustedManagerEvent({ senderFrame: mainFrame }, { webContents: { mainFrame } })).toBe(false);
    }
    const mainFrame = { url: pathToFileURL(path.resolve(__dirname, '../src/renderer/manager/index.html')).href };
    expect(isTrustedManagerEvent({ senderFrame: mainFrame }, { webContents: { mainFrame } })).toBe(true);
  });

  it('từ chối ID sai kiểu, field lạ và config sai kiểu trước khi ghi', async () => {
    const service = new ManagerService({ syncShortcut, sendCommand: stopped });
    for (const invalid of [
      { id: 123 }, { id: null }, { id: '' }, { createdAt: 'forged' },
      { xpathConfig: [] }, { xpathConfig: { selector: 123 } },
      { xpathConfig: { pollIntervalMs: '1000' } }, { desktopConfig: [] },
      { desktopConfig: { flashTaskbar: 'yes' } }
    ]) {
      await expect(service.saveProfile({ name: 'A', url: 'https://example.org', ...invalid } as never)).rejects.toThrow(/VALIDATION_ERROR/);
    }
    await expect(service.saveProfile({ id: 'khong-ton-tai', name: 'A', url: 'https://example.org' })).rejects.toThrow(/NOT_FOUND/);
    expect(await service.getProfiles()).toEqual([]);
  });

  it('revision tăng dù hai lần lưu cùng mili giây', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const manager = new ProfileManager();
    const first = manager.createProfile({ name: 'A', url: 'https://example.org' });
    const next = manager.updateProfile(first.id, { name: 'B' });
    expect(Date.parse(next.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt));
    expect(next.createdAt).toBe(first.createdAt);
  });

  it('kiểm tra lại runner sau xác nhận xóa phiên', async () => {
    const dir = resolveProfileDataDir('a');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'session'), 'giữ');
    let running = false;
    const service = new ManagerService({
      sendCommand: async () => {
        if (!running) throw new Error('ENOENT');
        return { requestId: 'r', success: true, data: runner('a') };
      },
      confirmAction: async () => { running = true; return true; }
    });
    await expect(service.deleteProfileSession('a')).rejects.toThrow(/RUNNER_RUNNING/);
    expect(fs.readFileSync(path.join(dir, 'session'), 'utf8')).toBe('giữ');
  });

  it('giữ phiên khi thư mục cha là symlink ra ngoài vùng app', async () => {
    const outside = path.join(env.dataHome, 'outside');
    fs.mkdirSync(path.join(outside, 'a'), { recursive: true });
    fs.writeFileSync(path.join(outside, 'a', 'session'), 'giữ');
    fs.mkdirSync(path.dirname(resolveProfileDataDir('a')), { recursive: true });
    fs.rmdirSync(path.dirname(resolveProfileDataDir('a')));
    fs.symlinkSync(outside, path.dirname(resolveProfileDataDir('a')));
    const service = new ManagerService({ sendCommand: stopped, confirmAction: async () => true });
    await expect(service.deleteProfileSession('a')).rejects.toThrow(/PATH_TRAVERSAL/);
    expect(fs.existsSync(path.join(outside, 'a', 'session'))).toBe(true);
  });

  it('icon local quá 2 MiB bị chặn trước decode', async () => {
    const file = path.join(env.dataHome, 'big.png');
    fs.writeFileSync(file, Buffer.alloc(ICON_MAX_BYTES + 1));
    const decode = vi.fn(() => ({ width: 1, height: 1, png: Buffer.from('png') }));
    const service = new ManagerService({ showOpenDialog: async () => file, decodeImage: decode });
    expect((await service.chooseIcon())?.fallback).toBe(true);
    expect(decode).not.toHaveBeenCalled();
  });

  it('chỉ lưu icon trong vùng app, không nhận đường ngoài hoặc symlink thoát vùng', async () => {
    const outside = path.join(env.dataHome, 'outside.png');
    fs.writeFileSync(outside, 'png');
    const iconDir = path.join(env.dataHome, 'zaloview', 'icons');
    fs.mkdirSync(iconDir, { recursive: true });
    const link = path.join(iconDir, 'link.png');
    fs.symlinkSync(outside, link);
    const service = new ManagerService({ syncShortcut, sendCommand: stopped });
    for (const iconPath of [outside, link]) {
      await expect(service.saveProfile({ name: 'A', url: 'https://example.org', iconPath })).rejects.toThrow(/VALIDATION_ERROR/);
    }
    const iconPath = path.join(iconDir, 'valid.png');
    fs.writeFileSync(iconPath, 'png');
    expect((await service.saveProfile({ name: 'A', url: 'https://example.org', iconPath })).profile.iconPath).toBe(iconPath);
  });

  it('không mở/sửa profile trong lúc thao tác xóa đang chờ', async () => {
    let finish!: () => void;
    const service = new ManagerService({ syncShortcut, sendCommand: stopped, appPath: '/app',
      spawnRunner: () => undefined,
      removeShortcut: async () => {
        await new Promise<void>(resolve => { finish = resolve; });
        return { status: 'removed', path: '/tmp/test.desktop' };
      }
    });
    const { profile } = await service.saveProfile({ name: 'A', url: 'https://example.org' });
    const deletion = service.deleteProfile(profile.id);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await expect(service.launchProfile(profile.id)).rejects.toThrow(/PROFILE_BUSY/);
    await expect(service.saveProfile({ id: profile.id, name: 'B', url: profile.url })).rejects.toThrow(/PROFILE_BUSY/);
    finish();
    await deletion;
    expect(await service.getProfiles()).toEqual([]);
  });

  it('runner từ chối shutdown báo lỗi đúng bước và giữ registry', async () => {
    const service = new ManagerService({ syncShortcut, sendCommand: async (_, action) => action === 'shutdown'
      ? { requestId: 'r', success: false, error: 'denied' }
      : { requestId: 'r', success: true, data: runner('a') } });
    const { profile } = await service.saveProfile({ name: 'A', url: 'https://example.org' });
    await expect(service.deleteProfile(profile.id)).rejects.toThrow(/RUNNER_STOP_FAILED.*denied/);
    expect(await service.getProfiles()).toHaveLength(1);
  });

  it('lỗi spawn bất đồng bộ trả lỗi launch và không xóa khi còn khởi động', async () => {
    const service = new ManagerService({ syncShortcut, sendCommand: stopped, appPath: '/app',
      execPath: path.join(env.dataHome, 'missing-executable') });
    const { profile } = await service.saveProfile({ name: 'A', url: 'https://example.org' });
    await expect(service.launchProfile(profile.id)).rejects.toThrow(/LAUNCH_FAILED/);
    let finish!: () => void;
    const starting = new ManagerService({ syncShortcut, sendCommand: stopped, appPath: '/app',
      spawnRunner: () => new Promise<void>(resolve => { finish = resolve; }) });
    const launch = starting.launchProfile(profile.id);
    expect((await starting.getRunnerStatus(profile.id)).state).toBe('unknown');
    await expect(starting.deleteProfile(profile.id)).rejects.toThrow(/RUNNER_UNKNOWN/);
    finish();
    await launch;
    expect(await starting.getProfiles()).toHaveLength(1);
  });

  it('từ chối status sai profile/PID và XPath thiếu trường', async () => {
    for (const data of [runner('other'), { ...runner('a'), pid: NaN }, { ...runner('a'), status: 'garbage' }]) {
      const service = new ManagerService({ sendCommand: async () => ({ requestId: 'r', success: true, data }) });
      expect((await service.getRunnerStatus('a')).state).toBe('unknown');
    }
    const service = new ManagerService({ syncShortcut, sendCommand: async () => ({ requestId: 'r', success: true,
      data: { status: 'match', selector: '//div', mode: 'existence' } }) });
    const { profile } = await service.saveProfile({ name: 'A', url: 'https://example.org' });
    await expect(service.testXPath(profile.id, '//div', 'existence')).rejects.toThrow(/XPATH_FAILED/);
  });

  it('timeout bao trùm body và toàn bộ chuỗi redirect', async () => {
    const hangingBody = new ReadableStream<Uint8Array>({ start() {} });
    await expect(fetchIconBuffer('https://example.org/icon', async () => new Response(hangingBody), 30)).rejects.toThrow(/TIMEOUT/);
    let hop = 0;
    await expect(fetchIconBuffer('https://example.org/icon', async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return ++hop < 3 ? new Response(null, { status: 302, headers: { location: '/next' } }) : new Response('png');
    }, 30)).rejects.toThrow(/TIMEOUT/);
  }, 1000);

  it('tìm apple-touch-icon tương đối theo URL trang sau redirect, không gửi credentials', async () => {
    const seen: string[] = [];
    const result = await fetchIconBuffer('https://example.org/start', async (url, options) => {
      seen.push(String(url));
      expect(options?.credentials).toBe('omit');
      if (seen.length === 1) return new Response(null, {status:302,headers:{location:'/app/page'}});
      if (seen.length === 2) return new Response('<link href="icons/touch.png?v=1&amp;x=2" rel="apple-touch-icon">', {headers:{'content-type':'text/html'}});
      return new Response('image', {headers:{'content-type':'image/png'}});
    });
    expect(seen).toEqual(['https://example.org/start', 'https://example.org/app/page', 'https://example.org/app/icons/touch.png?v=1&x=2']);
    expect(result.buffer.toString()).toBe('image');
  });
});
