import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';
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
      windowState: createSampleWindowState(),
      configRevision: '2026-09-12T10:00:00.000Z',
      error: undefined
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

  it('clears attention idempotently and includes attention in status', async () => {
    let active = true;
    const server = new RunnerControlServer('acc4', {
      onStatus: () => ({
        status: 'running',
        profileId: 'acc4',
        url: 'https://chat.zalo.me',
        pid: process.pid,
        uptimeSeconds: 10,
        windowState: createSampleWindowState(),
        attention: { active, mode: 'badge_count', count: active ? 6 : 0 }
      }),
      onShutdown: () => {},
      onClearAttention: () => {
        const cleared = active;
        active = false;
        return { cleared };
      }
    });

    await server.start();
    const socketPath = server.getSocketPath();

    const status = await sendSocketCommand(socketPath, 'status');
    expect(status.success).toBe(true);
    expect((status.data as RunnerStatusData).attention).toEqual({ active: true, mode: 'badge_count', count: 6 });

    const clear = await sendSocketCommand(socketPath, 'clear-attention');
    expect(clear).toMatchObject({ success: true, data: { cleared: true } });

    const repeated = await sendSocketCommand(socketPath, 'clear-attention');
    expect(repeated).toMatchObject({ success: true, data: { cleared: false } });

    const invalid = await sendSocketCommand(socketPath, 'clear-attention', { unexpected: true });
    expect(invalid.success).toBe(false);
    expect(invalid.error).toMatch(/^INVALID_REQUEST:/);

    await server.stop();
  });

  it('reports NOT_SUPPORTED when clear-attention is unavailable', async () => {
    const server = new RunnerControlServer('acc5', {
      onStatus: () => ({
        status: 'running',
        profileId: 'acc5',
        url: 'https://chat.zalo.me',
        pid: process.pid,
        uptimeSeconds: 10,
        windowState: createSampleWindowState()
      }),
      onShutdown: () => {}
    });

    await server.start();
    const response = await sendSocketCommand(server.getSocketPath(), 'clear-attention');
    expect(response.success).toBe(false);
    expect(response.error).toMatch(/^NOT_SUPPORTED:/);
    await server.stop();
  });

  it('rejects a non-object JSON request without crashing the socket', async () => {
    const server = new RunnerControlServer('acc-invalid', {
      onStatus: () => ({
        status: 'running',
        profileId: 'acc-invalid',
        url: 'https://chat.zalo.me',
        pid: process.pid,
        uptimeSeconds: 10,
        windowState: createSampleWindowState()
      }),
      onShutdown: () => {}
    });
    await server.start();

    const response = await new Promise<string>((resolve, reject) => {
      const client = net.connect(server.getSocketPath(), () => client.write('null\n'));
      client.setTimeout(1000);
      client.on('data', (chunk) => {
        resolve(chunk.toString('utf8'));
        client.destroy();
      });
      client.on('error', reject);
      client.on('timeout', () => reject(new Error('socket timeout')));
    });
    expect(JSON.parse(response)).toMatchObject({ success: false, error: expect.stringMatching(/^INVALID_JSON:/) });
    await server.stop();
  });

  it('acknowledges repeated shutdown requests but invokes quit once after acknowledgement', async () => {
    const events: string[] = [];
    const server = new RunnerControlServer('acc6', {
      onStatus: () => ({
        status: 'running',
        profileId: 'acc6',
        url: 'https://chat.zalo.me',
        pid: process.pid,
        uptimeSeconds: 10,
        windowState: createSampleWindowState()
      }),
      onShutdown: () => {
        events.push('quit');
      }
    });

    await server.start();
    const socketPath = server.getSocketPath();
    const first = await sendSocketCommand(socketPath, 'shutdown');
    events.push(first.success ? 'ack-1' : 'error-1');
    const second = await sendSocketCommand(socketPath, 'shutdown');
    events.push(second.success ? 'ack-2' : 'error-2');

    expect(events).toEqual(['ack-1', 'ack-2']);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(events).toEqual(['ack-1', 'ack-2', 'quit']);

    await server.stop();
  });
});
