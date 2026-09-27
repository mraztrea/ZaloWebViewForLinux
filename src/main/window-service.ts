import { BrowserWindow, BrowserWindowConstructorOptions, clipboard, Menu, screen, shell } from 'electron';
import type { ContextMenuParams, MenuItemConstructorOptions, WebContents } from 'electron';
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
  /** Đường dẫn icon PNG của ứng dụng; tùy chọn vì dev environment có thể thiếu. */
  appIconPath?: string;
  permissionManager?: PermissionManager;
  /** Hỏi người dùng khi origin xin camera/micro lần đầu; thiếu thì mặc định từ chối. */
  confirmPermission?: PermissionPrompt;
  onWindowStateChange?: (newState: WindowState) => void;
}

export type PermissionPrompt = (
  origin: string,
  permission: string
) => Promise<{ granted: boolean; remember: boolean }>;

/**
 * Quyết định một yêu cầu quyền từ trang web. Camera/micro chưa có quyết định
 * lưu sẵn thì hỏi người dùng; chỉ lưu khi người dùng chọn ghi nhớ.
 */
export async function requestProfilePermission(
  profile: Profile,
  permission: string,
  origin: string,
  permissionManager: PermissionManager,
  confirm?: PermissionPrompt
): Promise<boolean> {
  if (
    permission !== 'media'
    || !confirm
    || !origin
    || permissionManager.getPermission(origin, permission) !== undefined
  ) {
    return shouldAllowProfilePermission(profile, permission, origin, permissionManager);
  }
  const { granted, remember } = await confirm(origin, permission);
  if (remember) permissionManager.setPermission(origin, permission, granted);
  return granted;
}

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Chỉ chuyển cho trình duyệt hệ thống các URL web/mailto; chặn file:, smb:, scheme lạ. */
export function openExternalSafe(targetUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return;
  }
  if (!EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    console.warn(`[ZaloWebView] Chặn mở liên kết ngoài với giao thức ${parsed.protocol}`);
    return;
  }
  shell.openExternal(parsed.href).catch((err: Error) => {
    console.error('[ZaloWebView] Không thể mở URL ngoại vi:', err);
  });
}

type GuardedContents = Pick<WebContents, 'on' | 'setWindowOpenHandler'>;

/** Giữ điều hướng trong origin profile/đăng nhập Zalo; các liên kết khác mở ngoài. */
export function attachNavigationGuard(contents: GuardedContents, profileUrl: string): void {
  contents.on('will-navigate', (event, targetUrl) => {
    if (isAllowedProfileNavigation(profileUrl, targetUrl)) return;
    event.preventDefault();
    openExternalSafe(targetUrl);
  });

  contents.setWindowOpenHandler((details) => {
    if (isAllowedProfileNavigation(profileUrl, details.url)) {
      return { action: 'allow' };
    }
    openExternalSafe(details.url);
    return { action: 'deny' };
  });
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
  preloadPath: string,
  appIconPath?: string
): BrowserWindowConstructorOptions {
  return {
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    title: profile.name,
    autoHideMenuBar: true,
    icon: appIconPath,
    show: false, // Show after ready-to-show to prevent visual flicker
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      partition: getPartitionForProfile(profile.id),
      preload: preloadPath
    }
  };
}

export type ContextMenuInput = Pick<
  ContextMenuParams,
  'isEditable' | 'editFlags' | 'selectionText' | 'linkURL' | 'mediaType' | 'hasImageContents' | 'x' | 'y'
>;

export function buildContextMenuTemplate(
  params: ContextMenuInput,
  contents: Pick<WebContents, 'copyImageAt'>
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  if (params.isEditable) {
    items.push(
      { label: 'Cắt', role: 'cut', enabled: params.editFlags.canCut },
      { label: 'Sao chép', role: 'copy', enabled: params.editFlags.canCopy },
      { label: 'Dán', role: 'paste', enabled: params.editFlags.canPaste },
      { label: 'Chọn tất cả', role: 'selectAll', enabled: params.editFlags.canSelectAll }
    );
  } else if (params.selectionText.trim()) {
    items.push({ label: 'Sao chép', role: 'copy' });
  }
  if (params.linkURL) {
    items.push({ label: 'Sao chép liên kết', click: () => clipboard.writeText(params.linkURL) });
  }
  if (params.mediaType === 'image' && params.hasImageContents) {
    items.push({ label: 'Sao chép ảnh', click: () => contents.copyImageAt(params.x, params.y) });
  }
  return items;
}

export function createRunnerWindow(options: CreateRunnerWindowOptions): BrowserWindow {
  const {
    profile,
    windowState,
    preloadPath,
    appIconPath,
    permissionManager,
    confirmPermission,
    onWindowStateChange
  } = options;
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
    preloadPath,
    appIconPath
  );

  const win = new BrowserWindow(winOptions);
  const userAgent = profile.userAgent || getChromeCompatibleUserAgent(win.webContents.getUserAgent());
  // Đặt cho cả session để popup đăng nhập cũng dùng UA tương thích Chrome.
  win.webContents.session.setUserAgent(userAgent);
  win.webContents.setUserAgent(userAgent);

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

    // Gộp các yêu cầu đồng thời cùng origin/quyền vào một hộp thoại.
    const pendingPrompts = new Map<string, Promise<boolean>>();
    ses.setPermissionRequestHandler((_webContents, permission, callback, details) => {
      let origin = '';
      try {
        origin = details.requestingUrl ? new URL(details.requestingUrl).origin : '';
      } catch {
        callback(false);
        return;
      }
      if (permission !== 'media' && permission !== 'notifications') {
        // Default deny for unhandled permissions
        callback(false);
        return;
      }
      const key = `${origin}|${permission}`;
      let pending = pendingPrompts.get(key);
      if (!pending) {
        pending = requestProfilePermission(profile, permission, origin, permissionManager, confirmPermission)
          .catch(() => false)
          .finally(() => pendingPrompts.delete(key));
        pendingPrompts.set(key, pending);
      }
      void pending.then(callback);
    });
  }

  attachNavigationGuard(win.webContents, profile.url);
  // Popup đăng nhập được phép mở trong Electron cũng phải chịu cùng guard.
  win.webContents.on('did-create-window', (child) => {
    attachNavigationGuard(child.webContents, profile.url);
  });

  if (profile.desktopConfig.enableContextMenu) {
    win.webContents.on('context-menu', (_event, params) => {
      const template = buildContextMenuTemplate(params, win.webContents);
      if (template.length > 0) Menu.buildFromTemplate(template).popup({ window: win });
    });
  }

  win.once('ready-to-show', () => {
    win.show();
  });

  win.loadURL(profile.url).catch((err: Error) => {
    console.error(`[ZaloWebView] Lỗi nạp URL profile "${profile.id}":`, err.message);
  });

  return win;
}
