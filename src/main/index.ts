import { app, BrowserWindow } from 'electron';
import * as path from 'node:path';
import { parseCommandLineArgs, CommandLineError, getHelpText } from './cli';

function extractUserArgs(): string[] {
  if (app.isPackaged) {
    return process.argv.slice(1);
  }

  // In development mode, arguments typically appear as:
  // [node/electron, electron_entry, app_root, ...user_args]
  // Find the index of app root or take argv from index 2 onwards
  const args = process.argv.slice(2);
  if (args.length > 0) {
    // If the first argument is the app directory (e.g. "." or absolute path), skip it
    const first = path.resolve(args[0]);
    const appPath = path.resolve(app.getAppPath());
    if (first === appPath || args[0] === '.' || args[0] === app.getAppPath()) {
      return args.slice(1);
    }
  }
  return args;
}

let mainWindow: BrowserWindow | null = null;

function createManagerWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    title: 'ZaloWebView Manager',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/webview-preload.js')
    }
  });

  const indexPath = path.join(__dirname, '../renderer/manager/index.html');
  win.loadFile(indexPath).catch((err: Error) => {
    console.error('[ZaloWebView] Không thể nạp giao diện Manager:', err);
  });

  return win;
}

function createRunnerWindow(profileId: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    title: `ZaloWebView Runner [${profileId}]`,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/webview-preload.js')
    }
  });

  // Task 1 placeholder runner view
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>ZaloWebView - ${profileId}</title>
        <style>
          body { font-family: sans-serif; background: #121417; color: #f0f3f6; padding: 40px; }
          h1 { color: #0068ff; }
        </style>
      </head>
      <body>
        <h1>Profile Runner: ${profileId}</h1>
        <p>Phiên runner khởi chạy thành công ở chế độ độc lập.</p>
      </body>
    </html>
  `;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`).catch((err: Error) => {
    console.error(`[ZaloWebView] Lỗi nạp runner ${profileId}:`, err);
  });

  return win;
}

// Parse command line arguments before ready
let cliArgs;
try {
  const rawArgs = extractUserArgs();
  cliArgs = parseCommandLineArgs(rawArgs, app.isPackaged);

  if (cliArgs.helpRequested) {
    console.log(getHelpText());
    app.exit(0);
    process.exit(0);
  }

  if (cliArgs.versionRequested) {
    console.log(`zaloview v${app.getVersion() || '0.1.0'}`);
    app.exit(0);
    process.exit(0);
  }
} catch (err: unknown) {
  if (err instanceof CommandLineError) {
    console.error(`[zaloview] Lỗi dòng lệnh: ${err.message}`);
    app.exit(err.exitCode);
    process.exit(err.exitCode);
  } else {
    console.error('[zaloview] Lỗi không xác định khi phân tích dòng lệnh:', err);
    app.exit(1);
    process.exit(1);
  }
}

app.whenReady().then(() => {
  if (cliArgs.mode === 'profile' && cliArgs.profileId) {
    console.log(`[ZaloWebView] Khởi chạy Profile Runner: ${cliArgs.profileId}`);
    mainWindow = createRunnerWindow(cliArgs.profileId);
  } else {
    console.log('[ZaloWebView] Khởi chạy Manager Dashboard');
    mainWindow = createManagerWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (cliArgs.mode === 'profile' && cliArgs.profileId) {
        mainWindow = createRunnerWindow(cliArgs.profileId);
      } else {
        mainWindow = createManagerWindow();
      }
    }
  });
}).catch((err: Error) => {
  console.error('[ZaloWebView] Lỗi khởi động ứng dụng:', err);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
