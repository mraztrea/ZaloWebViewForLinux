import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { RunnerControlServer } from '../src/main/runner-control';
import {
  RunnerControlRequest,
  RunnerControlResponse,
  XPathEvaluationResult,
  XPathTestRequestParams
} from '../src/shared/types';
import { RunnerControlServerOptions } from '../src/main/runner-control';

describe('RunnerControlServer: test-xpath action', () => {
  let tempDir: string;
  let server: RunnerControlServer;
  let socketPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaloview-test-xpath-'));
    process.env.XDG_RUNTIME_DIR = tempDir;
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function sendSocketRequest(request: RunnerControlRequest): Promise<RunnerControlResponse> {
    return new Promise((resolve, reject) => {
      const client = net.createConnection(socketPath, () => {
        client.write(JSON.stringify(request) + '\n');
      });

      let buffer = '';
      client.on('data', (chunk) => {
        buffer += chunk.toString('utf-8');
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          client.end();
          try {
            resolve(JSON.parse(line));
          } catch (err) {
            reject(err);
          }
        }
      });

      client.on('error', (err) => {
        reject(err);
      });
    });
  }

  it('rejects test-xpath when selector or mode is missing/invalid', async () => {
    server = new RunnerControlServer('test-profile', {
      onStatus: () => ({
        status: 'running',
        profileId: 'test-profile',
        url: 'https://test.com',
        pid: process.pid,
        uptimeSeconds: 10,
        windowState: { width: 800, height: 600, isMaximized: false }
      }),
      onShutdown: () => {},
      onTestXPath: async () => ({
        status: 'match',
        selector: '//div',
        mode: 'existence',
        hasElement: true,
        count: 1,
        textPreview: 'Test',
        executionTimeMs: 5
      })
    });

    await server.start();
    socketPath = server.getSocketPath();

    // 1. Missing selector
    const res1 = await sendSocketRequest({
      requestId: 'req-1',
      action: 'test-xpath',
      params: { selector: '', mode: 'existence' }
    });
    expect(res1.success).toBe(false);
    expect(res1.error).toContain('INVALID_REQUEST');

    // 2. Invalid mode
    const res2 = await sendSocketRequest({
      requestId: 'req-2',
      action: 'test-xpath',
      params: { selector: '//div', mode: 'invalid_mode' as unknown as 'existence' }
    });
    expect(res2.success).toBe(false);
    expect(res2.error).toContain('INVALID_REQUEST');
  });

  it('handles successful test-xpath request and returns evaluation result', async () => {
    const mockResult: XPathEvaluationResult = {
      status: 'match',
      selector: '//span[@class="badge"]',
      mode: 'badge_count',
      hasElement: true,
      count: 99,
      textPreview: '99+',
      executionTimeMs: 12
    };

    server = new RunnerControlServer('test-profile', {
      onStatus: () => ({
        status: 'running',
        profileId: 'test-profile',
        url: 'https://test.com',
        pid: process.pid,
        uptimeSeconds: 10,
        windowState: { width: 800, height: 600, isMaximized: false }
      }),
      onShutdown: () => {},
      onTestXPath: async (params) => {
        expect(params.selector).toBe('//span[@class="badge"]');
        expect(params.mode).toBe('badge_count');
        return mockResult;
      }
    });

    await server.start();
    socketPath = server.getSocketPath();

    const response = await sendSocketRequest({
      requestId: 'req-test-success',
      action: 'test-xpath',
      params: {
        selector: '//span[@class="badge"]',
        mode: 'badge_count'
      }
    });

    expect(response.requestId).toBe('req-test-success');
    expect(response.success).toBe(true);
    const data = response.data as XPathEvaluationResult;
    expect(data.status).toBe('match');
    expect(data.count).toBe(99);
    expect(data.textPreview).toBe('99+');
  });

  it('prevents concurrent test-xpath requests on the same runner', async () => {
    let completeFirstTest: ((res: XPathEvaluationResult) => void) | null = null;

    server = new RunnerControlServer('test-profile', {
      onStatus: () => ({
        status: 'running',
        profileId: 'test-profile',
        url: 'https://test.com',
        pid: process.pid,
        uptimeSeconds: 10,
        windowState: { width: 800, height: 600, isMaximized: false }
      }),
      onShutdown: () => {},
      onTestXPath: () => {
        return new Promise((resolve) => {
          completeFirstTest = resolve;
        });
      }
    });

    await server.start();
    socketPath = server.getSocketPath();

    // Start first test (it will hang until completeFirstTest is called)
    const firstPromise = sendSocketRequest({
      requestId: 'req-first',
      action: 'test-xpath',
      params: { selector: '//first', mode: 'existence' }
    });

    // Wait 50ms to ensure server received first request and marked isTestXPathPending = true
    await new Promise((r) => setTimeout(r, 50));

    // Send second request while first is still pending
    const secondRes = await sendSocketRequest({
      requestId: 'req-second',
      action: 'test-xpath',
      params: { selector: '//second', mode: 'existence' }
    });

    expect(secondRes.success).toBe(false);
    expect(secondRes.error).toContain('CONCURRENT_TEST_NOT_ALLOWED');

    // Finish first test
    if (completeFirstTest) {
      (completeFirstTest as (res: XPathEvaluationResult) => void)({
        status: 'match',
        selector: '//first',
        mode: 'existence',
        hasElement: true,
        count: 1,
        textPreview: '',
        executionTimeMs: 1
      });
    }

    const firstRes = await firstPromise;
    expect(firstRes.success).toBe(true);
  });

  it('aborts the pending XPath callback when the socket timeout fires', async () => {
    let receivedSignal: AbortSignal | undefined;
    const callback = async (...args: unknown[]): Promise<XPathEvaluationResult> => {
      receivedSignal = args[1] as AbortSignal | undefined;
      return new Promise<XPathEvaluationResult>(() => {
        // The server timeout must abort this pending operation.
      });
    };

    server = new RunnerControlServer('test-profile-timeout', {
      onStatus: () => ({
        status: 'running',
        profileId: 'test-profile-timeout',
        url: 'https://test.com',
        pid: process.pid,
        uptimeSeconds: 10,
        windowState: { width: 800, height: 600, isMaximized: false }
      }),
      onShutdown: () => {},
      onTestXPath: callback as unknown as NonNullable<RunnerControlServerOptions['onTestXPath']>
    });

    await server.start();
    socketPath = server.getSocketPath();

    const response = await sendSocketRequest({
      requestId: 'req-timeout',
      action: 'test-xpath',
      params: { selector: '//timeout', mode: 'existence' } as XPathTestRequestParams
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain('TIMEOUT');
    expect(receivedSignal?.aborted).toBe(true);
  }, 7000);
});
