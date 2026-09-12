/**
 * Shared Type Definitions for ZaloWebView (Linux Webview Manager)
 */

export const PROFILE_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_PROFILE_ID_LENGTH = 64;
export const MAX_PROFILE_NAME_LENGTH = 120;
export const MAX_XPATH_SELECTOR_LENGTH = 1000;

export const MIN_WINDOW_WIDTH = 400;
export const MIN_WINDOW_HEIGHT = 300;
export const DEFAULT_WINDOW_WIDTH = 1024;
export const DEFAULT_WINDOW_HEIGHT = 768;

export const MIN_POLL_INTERVAL_MS = 1000;
export const MAX_POLL_INTERVAL_MS = 60000;
export const DEFAULT_POLL_INTERVAL_MS = 3000;

export const MAX_SOCKET_PAYLOAD_SIZE = 65536; // 64 KiB
export const SOCKET_TIMEOUT_MS = 5000;

export interface CommandLineArgs {
  mode: 'manager' | 'profile';
  profileId: string | null;
  rawArgs: string[];
  isPackaged: boolean;
  helpRequested?: boolean;
  versionRequested?: boolean;
}

export interface BuildTargetConfig {
  name: 'main' | 'preload' | 'renderer';
  entryPoint: string;
  outfile: string;
  platform: 'node' | 'browser';
  format: 'cjs' | 'esm' | 'iife';
  bundle: boolean;
  external?: string[];
  sourcemap: boolean;
}

export interface LauncherProcessState {
  appRoot: string;
  electronBinary: string;
  childPid?: number;
  exitCode: number | null;
  exitSignal: string | null;
}

/**
 * Profile and Configuration contracts (aligned with design_specification.md)
 */
export interface XPathConfig {
  selector: string; // empty string disables observer
  mode: 'badge_count' | 'text_content' | 'existence';
  pollIntervalMs: number; // 1000..60000 ms, default 3000
}

export interface DesktopIntegrationConfig {
  flashTaskbar: boolean;
  showTaskbarBadge: boolean;
  minimizeToTray: boolean;
  showDesktopNotification: boolean;
  createDesktopShortcut: boolean;
}

export interface Profile {
  id: string; // immutable, slug regex, max 64 chars
  name: string; // non-empty, max 120 chars
  url: string; // HTTP(S), no embedded credentials
  iconPath?: string;
  userAgent?: string;
  xpathConfig: XPathConfig;
  desktopConfig: DesktopIntegrationConfig;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

export interface ProfileRegistry {
  schemaVersion: 1;
  profiles: Profile[];
}

/**
 * Permissions Store
 */
export interface PermissionRecord {
  granted: boolean;
  updatedAt: string;
}

export interface PermissionStore {
  [origin: string]: {
    [permission: string]: PermissionRecord;
  };
}

/**
 * Runner Control Socket Contracts
 */
export interface RunnerControlRequest {
  requestId: string;
  action: 'status' | 'shutdown';
  params?: Record<string, unknown>;
}

export interface RunnerStatusData {
  status: 'starting' | 'running' | 'error';
  profileId: string;
  url: string;
  pid: number;
  uptimeSeconds: number;
  windowState: WindowState;
}

export interface RunnerControlResponse {
  requestId: string;
  success: boolean;
  data?: RunnerStatusData | Record<string, unknown>;
  error?: string;
}
