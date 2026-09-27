import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTempXdgEnvironment, TestXdgEnvironment } from './test-utils';
import { ProfileManager } from '../src/main/profile-manager';
import { RunnerControlServer } from '../src/main/runner-control';
import { resolveSocketPath } from '../src/main/xdg-paths';
import {
  isTrustedManagerEvent,
  ManagerService,
  registerManagerHandlers,
  MANAGER_CHANNELS,
  type IpcMainLike,
  type ManagerIpcEvent,
  type ManagerWindowRef
} from '../src/main/manager-handlers';

const MANAGER_URL = pathToFileURL(path.resolve(__dirname, '../src/renderer/manager/index.html')).href;

function makeWindow(url: string = MANAGER_URL): ManagerWindowRef {
  const mainFrame = { url };
  return { webContents: { mainFrame } };
}

type Listener = (event: ManagerIpcEvent, ...args: unknown[]) => unknown;

function makeIpc(): { ipc: IpcMainLike; handlers: Map<string, Listener> } {
  const handlers = new Map<string, Listener>();
  const ipc: IpcMainLike = {
    handle: (channel, listener) => {
      handlers.set(channel, listener as Listener);
    }
  };
  return { ipc, handlers };
}

function call(listener: Listener | undefined, event: ManagerIpcEvent, ...args: unknown[]): Promise<unknown> {
  expect(listener).toBeDefined();
  return Promise.resolve().then(() => listener?.(event, ...args));
}

describe('ManagerService US1: sender validation (P5-01)', () => {
  it('từ chối event không có senderFrame và frame lạ', () => {
    const win = makeWindow();
    expect(isTrustedManagerEvent({}, win)).toBe(false);
    expect(isTrustedManagerEvent({ senderFrame: null }, win)).toBe(false);
    expect(isTrustedManagerEvent({ senderFrame: { url: MANAGER_URL } }, win)).toBe(false);
  });

  it('từ chối website, iframe sai và URL local sai', () => {
    const win = makeWindow();
    const mainFrame = win.webContents.mainFrame;
    expect(isTrustedManagerEvent({ senderFrame: { url: 'https://chat.zalo.me/' } }, win)).toBe(false);
    // Khung nhúng: frame khác mainFrame dù cùng URL
    expect(isTrustedManagerEvent({ senderFrame: { url: MANAGER_URL } }, win)).toBe(false);
    const wrongLocal = makeWindow('file:///app/dist/renderer/manager/other.html');
    expect(
      isTrustedManagerEvent({ senderFrame: wrongLocal.webContents.mainFrame }, wrongLocal)
    ).toBe(false);
    void mainFrame;
  });

  it('chấp nhận đúng mainFrame của trang Manager local', () => {
    const win = makeWindow();
    expect(isTrustedManagerEvent({ senderFrame: win.webContents.mainFrame }, win)).toBe(true);
  });

  it('registerManagerHandlers chặn trước khi gọi service', async () => {
    const service = new ManagerService({ profileManager: new ProfileManager() });
    const spy = vi.spyOn(service, 'getProfiles');
    const { ipc, handlers } = makeIpc();
    registerManagerHandlers(ipc, () => makeWindow(), service);
    const listener = handlers.get(MANAGER_CHANNELS.getProfiles);
    await expect(call(listener, { senderFrame: { url: 'https://chat.zalo.me/' } })).rejects.toThrow(
      /VALIDATION_ERROR/
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('từ chối payload null/array ở tầng wiring', async () => {
    const service = new ManagerService({ profileManager: new ProfileManager() });
    const spy = vi.spyOn(service, 'saveProfile');
    const { ipc, handlers } = makeIpc();
    const win = makeWindow();
    registerManagerHandlers(ipc, () => win, service);
    const listener = handlers.get(MANAGER_CHANNELS.saveProfile);
    await expect(call(listener, { senderFrame: win.webContents.mainFrame }, null)).rejects.toThrow(
      /VALIDATION_ERROR/
    );
    await expect(call(listener, { senderFrame: win.webContents.mainFrame }, [])).rejects.toThrow(
      /VALIDATION_ERROR/
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('ManagerService US1: getProfiles/saveProfile', () => {
  let env: TestXdgEnvironment;
  const originalEnv = { ...process.env };
  let service: ManagerService;

  beforeEach(() => {
    env = createTempXdgEnvironment();
    process.env.XDG_CONFIG_HOME = env.configHome;
    process.env.XDG_DATA_HOME = env.dataHome;
    process.env.XDG_RUNTIME_DIR = env.runtimeDir;
    service = new ManagerService({
      syncShortcut: async () => ({ status: 'unchanged' as const, path: '/tmp/x.desktop' })
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    env.cleanup();
  });

  it('getProfiles trả [] khi chưa có registry; báo lỗi rõ khi JSON hỏng', async () => {
    await expect(service.getProfiles()).resolves.toEqual([]);
    fs.mkdirSync(path.join(env.configHome, 'zaloview'), { recursive: true });
    fs.writeFileSync(path.join(env.configHome, 'zaloview', 'profiles.json'), '{hong', 'utf-8');
    await expect(service.getProfiles()).rejects.toThrow(/REGISTRY_CORRUPT/);
  });

  it('saveProfile từ chối input sai kiểu', async () => {
    await expect(service.saveProfile(null as never)).rejects.toThrow(/VALIDATION_ERROR/);
    await expect(service.saveProfile('x' as never)).rejects.toThrow(/VALIDATION_ERROR/);
    await expect(service.saveProfile({} as never)).rejects.toThrow(/VALIDATION_ERROR/);
    await expect(service.saveProfile({ name: '', url: 'https://a.vn' } as never)).rejects.toThrow(
      /VALIDATION_ERROR/
    );
    await expect(service.saveProfile({ name: 'A', url: 'not-a-url' } as never)).rejects.toThrow(
      /VALIDATION_ERROR/
    );
    await expect(
      service.saveProfile({ id: 'ID SAI!!', name: 'A', url: 'https://a.vn' } as never)
    ).rejects.toThrow(/VALIDATION_ERROR/);
  });

  it('tạo mới sinh ID/timestamps ở main, không tin createdAt renderer gửi', async () => {
    await expect(service.saveProfile({
      name: 'Zalo A',
      url: 'https://chat.zalo.me',
      createdAt: '2000-01-01T00:00:00.000Z'
    } as never)).rejects.toThrow(/VALIDATION_ERROR/);
    const result = await service.saveProfile({ name: 'Zalo A', url: 'https://chat.zalo.me' });
    expect(result.profile.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(result.profile.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(result.profile.name).toBe('Zalo A');
    expect(result.shortcut.status).toBe('unchanged');
    expect(result.restartRequired).toBe(false);
  });

  it('sửa giữ ID/createdAt/userAgent và mọi checkbox false', async () => {
    const created = await service.saveProfile({
      name: 'Sửa',
      url: 'https://a.vn',
      userAgent: 'UA-1',
      desktopConfig: {
        flashTaskbar: true,
        showTaskbarBadge: true,
        minimizeToTray: true,
        showDesktopNotification: true,
        createDesktopShortcut: false,
        enableContextMenu: true
      }
    });
    const updated = await service.saveProfile({
      id: created.profile.id,
      name: 'Sửa 2',
      url: 'https://b.vn',
      userAgent: 'UA-HACK',
      desktopConfig: {
        flashTaskbar: false,
        showTaskbarBadge: false,
        minimizeToTray: false,
        showDesktopNotification: false,
        createDesktopShortcut: false,
        enableContextMenu: false
      }
    });
    expect(updated.profile.id).toBe(created.profile.id);
    expect(updated.profile.createdAt).toBe(created.profile.createdAt);
    expect(updated.profile.userAgent).toBe('UA-1');
    expect(updated.profile.desktopConfig).toEqual({
      flashTaskbar: false,
      showTaskbarBadge: false,
      minimizeToTray: false,
      showDesktopNotification: false,
      createDesktopShortcut: false,
      enableContextMenu: false
    });
  });

  it('lưu thất bại ở registry không gọi sync shortcut', async () => {
    const sync = vi.fn(async () => ({ status: 'unchanged' as const, path: '/tmp/x.desktop' }));
    const failing = new ManagerService({ syncShortcut: sync });
    // Registry là thư mục → mọi ghi đều lỗi
    fs.mkdirSync(path.join(env.configHome, 'zaloview'), { recursive: true });
    fs.writeFileSync(path.join(env.configHome, 'zaloview', 'profiles.json'), '[]', 'utf-8');
    await expect(failing.saveProfile({ name: 'Lỗi', url: 'https://a.vn' })).rejects.toThrow(
      /REGISTRY_CORRUPT|REGISTRY_ERROR/
    );
    expect(sync).not.toHaveBeenCalled();
  });
});

describe('ManagerService US2: getRunnerStatus (P5-02)', () => {
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

  it('socket file không tồn tại nghĩa là stopped', async () => {
    const service = new ManagerService();
    const status = await service.getRunnerStatus('chua-chay');
    expect(status.state).toBe('stopped');
    expect(status.data).toBeUndefined();
  });

  it('socket file tồn tại nhưng không kết nối được nghĩa là unknown', async () => {
    const socketPath = resolveSocketPath('treo');
    fs.mkdirSync(path.dirname(socketPath), { recursive: true });
    fs.writeFileSync(socketPath, 'stale', 'utf-8');
    const service = new ManagerService();
    const status = await service.getRunnerStatus('treo');
    expect(status.state).toBe('unknown');
  });

  it('runner thật trả running kèm RunnerStatusData', async () => {
    const server = new RunnerControlServer('dang-chay', {
      onStatus: () => ({
        status: 'running',
        profileId: 'dang-chay',
        url: 'https://a.vn',
        pid: process.pid,
        uptimeSeconds: 1,
        windowState: { width: 1024, height: 768, isMaximized: false },
        configRevision: 'rev-1'
      }),
      onShutdown: () => undefined
    });
    await server.start();
    try {
      const service = new ManagerService();
      const status = await service.getRunnerStatus('dang-chay');
      expect(status.state).toBe('running');
      expect(status.data?.profileId).toBe('dang-chay');
      expect(status.data?.configRevision).toBe('rev-1');
    } finally {
      await server.stop();
    }
  });

  it('từ chối profileId sai định dạng', async () => {
    const service = new ManagerService();
    await expect(service.getRunnerStatus('ID SAI!!')).rejects.toThrow(/VALIDATION_ERROR/);
  });
});

describe('ManagerService US2: launchProfile/clearAttention', () => {
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

  it('launch bằng argument array chứa --profile <id>; spawn lỗi báo rõ', async () => {
    const seen: string[][] = [];
    const service = new ManagerService({
      appPath: '/app/path',
      isPackaged: false,
      execPath: '/fake/electron',
      spawnRunner: (args) => {
        seen.push(args);
      }
    });
    const created = await service.saveProfile({ name: 'Chay', url: 'https://a.vn' });
    const result = await service.launchProfile(created.profile.id);
    expect(result).toEqual({ requested: true, profileId: created.profile.id });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('--profile');
    expect(seen[0]).toContain(created.profile.id);

    const failing = new ManagerService({
      spawnRunner: () => {
        throw new Error('spawn ENOENT');
      }
    });
    await expect(failing.launchProfile(created.profile.id)).rejects.toThrow(/LAUNCH_FAILED/);
  });

  it('launch profile không tồn tại báo NOT_FOUND', async () => {
    const service = new ManagerService({ spawnRunner: () => undefined });
    await expect(service.launchProfile('khong-co')).rejects.toThrow(/NOT_FOUND/);
  });

  it('clearAttention chuyển tới đúng socket; runner dừng báo lỗi rõ', async () => {
    const sent: Array<{ action: string }> = [];
    const service = new ManagerService({
      sendCommand: (async (_socketPath: string, action: never) => {
        sent.push({ action: String(action) });
        return { requestId: 'r1', success: true, data: { cleared: true } };
      }) as never
    });
    await service.saveProfile({ name: 'Chuong', url: 'https://a.vn' });
    const created = (await service.getProfiles())[0];
    sent.length = 0;
    const result = await service.clearAttention(created.id);
    expect(result).toEqual({ cleared: true });
    expect(sent).toEqual([{ action: 'clear-attention' }]);

    const stopped = new ManagerService();
    await expect(stopped.clearAttention(created.id)).rejects.toThrow(/RUNNER_NOT_RUNNING|RUNNER_UNKNOWN/);
  });
});

describe('ManagerService US3: shortcut từng phần (P5-04)', () => {
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

  it('registry lưu nhưng entry lỗi vẫn báo đúng và cho retry không trùng', async () => {
    let attempt = 0;
    const service = new ManagerService({
      launcherPath: '/tmp/zaloview-test-launcher',
      syncShortcut: (async () => {
        attempt += 1;
        if (attempt === 1) {
          return { status: 'error' as const, path: '/tmp/x.desktop', message: 'ghi lỗi' };
        }
        return { status: 'created' as const, path: '/tmp/x.desktop' };
      }) as never
    });
    const first = await service.saveProfile({ name: 'Loi', url: 'https://a.vn' });
    expect(first.shortcut.status).toBe('error');
    expect((await service.getProfiles())).toHaveLength(1);

    const retry = await service.toggleShortcut(first.profile.id, true);
    expect(retry.shortcut.status).toBe('created');
    expect((await service.getProfiles())).toHaveLength(1);
  });

  it('config runner cũ hiển thị cần mở lại từ revision', async () => {
    const service = new ManagerService({
      launcherPath: '/tmp/zaloview-test-launcher',
      syncShortcut: (async () => ({ status: 'unchanged' as const, path: '/tmp/x.desktop' })) as never,
      sendCommand: (async () => ({
        requestId: 'r1',
        success: true,
        data: {
          status: 'running',
          profileId: 'cu',
          url: 'https://a.vn',
          pid: 4242,
          uptimeSeconds: 5,
          windowState: { width: 1024, height: 768, isMaximized: false },
          configRevision: 'rev-cu'
        }
      })) as never
    });
    const saved = await service.saveProfile({ name: 'Cu', url: 'https://a.vn' });
    expect(saved.restartRequired).toBe(true);
    // Không có appPath → không tự mở lại được, UI vẫn nhắc mở lại thủ công.
    expect(saved.runnerRestarted).toBe(false);
  });

  it('toggleShortcut từ chối enabled không phải boolean', async () => {
    const service = new ManagerService();
    const saved = await service.saveProfile({ name: 'B', url: 'https://a.vn' });
    await expect(service.toggleShortcut(saved.profile.id, 'yes' as never)).rejects.toThrow(
      /VALIDATION_ERROR/
    );
  });
});

describe('ManagerService US3: testXPath (P5-06)', () => {
  let env: TestXdgEnvironment;
  const originalEnv = { ...process.env };

  function matchResult(selector: string): Record<string, unknown> {
    return {
      status: 'match',
      selector,
      mode: 'existence',
      hasElement: true,
      count: 1,
      textPreview: '',
      executionTimeMs: 5
    };
  }

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

  it('trả kết quả khớp từ đúng runner', async () => {
    const service = new ManagerService({
      sendCommand: (async (_socket: string, action: never, params: never) => ({
        requestId: 'r1',
        success: true,
        data: matchResult((params as { selector: string }).selector)
      })) as never
    });
    const saved = await service.saveProfile({ name: 'X', url: 'https://a.vn' });
    const result = await service.testXPath(saved.profile.id, '//div', 'existence');
    expect(result.status).toBe('match');
    expect(result.selector).toBe('//div');
  });

  it('từ chối selector rỗng/quá dài, mode sai, profile chưa lưu', async () => {
    const service = new ManagerService({ sendCommand: (async () => ({})) as never });
    const saved = await service.saveProfile({ name: 'X', url: 'https://a.vn' });
    await expect(service.testXPath(saved.profile.id, '   ', 'existence')).rejects.toThrow(
      /VALIDATION_ERROR/
    );
    await expect(service.testXPath(saved.profile.id, 'x'.repeat(1001), 'existence')).rejects.toThrow(
      /VALIDATION_ERROR/
    );
    await expect(service.testXPath(saved.profile.id, '//div', 'sai' as never)).rejects.toThrow(
      /VALIDATION_ERROR/
    );
    await expect(service.testXPath('chua-luu', '//div', 'existence')).rejects.toThrow(/NOT_FOUND/);
  });

  it('phân loại lỗi vòng đời/kết nối và kết quả không khớp request', async () => {
    const stopped = new ManagerService();
    const saved = await stopped.saveProfile({ name: 'X', url: 'https://a.vn' });
    await expect(stopped.testXPath(saved.profile.id, '//div', 'existence')).rejects.toThrow(
      /RUNNER_NOT_RUNNING|RUNNER_UNKNOWN/
    );

    const mismatch = new ManagerService({
      sendCommand: (async () => ({
        requestId: 'r1',
        success: true,
        data: { ...matchResult('//khac'), mode: 'badge_count' }
      })) as never
    });
    const saved2 = await mismatch.saveProfile({ name: 'Y', url: 'https://a.vn' });
    await expect(mismatch.testXPath(saved2.profile.id, '//div', 'existence')).rejects.toThrow(
      /XPATH_FAILED/
    );

    const failed = new ManagerService({
      sendCommand: (async () => ({ requestId: 'r1', success: false, error: 'PAGE_NAVIGATED' })) as never
    });
    const saved3 = await failed.saveProfile({ name: 'Z', url: 'https://a.vn' });
    await expect(failed.testXPath(saved3.profile.id, '//div', 'existence')).rejects.toThrow(
      /XPATH_FAILED/
    );
  });

  it('không sửa config/baseline khi thử XPath', async () => {
    const service = new ManagerService({
      sendCommand: (async (_socket: string, action: never, params: never) => ({
        requestId: 'r1',
        success: true,
        data: { ...matchResult((params as { selector: string }).selector), status: 'no_match', hasElement: false, count: 0 }
      })) as never
    });
    const saved = await service.saveProfile({
      name: 'Giu',
      url: 'https://a.vn',
      xpathConfig: { selector: '//cu', mode: 'existence', pollIntervalMs: 3000 }
    });
    const result = await service.testXPath(saved.profile.id, '//moi', 'existence');
    expect(result.status).toBe('no_match');
    const reloaded = (await service.getProfiles())[0];
    expect(reloaded.xpathConfig.selector).toBe('//cu');
  });
});

describe('ManagerService US3: chooseIcon/fetchIcon (P5-09)', () => {
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

  const goodPng = Buffer.from('fakepng-bytes');
  const goodDecode = () => ({ width: 64, height: 64, png: goodPng });

  it('hủy dialog không phải lỗi; file mất có fallback', async () => {
    const cancelled = new ManagerService({ showOpenDialog: async () => null });
    await expect(cancelled.chooseIcon()).resolves.toBeNull();

    const missing = new ManagerService({
      showOpenDialog: async () => '/khong/ton/tai.png',
      decodeImage: goodDecode,
      iconDir: path.join(env.dataHome, 'icons'),
      fallbackIconPath: '/fallback.png'
    });
    const result = await missing.chooseIcon();
    expect(result?.fallback).toBe(true);
    expect(result?.path).toBe('/fallback.png');
    expect(result?.reason).toMatch(/Không thể đọc tệp/);
  });

  it('ảnh hỏng và ảnh quá lớn đều fallback, không làm hỏng form', async () => {
    const local = path.join(env.tempRoot, 'a.png');
    fs.writeFileSync(local, Buffer.from('not-an-image'));
    const bad = new ManagerService({
      showOpenDialog: async () => local,
      decodeImage: () => null,
      iconDir: path.join(env.dataHome, 'icons'),
      fallbackIconPath: '/fallback.png'
    });
    const badResult = await bad.chooseIcon();
    expect(badResult?.fallback).toBe(true);

    const huge = new ManagerService({
      showOpenDialog: async () => local,
      decodeImage: () => ({ width: 2048, height: 10, png: goodPng }),
      iconDir: path.join(env.dataHome, 'icons'),
      fallbackIconPath: '/fallback.png'
    });
    const hugeResult = await huge.chooseIcon();
    expect(hugeResult?.fallback).toBe(true);
    expect(hugeResult?.reason).toMatch(/1024/);
  });

  it('ảnh hợp lệ được chuẩn hóa và lưu vào vùng icon app', async () => {
    const local = path.join(env.tempRoot, 'ok.png');
    fs.writeFileSync(local, goodPng);
    const iconDir = path.join(env.dataHome, 'icons');
    const service = new ManagerService({
      showOpenDialog: async () => local,
      decodeImage: goodDecode,
      iconDir,
      fallbackIconPath: '/fallback.png'
    });
    const result = await service.chooseIcon();
    expect(result?.fallback).toBe(false);
    expect(result?.path.startsWith(iconDir)).toBe(true);
    expect(fs.readFileSync(result?.path as string).equals(goodPng)).toBe(true);
  });

  it('fetchIcon tải có giới hạn, lỗi dùng fallback kèm lý do', async () => {    const iconDir = path.join(env.dataHome, 'icons');
    const ok = new ManagerService({
      fetchImpl: (async () => ({
        status: 200,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => goodPng.buffer as ArrayBuffer
      })) as never,
      decodeImage: goodDecode,
      iconDir,
      fallbackIconPath: '/fallback.png'
    });
    const good = await ok.fetchIcon('https://a.vn/icon.png');
    expect(good.fallback).toBe(false);

    const bad = new ManagerService({
      fetchImpl: (async () => {
        throw new Error('socket hang up');
      }) as never,
      decodeImage: goodDecode,
      iconDir,
      fallbackIconPath: '/fallback.png'
    });
    const fallback = await bad.fetchIcon('https://a.vn/icon.png');
    expect(fallback.fallback).toBe(true);
    expect(fallback.reason).toBeDefined();

    await expect(ok.fetchIcon('   ')).rejects.toThrow(/VALIDATION_ERROR/);
  });
});

describe('ManagerService US4: deleteProfile (P5-07)', () => {
  let env: TestXdgEnvironment;
  const originalEnv = { ...process.env };

  function stoppedService(overrides: Record<string, never> = {}): ManagerService {
    return new ManagerService({
      syncShortcut: (async () => ({ status: 'unchanged' as const, path: '/tmp/x.desktop' })) as never,
      removeShortcut: (async () => ({ status: 'removed' as const, path: '/tmp/x.desktop' })) as never,
      ...overrides
    });
  }

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

  it('xóa khi runner đã dừng: gỡ shortcut, xóa registry, giữ session', async () => {
    const service = stoppedService();
    const saved = await service.saveProfile({ name: 'Xoa', url: 'https://a.vn' });
    const sessionDir = path.join(env.dataHome, 'zaloview', 'profiles', saved.profile.id);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'session.json'), '{}', 'utf-8');

    const result = await service.deleteProfile(saved.profile.id);
    expect(result).toEqual({ removed: true, sessionKept: true });
    expect(await service.getProfiles()).toEqual([]);
    expect(fs.existsSync(path.join(sessionDir, 'session.json'))).toBe(true);
  });

  it('status unknown không xóa, giữ mọi dữ liệu', async () => {
    const socketPath = resolveSocketPath('mu');
    fs.mkdirSync(path.dirname(socketPath), { recursive: true });
    fs.writeFileSync(socketPath, 'stale', 'utf-8');
    const service = stoppedService();
    const saved = await service.saveProfile({ name: 'Mu', url: 'https://a.vn' });
    await expect(service.deleteProfile(saved.profile.id)).rejects.toThrow(/RUNNER_UNKNOWN/);
    expect(await service.getProfiles()).toHaveLength(1);
  });

  it('shutdown ACK nhưng PID còn sống thì timeout và giữ dữ liệu', async () => {
    const service = new ManagerService({
      syncShortcut: (async () => ({ status: 'unchanged' as const, path: '/tmp/x.desktop' })) as never,
      removeShortcut: (async () => ({ status: 'removed' as const, path: '/tmp/x.desktop' })) as never,
      sendCommand: (async (_socket: string, action: never) => {
        if (String(action) === 'shutdown') return { requestId: 'r', success: true, data: {} };
        return {
          requestId: 'r',
          success: true,
          data: {
            status: 'running',
            profileId: 'stubborn',
            url: 'https://a.vn',
            pid: 424242,
            uptimeSeconds: 9,
            windowState: { width: 1024, height: 768, isMaximized: false }
          }
        };
      }) as never,
      isProcessAlive: () => true,
      sleep: async () => undefined,
      shutdownPollIntervalMs: 1,
      shutdownTimeoutMs: 30
    });
    // Giả socket tồn tại để đi vào nhánh đang chạy
    const socketPath = resolveSocketPath('stubborn');
    fs.mkdirSync(path.dirname(socketPath), { recursive: true });
    fs.writeFileSync(socketPath, 'stubborn', 'utf-8');
    const created = await service.saveProfile({ name: 'Stubborn', url: 'https://a.vn' });
    await expect(service.deleteProfile(created.profile.id)).rejects.toThrow(/RUNNER_STOP_TIMEOUT/);
    expect(await service.getProfiles()).toHaveLength(1);
  });

  it('entry gỡ lỗi giữ registry; registry ghi lỗi báo đã gỡ shortcut', async () => {
    const entryFail = stoppedService({
      removeShortcut: (async () => ({
        status: 'error' as const,
        path: '/tmp/x.desktop',
        message: 'gỡ lỗi'
      })) as never
    });
    const saved = await entryFail.saveProfile({ name: 'E', url: 'https://a.vn' });
    await expect(entryFail.deleteProfile(saved.profile.id)).rejects.toThrow(/SHORTCUT_REMOVE_FAILED/);
    expect(await entryFail.getProfiles()).toHaveLength(1);

    const registryFail = stoppedService();
    const saved2 = await registryFail.saveProfile({ name: 'R', url: 'https://a.vn' });
    const registryPath = path.join(env.configHome, 'zaloview', 'profiles.json');
    fs.rmSync(registryPath);
    fs.mkdirSync(registryPath, { recursive: true });
    await expect(registryFail.deleteProfile(saved2.profile.id)).rejects.toThrow(/REGISTRY_ERROR/);
    fs.rmSync(registryPath, { recursive: true, force: true });
  });

  it('tạo lại cùng tên không nhận session cũ', async () => {
    const service = stoppedService();
    const first = await service.saveProfile({ name: 'Tam', url: 'https://a.vn' });
    await service.deleteProfile(first.profile.id);
    fs.mkdirSync(path.join(env.dataHome, 'zaloview', 'profiles', first.profile.id), { recursive: true });
    const second = await service.saveProfile({ name: 'Tam', url: 'https://a.vn' });
    expect(second.profile.id).not.toBe(first.profile.id);
  });
});

describe('ManagerService US4: deleteProfileSession (P5-08)', () => {
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

  it('hủy xác nhận không đổi dữ liệu; xác nhận xóa đúng phiên mục tiêu', async () => {
    const kept = new ManagerService({
      syncShortcut: (async () => ({ status: 'unchanged' as const, path: '/tmp/x.desktop' })) as never,
      confirmAction: async () => false
    });
    const saved = await kept.saveProfile({ name: 'S', url: 'https://a.vn' });
    const dir = path.join(env.dataHome, 'zaloview', 'profiles', saved.profile.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'session.json'), '{}', 'utf-8');
    const cancelled = await kept.deleteProfileSession(saved.profile.id);
    expect(cancelled).toEqual({ deleted: false, cancelled: true });
    expect(fs.existsSync(path.join(dir, 'session.json'))).toBe(true);

    const other = path.join(env.dataHome, 'zaloview', 'profiles', 'profile-khac');
    fs.mkdirSync(other, { recursive: true });
    fs.writeFileSync(path.join(other, 'session.json'), '{}', 'utf-8');
    const confirmed = new ManagerService({
      syncShortcut: (async () => ({ status: 'unchanged' as const, path: '/tmp/x.desktop' })) as never,
      confirmAction: async () => true
    });
    const done = await confirmed.deleteProfileSession(saved.profile.id);
    expect(done).toEqual({ deleted: true });
    expect(fs.existsSync(dir)).toBe(false);
    expect(fs.existsSync(path.join(other, 'session.json'))).toBe(true);
  });

  it('runner còn chạy hoặc ID sai bị chặn', async () => {
    const running = new ManagerService({
      sendCommand: (async () => ({
        requestId: 'r',
        success: true,
        data: {
          status: 'running',
          profileId: 'busy',
          url: 'https://a.vn',
          pid: 1,
          uptimeSeconds: 1,
          windowState: { width: 1024, height: 768, isMaximized: false }
        }
      })) as never,
      confirmAction: async () => true
    });
    const socketPath = resolveSocketPath('busy');
    fs.mkdirSync(path.dirname(socketPath), { recursive: true });
    fs.writeFileSync(socketPath, 'busy', 'utf-8');
    await running.saveProfile({ name: 'Busy', url: 'https://a.vn' });
    await expect(running.deleteProfileSession('busy')).rejects.toThrow(/RUNNER_RUNNING/);

    const service = new ManagerService({ confirmAction: async () => true });
    await expect(service.deleteProfileSession('..')).rejects.toThrow(/VALIDATION_ERROR/);
  });
});

describe('ManagerService US1: exportProfiles (Phase 9)', () => {
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

  it('hủy hộp thoại thì không ghi tệp và giữ nguyên dữ liệu', async () => {
    const service = new ManagerService({
      syncShortcut: (async () => ({ status: 'unchanged' as const, path: '/tmp/x.desktop' })) as never,
      showSaveDialog: async () => null
    });
    await service.saveProfile({ name: 'A', url: 'https://a.vn' });
    await expect(service.exportProfiles()).resolves.toEqual({ cancelled: true, reason: 'CANCELLED' });
  });

  it('danh sách rỗng trả EMPTY và không mở hộp thoại lưu', async () => {
    let called = false;
    const service = new ManagerService({
      showSaveDialog: async () => {
        called = true;
        return path.join(env.tempRoot, 'x.json');
      }
    });
    await expect(service.exportProfiles()).resolves.toEqual({ cancelled: true, reason: 'EMPTY' });
    expect(called).toBe(false);
  });

  it('ghi tệp JSON đủ cấu hình, nhúng icon base64 và bỏ iconPath/timestamps', async () => {
    const iconDir = path.join(env.dataHome, 'zaloview', 'icons');
    fs.mkdirSync(iconDir, { recursive: true });
    const iconPath = path.join(iconDir, 'icon-test.png');
    fs.writeFileSync(iconPath, Buffer.from([1, 2, 3, 4]), 'utf-8');

    const service = new ManagerService({
      syncShortcut: (async () => ({ status: 'unchanged' as const, path: '/tmp/x.desktop' })) as never,
      showSaveDialog: async () => path.join(env.tempRoot, 'out.json')
    });
    const saved = await service.saveProfile({
      name: 'Zalo A',
      url: 'https://chat.zalo.me',
      userAgent: 'UA-1',
      iconPath
    });

    const result = await service.exportProfiles();
    expect(result.cancelled).toBe(false);
    if (result.cancelled) throw new Error('unreachable');
    expect(result.count).toBe(1);
    expect(result.path).toBe(path.join(env.tempRoot, 'out.json'));

    const bundle = JSON.parse(fs.readFileSync(result.path, 'utf-8'));
    expect(bundle.schemaVersion).toBe(1);
    expect(typeof bundle.exportedAt).toBe('string');
    expect(bundle.profiles).toHaveLength(1);
    const entry = bundle.profiles[0];
    expect(entry.id).toBe(saved.profile.id);
    expect(entry.userAgent).toBe('UA-1');
    expect(entry.icon).toEqual({ mimeType: 'image/png', data: Buffer.from([1, 2, 3, 4]).toString('base64') });
    expect(entry.iconPath).toBeUndefined();
    expect(entry.createdAt).toBeUndefined();
    expect(entry.updatedAt).toBeUndefined();
  });
});

describe('ManagerService US2: importProfiles (Phase 9)', () => {
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

  function writeBundle(profiles: unknown[]): string {
    const file = path.join(env.tempRoot, `import-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, exportedAt: 'x', profiles }), 'utf-8');
    return file;
  }

  function profileEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'nhap-a',
      name: 'Nhập A',
      url: 'https://chat.zalo.me',
      xpathConfig: { selector: '//div', mode: 'badge_count', pollIntervalMs: 3000 },
      desktopConfig: {
        flashTaskbar: true,
        showTaskbarBadge: true,
        minimizeToTray: false,
        showDesktopNotification: true,
        createDesktopShortcut: true
      },
      ...overrides
    };
  }

  function makeService(filePath: string | null, sync = vi.fn(async () => ({ status: 'unchanged' as const, path: '/tmp/x.desktop' }))) {
    return new ManagerService({ showJsonOpenDialog: async () => filePath, syncShortcut: sync as never });
  }

  it('hủy hộp thoại không đổi registry', async () => {
    const service = makeService(null);
    await expect(service.importProfiles()).resolves.toMatchObject({ cancelled: true, addedCount: 0 });
    await expect(service.getProfiles()).resolves.toEqual([]);
  });

  it('thêm profile hợp lệ với đầy đủ cấu hình, bỏ qua trùng ID', async () => {
    const service = makeService(writeBundle([profileEntry(), profileEntry({ id: 'nhap-b', name: 'Nhập B' })]));
    const report = await service.importProfiles();
    expect(report.cancelled).toBe(false);
    expect(report.addedCount).toBe(2);
    expect(report.added.map((item) => item.id)).toEqual(['nhap-a', 'nhap-b']);
    expect(report.skipped).toEqual([]);

    const again = makeService(writeBundle([profileEntry(), profileEntry({ id: 'nhap-c', name: 'Nhập C' })]));
    const second = await again.importProfiles();
    expect(second.addedCount).toBe(1);
    expect(second.skipped).toEqual([{ id: 'nhap-a', reason: 'ID_EXISTS' }]);

    const profiles = await again.getProfiles();
    const added = profiles.find((p) => p.id === 'nhap-a');
    expect(added?.name).toBe('Nhập A');
    expect(added?.xpathConfig).toEqual({ selector: '//div', mode: 'badge_count', pollIntervalMs: 3000 });
  });

  it('file sai cấu trúc bị từ chối và registry giữ nguyên', async () => {
    const service = makeService(writeBundle([]));
    const badJson = path.join(env.tempRoot, 'bad.json');
    fs.writeFileSync(badJson, '{hong', 'utf-8');
    await expect(makeService(badJson).importProfiles()).rejects.toThrow(/IMPORT_INVALID_FILE/);

    const badVersion = path.join(env.tempRoot, 'bad-version.json');
    fs.writeFileSync(badVersion, JSON.stringify({ schemaVersion: 2, profiles: [] }), 'utf-8');
    await expect(makeService(badVersion).importProfiles()).rejects.toThrow(/IMPORT_INVALID_FILE/);
    await expect(service.getProfiles()).resolves.toEqual([]);
  });

  it('file vượt giới hạn kích thước bị từ chối', async () => {
    const big = path.join(env.tempRoot, 'big.json');
    fs.writeFileSync(big, Buffer.alloc(20 * 1024 * 1024 + 1));
    await expect(makeService(big).importProfiles()).rejects.toThrow(/IMPORT_FILE_TOO_LARGE/);
  });

  it('ID còn thư mục phiên mồ côi bị bỏ qua kèm lý do', async () => {
    const orphanDir = path.join(env.dataHome, 'zaloview', 'profiles', 'nhap-a');
    fs.mkdirSync(orphanDir, { recursive: true });
    const service = makeService(writeBundle([profileEntry()]));
    const report = await service.importProfiles();
    expect(report.addedCount).toBe(0);
    expect(report.skipped).toEqual([{ id: 'nhap-a', reason: 'SESSION_DATA_EXISTS' }]);
  });
});

describe('ManagerService US3: importProfiles báo cáo (Phase 9)', () => {
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

  function writeBundle(profiles: unknown[]): string {
    const file = path.join(env.tempRoot, `import-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, exportedAt: 'x', profiles }), 'utf-8');
    return file;
  }

  function profileEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'nhap-a',
      name: 'Nhập A',
      url: 'https://chat.zalo.me',
      xpathConfig: { selector: '//div', mode: 'badge_count', pollIntervalMs: 3000 },
      desktopConfig: {
        flashTaskbar: true,
        showTaskbarBadge: true,
        minimizeToTray: false,
        showDesktopNotification: true,
        createDesktopShortcut: true
      },
      ...overrides
    };
  }

  const syncOk = (async () => ({ status: 'unchanged' as const, path: '/tmp/x.desktop' })) as never;

  it('icon không giải mã được bị bỏ qua nhưng profile vẫn được thêm, kèm cảnh báo', async () => {
    const icon = Buffer.from([1, 2, 3]).toString('base64');
    const file = writeBundle([profileEntry({ icon: { mimeType: 'image/png', data: icon } })]);
    const service = new ManagerService({
      showJsonOpenDialog: async () => file,
      syncShortcut: syncOk,
      decodeImage: () => null
    });

    const report = await service.importProfiles();

    expect(report.addedCount).toBe(1);
    expect(report.warnings).toEqual([{ id: 'nhap-a', reason: 'ICON_IGNORED' }]);
    const profiles = await service.getProfiles();
    expect(profiles[0].iconPath).toBeUndefined();
  });

  it('icon vượt 2 MiB bị bỏ qua trước khi giải mã', async () => {
    const huge = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64');
    const file = writeBundle([profileEntry({ icon: { mimeType: 'image/png', data: huge } })]);
    const service = new ManagerService({
      showJsonOpenDialog: async () => file,
      syncShortcut: syncOk,
      decodeImage: () => {
        throw new Error('decodeImage không được gọi cho icon vượt giới hạn');
      }
    });

    const report = await service.importProfiles();

    expect(report.addedCount).toBe(1);
    expect(report.warnings).toEqual([{ id: 'nhap-a', reason: 'ICON_IGNORED' }]);
  });

  it('đồng bộ shortcut lỗi chỉ ghi cảnh báo, profile vẫn tồn tại', async () => {
    const file = writeBundle([profileEntry()]);
    const service = new ManagerService({
      showJsonOpenDialog: async () => file,
      syncShortcut: (async () => {
        throw new Error('boom');
      }) as never
    });

    const report = await service.importProfiles();

    expect(report.addedCount).toBe(1);
    expect(report.warnings).toEqual([{ id: 'nhap-a', reason: 'SHORTCUT_FAILED' }]);
    await expect(service.getProfiles()).resolves.toHaveLength(1);
  });

  it('mục không hợp lệ giữ đúng index trong tệp', async () => {
    const file = writeBundle([profileEntry({ id: 'ok' }), profileEntry({ id: 'bad', url: 'ftp://x' })]);
    const service = new ManagerService({ showJsonOpenDialog: async () => file, syncShortcut: syncOk });

    const report = await service.importProfiles();

    expect(report.addedCount).toBe(1);
    expect(report.invalid).toHaveLength(1);
    expect(report.invalid[0].index).toBe(1);
  });
});



