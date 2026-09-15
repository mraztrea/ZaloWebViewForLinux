import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTempXdgEnvironment, TestXdgEnvironment } from './test-utils';
import { ManagerService } from '../src/main/manager-handlers';
import { RunnerControlServer } from '../src/main/runner-control';
import { AttentionController } from '../src/main/notifier';
import { resolveProfileDataDir, resolveRegistryPath, resolveSocketPath } from '../src/main/xdg-paths';

/**
 * Chuỗi đầu cuối US5 (P5-11) ở mức service + socket thật:
 * thêm A/B → trạng thái → mở → thử XPath → xóa cảnh báo → shortcut →
 * mở lặp → sửa (cần mở lại) → xóa giữ session → xóa phiên → fault.
 */
describe('US5: chuỗi Manager đầu cuối', () => {
  let env: TestXdgEnvironment;
  const originalEnv = { ...process.env };
  const servers: RunnerControlServer[] = [];
  const attentionControllers: AttentionController[] = [];
  const launched: string[][] = [];

  const DEAD_PID = 999999991;

  function makeService(): ManagerService {
    return new ManagerService({
      launcherPath: path.join(env.tempRoot, 'zaloview'),
      appPath: '/app/path',
      execPath: '/fake/electron',
      syncShortcut: (async () => ({ status: 'unchanged' as const, path: '/tmp/x.desktop' })) as never,
      removeShortcut: (async () => ({ status: 'removed' as const, path: '/tmp/x.desktop' })) as never,
      spawnRunner: (args: string[]) => {
        launched.push(args);
      },
      confirmAction: async () => true
    });
  }

  beforeEach(() => {
    env = createTempXdgEnvironment();
    process.env.XDG_CONFIG_HOME = env.configHome;
    process.env.XDG_DATA_HOME = env.dataHome;
    process.env.XDG_RUNTIME_DIR = env.runtimeDir;
    launched.length = 0;
    const launcher = path.join(env.tempRoot, 'zaloview');
    fs.writeFileSync(launcher, '#!/bin/sh\n', 'utf-8');
    fs.chmodSync(launcher, 0o755);
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => server.stop()));
    attentionControllers.splice(0).forEach(controller => controller.dispose());
    process.env = { ...originalEnv };
    env.cleanup();
  });

  it('CRUD → launch → xpath → clear → shortcut → mở lặp → sửa → xóa giữ session', async () => {
    const service = makeService();

    // 1. Thêm A/B
    const a = await service.saveProfile({ name: 'Profile A', url: 'https://a.vn' });
    const b = await service.saveProfile({ name: 'Profile B', url: 'https://b.vn' });
    expect(await service.getProfiles()).toHaveLength(2);

    // 2. Chưa chạy → stopped
    expect((await service.getRunnerStatus(a.profile.id)).state).toBe('stopped');

    // 3. Hai socket server và bộ điều khiển cảnh báo thật; không thay thế Electron GUI.
    for (const { profile } of [a, b]) {
      const attention = new AttentionController({
        profileId: profile.id, mode: 'badge_count', desktopConfig: profile.desktopConfig,
        effects: {
          setFlash: () => undefined,
          setBadge: () => undefined,
          setTrayUnread: () => undefined,
          showPopup: () => true,
          closePopup: () => undefined
        }
      });
      attention.onObservation({ mode: 'badge_count', hasElement: true, count: 2, text: '2', changedForAlert: true, timestamp: 1 });
      attentionControllers.push(attention);
      const server = new RunnerControlServer(profile.id, {
        onStatus: () => ({
          status: 'running',
          profileId: profile.id,
          url: profile.url,
          pid: DEAD_PID,
          uptimeSeconds: 3,
          windowState: { width: 1024, height: 768, isMaximized: false },
          configRevision: profile.updatedAt,
          attention: attention.getStatus()
        }),
        onShutdown: async () => {
          await server.stop();
        },
        onClearAttention: () => ({ cleared: attention.clear() }),
        onTestXPath: async (params) => ({
          status: 'match',
          selector: params.selector,
          mode: params.mode,
          hasElement: true,
          count: 2,
          textPreview: '',
          executionTimeMs: 4
        })
      });
      servers.push(server);
      await server.start();
    }

    // 4. Mở A từ Manager
    const launch = await service.launchProfile(a.profile.id);
    expect(launch).toEqual({ requested: true, profileId: a.profile.id });
    expect(launched[0]).toContain('--profile');

    // 5. Trạng thái running kèm attention của A
    const running = await service.getRunnerStatus(a.profile.id);
    expect(running.state).toBe('running');
    expect(running.data?.attention?.count).toBe(2);

    // 6. Thử XPath trên A
    const xpath = await service.testXPath(a.profile.id, '//div[@id="x"]', 'existence');
    expect(xpath.status).toBe('match');

    // 7. Clear và focus A không xóa cảnh báo B đang chạy.
    expect(await service.clearAttention(a.profile.id)).toEqual({ cleared: true });
    expect((await service.getRunnerStatus(a.profile.id)).data?.attention?.active).toBe(false);
    expect((await service.getRunnerStatus(b.profile.id)).data?.attention).toEqual({ active: true, mode: 'badge_count', count: 2 });
    attentionControllers[0].onObservation({ mode: 'badge_count', hasElement: true, count: 3, text: '3', changedForAlert: true, timestamp: 2 });
    attentionControllers[0].setFocused(true);
    expect((await service.getRunnerStatus(a.profile.id)).data?.attention?.active).toBe(false);
    expect((await service.getRunnerStatus(b.profile.id)).data?.attention?.active).toBe(true);
    expect((await makeService().getRunnerStatus(b.profile.id)).state).toBe('running');

    // 8. Shortcut cho A
    const toggled = await service.toggleShortcut(a.profile.id, true);
    expect(toggled.saved.desktopConfig.createDesktopShortcut).toBe(true);

    // 9. Mở lặp A vẫn chỉ gửi yêu cầu, không lỗi
    await expect(service.launchProfile(a.profile.id)).resolves.toEqual({
      requested: true,
      profileId: a.profile.id
    });

    // 10. Sửa A → cần mở lại vì revision snapshot cũ
    const edited = await service.saveProfile({ id: a.profile.id, name: 'Profile A2', url: 'https://a.vn' });
    expect(edited.profile.name).toBe('Profile A2');
    expect(edited.restartRequired).toBe(true);

    // 11. Xóa A: shutdown qua socket → server dừng → socket dọn → PID giả đã chết
    const sessionDir = resolveProfileDataDir(a.profile.id);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'session.json'), '{}', 'utf-8');
    const deleted = await service.deleteProfile(a.profile.id);
    expect(deleted).toEqual({ removed: true, sessionKept: true });
    expect(fs.existsSync(path.join(sessionDir, 'session.json'))).toBe(true);
    expect((await service.getProfiles()).map((p) => p.id)).toEqual([b.profile.id]);

    // 12. Xóa phiên A: B nguyên vẹn
    const otherDir = resolveProfileDataDir(b.profile.id);
    fs.mkdirSync(otherDir, { recursive: true });
    const sessionResult = await service.deleteProfileSession(a.profile.id);
    expect(sessionResult).toEqual({ deleted: true });
    expect(fs.existsSync(sessionDir)).toBe(false);
    expect(fs.existsSync(otherDir)).toBe(true);
  });

  it('fault: JSON hỏng giữ dữ liệu; socket cũ báo unknown', async () => {
    const service = makeService();
    await service.saveProfile({ name: 'F', url: 'https://a.vn' });
    const registryPath = resolveRegistryPath();
    const rawBefore = fs.readFileSync(registryPath, 'utf-8');
    fs.writeFileSync(registryPath, '{"profiles": [', 'utf-8');
    await expect(service.getProfiles()).rejects.toThrow(/REGISTRY_CORRUPT/);
    expect(fs.readFileSync(registryPath, 'utf-8')).toBe('{"profiles": [');
    void rawBefore;

    const stale = resolveSocketPath('cu');
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, 'socket-cu', 'utf-8');
    expect((await service.getRunnerStatus('cu')).state).toBe('unknown');
  });
});
