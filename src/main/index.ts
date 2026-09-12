import { app, BrowserWindow, Notification, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { parseCommandLineArgs, CommandLineError, getHelpText } from './cli';
import { ProfileManager, ProfileRegistryCorruptError } from './profile-manager';
import { resolveProfileDataDir, resolveDataDir } from './xdg-paths';
import { canCloseToTray, createRunnerWindow, restoreRunnerWindow } from './window-service';
import { PermissionManager } from './permission-manager';
import { RunnerControlServer } from './runner-control';
import { AttentionController, isValidXPathObservationState } from './notifier';
import { TrayManager } from './tray-manager';
import {
  DEFAULT_ZALO_UNREAD_BADGE_XPATH,
  Profile,
  WindowState,
  RunnerStatusData,
  XPathObservationState,
  XPathTestRequestParams,
  XPathEvaluationResult
} from '../shared/types';

function extractUserArgs(): string[] {
  if (app.isPackaged) {
    return process.argv.slice(1);
  }

  const args = process.argv.slice(2);
  if (args.length > 0) {
    const first = path.resolve(args[0]);
    const appPath = path.resolve(app.getAppPath());
    if (first === appPath || args[0] === '.' || args[0] === app.getAppPath()) {
      return args.slice(1);
    }
  }
  return args;
}

let mainWindow: BrowserWindow | null = null;
let runnerServer: RunnerControlServer | null = null;
let currentProfile: Profile | null = null;
let currentWindowState: WindowState | null = null;
let lastXPathState: XPathObservationState | null = null;
let attentionController: AttentionController | null = null;
let activeNotification: Notification | null = null;
let trayManager: TrayManager | null = null;
let quitting = false;
let runnerQuitFinalizing = false;
let lastLoggedError = '';
const pendingXPathTests = new Map<
  string,
  {
    resolve: (res: XPathEvaluationResult) => void;
    reject: (err: Error) => void;
  }
>();
const startupTime = Date.now();

// 1. Parse CLI arguments before ready
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

// 2. Setup per-instance userData, sessionData, and Linux identity before ready
const profileManager = new ProfileManager();

if (cliArgs.mode === 'profile' && cliArgs.profileId) {
  const profileId = cliArgs.profileId;
  let profile = profileManager.getProfile(profileId);

  // If profile is "zalo" and registry is empty, seed fixture profile
  if (!profile && profileId === 'zalo') {
    const registry = profileManager.loadRegistry();
    if (registry.profiles.length === 0) {
      profile = profileManager.createProfile({
        id: 'zalo',
        name: 'Zalo',
        url: 'https://chat.zalo.me',
        xpathConfig: {
          selector: DEFAULT_ZALO_UNREAD_BADGE_XPATH,
          mode: 'existence',
          pollIntervalMs: 3000
        }
      });
    }
  }

  if (!profile) {
    console.error(`[zaloview] Lỗi: Không tìm thấy profile với ID "${profileId}".`);
    app.exit(1);
    process.exit(1);
  }
  currentProfile = profile;

  const profileDataDir = resolveProfileDataDir(profileId);
  fs.mkdirSync(profileDataDir, { recursive: true, mode: 0o700 });
  app.setPath('userData', profileDataDir);
  app.setPath('sessionData', profileDataDir);
  app.setDesktopName(`zaloview-${profileId}`);
} else {
  const managerDataDir = path.join(resolveDataDir(), 'manager');
  fs.mkdirSync(managerDataDir, { recursive: true, mode: 0o700 });
  app.setPath('userData', managerDataDir);
  app.setPath('sessionData', managerDataDir);
  app.setDesktopName('zaloview');
}

// 3. Acquire Single-Instance lock for this specific profile or manager instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another instance of this profile/manager is already running
  app.exit(0);
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    restoreRunnerWindow(mainWindow);
  }
});

function createManagerWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    title: 'ZaloWebView Manager',
    autoHideMenuBar: true,
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

function restoreMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  restoreRunnerWindow(mainWindow);
}

function getNotificationBody(state: XPathObservationState): string {
  if (state.mode === 'badge_count') {
    return `${state.count} tin nhắn mới`;
  }
  if (state.mode === 'text_content') {
    const text = state.text.trim().slice(0, 160);
    return text || 'Có hoạt động mới';
  }
  return 'Có tin nhắn mới';
}

function createAttentionController(profile: Profile): AttentionController {
  return new AttentionController({
    profileId: profile.id,
    mode: profile.xpathConfig.mode,
    desktopConfig: profile.desktopConfig,
    effects: {
      setFlash: (enabled) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
          mainWindow.flashFrame(enabled);
        } catch (err: unknown) {
          console.warn('[ZaloWebView] Không thể cập nhật taskbar flash:', (err as Error).message);
        }
      },
      setBadge: (count) => {
        try {
          app.setBadgeCount(count);
        } catch (err: unknown) {
          console.warn('[ZaloWebView] Không thể cập nhật taskbar badge:', (err as Error).message);
        }
      },
      setTrayUnread: (unread, state) => {
        trayManager?.setUnread(unread, state);
      },
      showPopup: (state) => {
        if (!profile.desktopConfig.showDesktopNotification || !Notification.isSupported()) return false;
        try {
          const notification = new Notification({
            title: profile.name,
            body: getNotificationBody(state)
          });
          activeNotification = notification;
          notification.on('click', restoreMainWindow);
          notification.on('close', () => {
            if (activeNotification === notification) activeNotification = null;
          });
          notification.show();
          return true;
        } catch (err: unknown) {
          console.warn('[ZaloWebView] Không thể hiển thị desktop notification:', (err as Error).message);
          return false;
        }
      },
      closePopup: () => {
        if (!activeNotification) return;
        try {
          activeNotification.close();
        } finally {
          activeNotification = null;
        }
      }
    }
  });
}

function launchManager(): void {
  const args = app.isPackaged ? ['--manager'] : [app.getAppPath(), '--manager'];
  try {
    const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' });
    child.on('error', (err: Error) => {
      console.warn('[ZaloWebView] Không thể khởi chạy Manager:', err.message);
    });
    child.unref();
  } catch (err: unknown) {
    console.warn('[ZaloWebView] Không thể khởi chạy Manager:', (err as Error).message);
  }
}

function requestRunnerQuit(): void {
  if (quitting) return;
  quitting = true;
  attentionController?.dispose();
  trayManager?.destroy();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
  app.quit();
}

function initializeRunnerDesktopIntegration(profile: Profile): void {
  attentionController?.dispose();
  trayManager?.destroy();

  attentionController = createAttentionController(profile);
  trayManager = new TrayManager({
    profile,
    assetsDir: path.join(__dirname, '../assets'),
    onOpenWindow: restoreMainWindow,
    onClearAttention: () => {
      attentionController?.clear();
    },
    onOpenManager: launchManager,
    onQuitProfile: requestRunnerQuit
  });
  if (!trayManager.isReady()) {
    console.warn(
      `[ZaloWebView] Tray không khả dụng cho profile ${profile.id}; dùng lệnh "zaloview --profile ${profile.id}" để khôi phục cửa sổ.`
    );
  }

  if (!mainWindow || mainWindow.isDestroyed()) return;
  attentionController.setFocused(mainWindow.isFocused());
  mainWindow.on('focus', () => attentionController?.setFocused(true));
  mainWindow.on('blur', () => attentionController?.setFocused(false));
  mainWindow.on('close', (event) => {
    if (currentProfile && canCloseToTray(currentProfile, trayManager?.isReady() ?? false, quitting)) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

app.whenReady().then(async () => {
  if (cliArgs.mode === 'profile' && currentProfile) {
    const profileId = currentProfile.id;
    console.log(`[ZaloWebView] Khởi chạy Profile Runner: ${profileId}`);

    currentWindowState = profileManager.loadWindowState(profileId);
    const permissionManager = new PermissionManager(profileId);
    const preloadPath = path.join(__dirname, '../preload/webview-preload.js');

    mainWindow = createRunnerWindow({
      profile: currentProfile,
      windowState: currentWindowState,
      preloadPath,
      permissionManager,
      onWindowStateChange: (newState) => {
        currentWindowState = newState;
        profileManager.saveWindowState(profileId, newState);
      }
    });

    initializeRunnerDesktopIntegration(currentProfile);

    mainWindow.webContents.on('did-finish-load', () => {
      if (currentProfile?.xpathConfig) {
        mainWindow?.webContents.send('xpath:init', { config: currentProfile.xpathConfig });
      }
    });

    // Setup IPC listeners for XPath observation and testing
    ipcMain.on('xpath:state', (event, state: XPathObservationState) => {
      if (!mainWindow || !currentProfile) return;
      if (event.senderFrame !== mainWindow.webContents.mainFrame) {
        console.warn('[ZaloWebView] Từ chối xpath:state từ frame không phải mainFrame');
        return;
      }

      try {
        const senderOrigin = new URL(event.senderFrame.url).origin;
        const expectedOrigin = new URL(currentProfile.url).origin;
        if (senderOrigin !== expectedOrigin) {
          return;
        }
      } catch {
        return;
      }

      if (!isValidXPathObservationState(state, currentProfile.xpathConfig.mode)) {
        if (lastLoggedError !== 'invalid-state') {
          lastLoggedError = 'invalid-state';
          console.warn(`[ZaloWebView] Từ chối xpath:state không hợp lệ cho profile ${currentProfile.id}`);
        }
        return;
      }

      lastXPathState = state;
      attentionController?.onObservation(state);
    });

    ipcMain.on('xpath:error', (event, errData: { type: string; message: string; selector: string }) => {
      if (!mainWindow || !currentProfile) return;
      if (event.senderFrame !== mainWindow.webContents.mainFrame) return;

      const signature = `${errData.type}:${errData.message}`;
      if (signature !== lastLoggedError) {
        lastLoggedError = signature;
        console.warn(`[ZaloWebView] Cảnh báo XPath (${currentProfile.id}): ${errData.message}`);
      }
    });

    ipcMain.on(
      'xpath:test-result',
      (event, payload: { requestId: string; success: boolean; result?: XPathEvaluationResult; error?: string }) => {
        if (!mainWindow || !currentProfile) return;
        if (event.senderFrame !== mainWindow.webContents.mainFrame) return;

        const pending = pendingXPathTests.get(payload.requestId);
        if (pending) {
          pendingXPathTests.delete(payload.requestId);
          if (payload.result) {
            pending.resolve(payload.result);
          } else {
            pending.reject(new Error(payload.error || 'Lỗi thử nghiệm XPath.'));
          }
        }
      }
    );

    // Start local Unix domain socket control channel
    runnerServer = new RunnerControlServer(profileId, {
      onStatus: (): RunnerStatusData => ({
        status: 'running',
        profileId,
        url: currentProfile?.url || '',
        pid: process.pid,
        uptimeSeconds: Math.floor((Date.now() - startupTime) / 1000),
        windowState: currentWindowState || profileManager.loadWindowState(profileId),
        xpathState: lastXPathState || undefined,
        attention: attentionController?.getStatus()
      }),
      onShutdown: async () => {
        console.log(`[ZaloWebView] Nhận lệnh shutdown qua socket cho profile ${profileId}`);
        requestRunnerQuit();
      },
      onClearAttention: () => ({
        cleared: attentionController?.clear() ?? false
      }),
      onTestXPath: async (params: XPathTestRequestParams): Promise<XPathEvaluationResult> => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          throw new Error('RUNNER_CLOSED: Cửa sổ runner đã đóng.');
        }

        return new Promise<XPathEvaluationResult>((resolve, reject) => {
          const requestId = crypto.randomUUID();
          pendingXPathTests.set(requestId, { resolve, reject });

          const onNavigation = () => {
            if (pendingXPathTests.has(requestId)) {
              pendingXPathTests.delete(requestId);
              reject(new Error('PAGE_NAVIGATED: Trang web đã điều hướng trong khi đang thử nghiệm XPath.'));
            }
          };

          mainWindow?.webContents.once('did-start-navigation', onNavigation);

          mainWindow?.webContents.send('xpath:test', {
            requestId,
            selector: params.selector,
            mode: params.mode
          });
        });
      }
    });

    try {
      await runnerServer.start();
    } catch (err: unknown) {
      console.warn('[ZaloWebView] Cảnh báo khởi động socket control:', (err as Error).message);
    }
  } else {
    console.log('[ZaloWebView] Khởi chạy Manager Dashboard');
    mainWindow = createManagerWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (cliArgs.mode === 'profile' && currentProfile) {
        currentWindowState = profileManager.loadWindowState(currentProfile.id);
        const permissionManager = new PermissionManager(currentProfile.id);
        const preloadPath = path.join(__dirname, '../preload/webview-preload.js');

        mainWindow = createRunnerWindow({
          profile: currentProfile,
          windowState: currentWindowState,
          preloadPath,
          permissionManager,
          onWindowStateChange: (newState) => {
            currentWindowState = newState;
            profileManager.saveWindowState(currentProfile!.id, newState);
          }
        });
        initializeRunnerDesktopIntegration(currentProfile);
        mainWindow.webContents.on('did-finish-load', () => {
          if (currentProfile?.xpathConfig) {
            mainWindow?.webContents.send('xpath:init', { config: currentProfile.xpathConfig });
          }
        });
      } else {
        mainWindow = createManagerWindow();
      }
    }
  });
}).catch((err: Error) => {
  console.error('[ZaloWebView] Lỗi khởi động ứng dụng:', err);
  app.exit(1);
});

app.on('will-quit', (event) => {
  if (cliArgs.mode !== 'profile' || runnerQuitFinalizing) return;

  quitting = true;
  attentionController?.dispose();
  trayManager?.destroy();

  if (!runnerServer) return;
  event.preventDefault();
  runnerQuitFinalizing = true;
  const server = runnerServer;
  void server.stop().finally(() => {
    runnerServer = null;
    app.quit();
  });
});

app.on('before-quit', () => {
  if (cliArgs.mode === 'profile') quitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
