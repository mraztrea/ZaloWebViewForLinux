import { BrowserWindow, BrowserWindowConstructorOptions, screen, shell } from 'electron';
import { Profile, WindowState } from '../shared/types';
import { clampWindowBounds } from './screen-utils';
import { PermissionManager } from './permission-manager';

export type RunnerWindowRestoreTarget = Pick<
  BrowserWindow,
  'isMinimized' | 'restore' | 'isVisible' | 'show' | 'focus'
>;

export interface RunnerWindowStateSource {
  isMaximized: () => boolean;
  getBounds: () => { x: number; y: number; width: number; height: number };
  getNormalBounds?: () => { x: number; y: number; width: number; height: number };
}

export function restoreRunnerWindow(win: RunnerWindowRestoreTarget): void {
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

export function canCloseToTray(profile: Profile, trayReady: boolean, quitting: boolean): boolean {
  return !quitting && profile.desktopConfig.minimizeToTray && trayReady;
}

export function captureWindowState(win: RunnerWindowStateSource, previous: WindowState): WindowState {
  if (win.isMaximized()) return { ...previous, isMaximized: true };
  const bounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
  return { ...previous, ...bounds, isMaximized: false };
}

export interface CreateRunnerWindowOptions {
  profile: Profile;
  windowState: WindowState;
  preloadPath: string;
  permissionManager?: PermissionManager;
  onWindowStateChange?: (newState: WindowState) => void;
}

export function shouldAllowProfilePermission(
  profile: Profile,
  permission: string,
  requestingOrigin: string,
  permissionManager: PermissionManager
): boolean {
  if (permission === 'notifications' && profile.desktopConfig.showDesktopNotification) {
    try {
      if (new URL(requestingOrigin).origin === new URL(profile.url).origin) return false;
    } catch {
      return false;
    }
  }
  return permissionManager.isPermissionGranted(requestingOrigin, permission);
}

const ZALO_AUTH_HOST = 'id.zalo.me';

export function isAllowedProfileNavigation(profileUrl: string, targetUrl: string): boolean {
  try {
    const profile = new URL(profileUrl);
    const target = new URL(targetUrl);

    if (target.origin === profile.origin) {
      return true;
    }

    return target.protocol === 'https:' && target.hostname === ZALO_AUTH_HOST && target.port === '';
  } catch {
    return false;
  }
}

export function getChromeCompatibleUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\s+\S+\/\S+(?=\s+Chrome\/)/, '')
    .replace(/\s+Electron\/\S+/, '');
}

export function getPartitionForProfile(profileId: string): string {
  return `persist:zaloview_${profileId}`;
}

export function buildRunnerWindowOptions(
  profile: Profile,
  windowState: WindowState,
  preloadPath: string
): BrowserWindowConstructorOptions {
  return {
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    title: profile.name,
    autoHideMenuBar: true,
    show: false, // Show after ready-to-show to prevent visual flicker
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      partition: getPartitionForProfile(profile.id),
      preload: preloadPath
    }
  };
}

export function createRunnerWindow(options: CreateRunnerWindowOptions): BrowserWindow {
  const { profile, windowState, preloadPath, permissionManager, onWindowStateChange } = options;

  let currentNormalBounds = {
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height
  };

  // Clamp bounds against available displays
  try {
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const clamped = clampWindowBounds(currentNormalBounds, displays, primary);
    currentNormalBounds = {
      x: clamped.x,
      y: clamped.y,
      width: clamped.width,
      height: clamped.height
    };
  } catch {
    // Screen API may not be ready in some headless test environments
  }

  const winOptions = buildRunnerWindowOptions(
    profile,
    { ...currentNormalBounds, isMaximized: windowState.isMaximized },
    preloadPath
  );

  const win = new BrowserWindow(winOptions);
  win.webContents.setUserAgent(
    profile.userAgent || getChromeCompatibleUserAgent(win.webContents.getUserAgent())
  );

  if (windowState.isMaximized) {
    win.maximize();
  }

  // Debounced window state updater
  let saveTimer: NodeJS.Timeout | null = null;
  const notifyStateChange = () => {
    if (!onWindowStateChange) return;

    const nextState = captureWindowState(win, {
      ...currentNormalBounds,
      isMaximized: win.isMaximized()
    });
    if (!nextState.isMaximized) {
      currentNormalBounds = {
        x: nextState.x,
        y: nextState.y,
        width: nextState.width,
        height: nextState.height
      };
    }
    onWindowStateChange(nextState);
  };

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(notifyStateChange, 300);
  };

  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer);
    notifyStateChange();
  });

  // Session Security & Permissions
  const ses = win.webContents.session;

  if (permissionManager) {
    ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
      return shouldAllowProfilePermission(profile, permission, requestingOrigin, permissionManager);
    });

    ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
      let origin = '';
      try {
        origin = details.requestingUrl ? new URL(details.requestingUrl).origin : '';
      } catch {
        callback(false);
        return;
      }
      if (permission === 'media' || permission === 'notifications') {
        const granted = shouldAllowProfilePermission(profile, permission, origin, permissionManager);
        callback(granted);
        return;
      }
      // Default deny for unhandled permissions
      callback(false);
    });
  }

  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (isAllowedProfileNavigation(profile.url, targetUrl)) {
      return;
    }

    try {
      new URL(targetUrl);
      event.preventDefault();
      shell.openExternal(targetUrl).catch((err: Error) => {
        console.error('[ZaloWebView] Không thể mở URL ngoại vi:', err);
      });
    } catch {
      event.preventDefault();
    }
  });

  // Keep profile and Zalo auth popups in Electron; open other links externally.
  win.webContents.setWindowOpenHandler((details) => {
    if (isAllowedProfileNavigation(profile.url, details.url)) {
      return { action: 'allow' };
    }

    shell.openExternal(details.url).catch((err: Error) => {
      console.error('[ZaloWebView] Lỗi mở liên kết ngoài:', err);
    });
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.loadURL(profile.url).catch((err: Error) => {
    console.error(`[ZaloWebView] Lỗi nạp URL profile "${profile.id}":`, err.message);
  });

  return win;
}
