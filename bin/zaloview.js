#!/usr/bin/env node

/**
 * ZaloWebView CLI Launcher
 * Resolves application root regardless of current working directory (cwd)
 * and spawns the Electron runtime with full argument forwarding.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const appRoot = path.resolve(__dirname, '..');
const userArgs = process.argv.slice(2);

// Check if running in development or packaged mode
const electronCli = path.join(appRoot, 'node_modules', 'electron', 'cli.js');

if (!fs.existsSync(electronCli)) {
  console.error('[zaloview] Lỗi: Không tìm thấy runtime Electron tại:', electronCli);
  console.error('[zaloview] Vui lòng chạy "npm install" tại thư mục ứng dụng:', appRoot);
  process.exit(127);
}

// Spawn Electron process with app root and forwarded arguments
const child = spawn(process.execPath, [electronCli, appRoot, ...userArgs], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env
});

// Forward POSIX termination signals to child process
const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
signals.forEach((signal) => {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
});

child.on('error', (err) => {
  console.error('[zaloview] Lỗi khởi chạy tiến trình:', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
