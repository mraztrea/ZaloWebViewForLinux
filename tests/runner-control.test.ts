import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTempXdgEnvironment, TestXdgEnvironment, createSampleWindowState } from './test-utils';
import { RunnerControlServer, sendSocketCommand } from '../src/main/runner-control';
import { RunnerStatusData } from '../src/shared/types';

describe('RunnerControlServer & Unix Socket Protocol', () => {
  let env: TestXdgEnvironment;

  beforeEach(() => {
    env = createTempXdgEnvironment();
    process.env.XDG_RUNTIME_DIR = env.runtimeDir;
    process.env.XDG_DATA_HOME = env.dataHome;
  });

  afterEach(() => {
    env.cleanup();
  });

  it('starts server, answers status query, and stops cleanly', async () => {
    let shutdownTriggered = false;

    const statusData: RunnerStatusData = {
      status: 'running',
      profileId: 'acc1',
      url: 'https://chat.zalo.me',
      pid: process.pid,
      uptimeSeconds: 120,
      windowState: createSampleWindowState()
    };

    const server = new RunnerControlServer('acc1', {
      onStatus: () => statusData,
      onShutdown: () => {
        shutdownTriggered = true;
      }
    });

    await server.start();
    const socketPath = server.getSocketPath();
    expect(fs.existsSync(socketPath)).toBe(true);

    // Query status
    const statusRes = await sendSocketCommand(socketPath, 'status');
    expect(statusRes.success).toBe(true);
    expect(statusRes.data).toEqual(statusData);

    // Query shutdown
    const shutdownRes = await sendSocketCommand(socketPath, 'shutdown');
    expect(shutdownRes.success).toBe(true);
    expect(shutdownRes.data).toEqual({ acknowledged: true });

    // Wait for shutdown callback
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(shutdownTriggered).toBe(true);

    await server.stop();
    expect(fs.existsSync(socketPath)).toBe(false);
  });

  it('detects and cleans up dead/stale socket file on startup', async () => {
    const server = new RunnerControlServer('acc2', {
      onStatus: () => ({
        status: 'running',
        profileId: 'acc2',
        url: 'https://chat.zalo.me',
        pid: process.pid,
        uptimeSeconds: 10,
        windowState: createSampleWindowState()
      }),
      onShutdown: () => {}
    });

    const socketPath = server.getSocketPath();
    fs.mkdirSync(path.dirname(socketPath), { recursive: true });
    // Write an invalid/stale socket file that has no listener
    fs.writeFileSync(socketPath, 'stale-data');

    // Server should probe, identify it as dead, unlink it, and start normally
    await server.start();
    expect(fs.existsSync(socketPath)).toBe(true);

    const res = await sendSocketCommand(socketPath, 'status');
    expect(res.success).toBe(true);

    await server.stop();
  });

  it('rejects starting when an active server is already listening', async () => {
    const s1 = new RunnerControlServer('acc3', {
      onStatus: () => ({
        status: 'running',
        profileId: 'acc3',
        url: 'https://chat.zalo.me',
        pid: process.pid,
        uptimeSeconds: 10,
        windowState: createSampleWindowState()
      }),
      onShutdown: () => {}
    });

    await s1.start();

    const s2 = new RunnerControlServer('acc3', {
      onStatus: () => ({
        status: 'running',
        profileId: 'acc3',
        url: 'https://chat.zalo.me',
        pid: process.pid,
        uptimeSeconds: 10,
        windowState: createSampleWindowState()
      }),
      onShutdown: () => {}
    });

    await expect(s2.start()).rejects.toThrow('đang hoạt động');

    await s1.stop();
  });
});
