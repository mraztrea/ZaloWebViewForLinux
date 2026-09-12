import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  MAX_SOCKET_PAYLOAD_SIZE,
  SOCKET_TIMEOUT_MS,
  RunnerControlRequest,
  RunnerControlResponse,
  RunnerStatusData
} from '../shared/types';
import { resolveSocketPath } from './xdg-paths';

export interface RunnerControlServerOptions {
  onStatus: () => RunnerStatusData | Promise<RunnerStatusData>;
  onShutdown: () => void | Promise<void>;
}

export class RunnerControlServer {
  private server: net.Server | null = null;
  private socketPath: string;
  private profileId: string;
  private options: RunnerControlServerOptions;

  constructor(profileId: string, options: RunnerControlServerOptions) {
    this.profileId = profileId;
    this.socketPath = resolveSocketPath(profileId);
    this.options = options;
  }

  public getSocketPath(): string {
    return this.socketPath;
  }

  /**
   * Starts the Unix domain socket server.
   * If a stale socket file is present, verifies whether it is dead,
   * unlinks it if dead, or rejects if an active server is listening.
   */
  public async start(): Promise<void> {
    const socketDir = path.dirname(this.socketPath);
    fs.mkdirSync(socketDir, { recursive: true, mode: 0o700 });

    if (fs.existsSync(this.socketPath)) {
      const isAlive = await this.probeSocket(this.socketPath);
      if (isAlive) {
        throw new Error(`Kênh điều khiển socket của profile "${this.profileId}" đang hoạt động.`);
      }
      // Dead/stale socket file, remove it cleanly
      try {
        fs.unlinkSync(this.socketPath);
      } catch {
        // ignore unlink error
      }
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let buffer = '';

        socket.on('data', async (chunk) => {
          buffer += chunk.toString('utf-8');

          if (Buffer.byteLength(buffer) > MAX_SOCKET_PAYLOAD_SIZE) {
            socket.write(
              JSON.stringify({
                requestId: 'unknown',
                success: false,
                error: 'PAYLOAD_TOO_LARGE: Gói tin vượt quá 64 KiB.'
              }) + '\n'
            );
            socket.destroy();
            return;
          }

          const newlineIndex = buffer.indexOf('\n');
          if (newlineIndex === -1) {
            return;
          }

          const messageLine = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          let request: RunnerControlRequest;
          try {
            request = JSON.parse(messageLine);
          } catch {
            socket.write(
              JSON.stringify({
                requestId: 'unknown',
                success: false,
                error: 'INVALID_JSON: Cú pháp JSON không hợp lệ.'
              }) + '\n'
            );
            return;
          }

          const requestId = request.requestId || crypto.randomUUID();

          if (request.action === 'status') {
            try {
              const statusData = await this.options.onStatus();
              const response: RunnerControlResponse = {
                requestId,
                success: true,
                data: statusData
              };
              socket.write(JSON.stringify(response) + '\n');
            } catch (err: unknown) {
              const response: RunnerControlResponse = {
                requestId,
                success: false,
                error: (err as Error).message
              };
              socket.write(JSON.stringify(response) + '\n');
            }
          } else if (request.action === 'shutdown') {
            const response: RunnerControlResponse = {
              requestId,
              success: true,
              data: { acknowledged: true }
            };
            socket.write(JSON.stringify(response) + '\n', () => {
              // Trigger shutdown after response is sent
              setTimeout(() => {
                this.options.onShutdown();
              }, 50);
            });
          } else {
            const response: RunnerControlResponse = {
              requestId,
              success: false,
              error: `Hành động không được hỗ trợ: "${String(request.action)}".`
            };
            socket.write(JSON.stringify(response) + '\n');
          }
        });
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        try {
          fs.chmodSync(this.socketPath, 0o600);
        } catch {
          // ignore chmod error
        }
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        this.cleanupSocketFile();
        resolve();
        return;
      }

      this.server.close(() => {
        this.cleanupSocketFile();
        this.server = null;
        resolve();
      });
    });
  }

  private cleanupSocketFile(): void {
    try {
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
      }
    } catch {
      // ignore
    }
  }

  private probeSocket(socketPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const client = net.connect(socketPath);
      let settled = false;

      client.setTimeout(1000);

      client.on('connect', () => {
        if (!settled) {
          settled = true;
          client.destroy();
          resolve(true);
        }
      });

      client.on('error', () => {
        if (!settled) {
          settled = true;
          client.destroy();
          resolve(false);
        }
      });

      client.on('timeout', () => {
        if (!settled) {
          settled = true;
          client.destroy();
          resolve(false);
        }
      });
    });
  }
}

/**
 * Client helper to send commands to a runner control socket.
 */
export function sendSocketCommand(
  socketPath: string,
  action: 'status' | 'shutdown',
  params?: Record<string, unknown>,
  timeoutMs: number = SOCKET_TIMEOUT_MS
): Promise<RunnerControlResponse> {
  return new Promise((resolve, reject) => {
    const client = net.connect(socketPath);
    let buffer = '';
    const requestId = crypto.randomUUID();

    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error(`Timeout (${timeoutMs}ms) chờ phản hồi từ socket ${socketPath}`));
    }, timeoutMs);

    client.on('connect', () => {
      const payload: RunnerControlRequest = {
        requestId,
        action,
        params
      };
      client.write(JSON.stringify(payload) + '\n');
    });

    client.on('data', (chunk) => {
      buffer += chunk.toString('utf-8');
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        clearTimeout(timer);
        const line = buffer.slice(0, newlineIndex).trim();
        client.destroy();
        try {
          const parsed = JSON.parse(line) as RunnerControlResponse;
          resolve(parsed);
        } catch (err: unknown) {
          reject(new Error(`Lỗi phân tích phản hồi từ socket: ${(err as Error).message}`));
        }
      }
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
