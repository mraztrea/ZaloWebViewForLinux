/**
 * Shared Type Definitions for ZaloWebView (Linux Webview Manager)
 */

export const PROFILE_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_PROFILE_ID_LENGTH = 64;
export const MAX_PROFILE_NAME_LENGTH = 120;
export const MAX_XPATH_SELECTOR_LENGTH = 1000;
export const MAX_XPATH_TEXT_PREVIEW_LENGTH = 500;
export const DEFAULT_ZALO_UNREAD_BADGE_XPATH =
  "//div[contains(concat(' ', normalize-space(@class), ' '), ' leftbar-unread-badge ')]";

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
export type XPathObservationMode = 'badge_count' | 'text_content' | 'existence';

export interface XPathConfig {
  selector: string; // empty string disables observer
  mode: XPathObservationMode;
  pollIntervalMs: number; // 1000..60000 ms, default 3000
}

export interface XPathObservationState {
  mode: XPathObservationMode;
  hasElement: boolean;
  count: number;
  text: string;
  changedForAlert: boolean;
  timestamp: number;
}

export interface AttentionStateData {
  active: boolean;
  mode: XPathObservationMode;
  count: number;
}

export interface XPathBaselineRecord {
  hasElement: boolean;
  count: number;
  fullText: string;
  updatedAt: number;
}

export type XPathEvaluationStatus =
  | 'match'
  | 'no_match'
  | 'invalid_selector'
  | 'invalid_data'
  | 'error';

export interface XPathEvaluationResult {
  status: XPathEvaluationStatus;
  selector: string;
  mode: XPathObservationMode;
  hasElement: boolean;
  count: number;
  textPreview: string;
  error?: string;
  executionTimeMs: number;
}

export interface XPathTestRequestParams {
  selector: string;
  mode: XPathObservationMode;
}

export interface DesktopIntegrationConfig {
  flashTaskbar: boolean;
  showTaskbarBadge: boolean;
  minimizeToTray: boolean;
  showDesktopNotification: boolean;
  createDesktopShortcut: boolean;
}

export type ShortcutSyncResult =
  | { status: 'created' | 'updated' | 'removed' | 'unchanged'; path: string }
  | { status: 'error'; path: string; message: string };

/**
 * Manager contracts (Phase 5). Thêm sau đối chiếu schema theo spec phase 5.
 */
export interface ManagerSaveResult {
  profile: Profile;
  shortcut: ShortcutSyncResult;
  /** true khi runner đang dùng bản cấu hình cũ; null khi không lấy được revision. */
  restartRequired: boolean | null;
}

export type ManagerRunnerState = 'running' | 'stopped' | 'unknown';

export interface ManagerRunnerStatus {
  state: ManagerRunnerState;
  /** Kèm theo khi liên lạc được với runner. */
  data?: RunnerStatusData;
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
  action: 'status' | 'shutdown' | 'clear-attention' | 'test-xpath';
  params?: XPathTestRequestParams | Record<string, unknown>;
}

export interface RunnerStatusData {
  status: 'starting' | 'running' | 'error';
  profileId: string;
  url: string;
  pid: number;
  uptimeSeconds: number;
  windowState: WindowState;
  /** Timestamp/revision of the profile snapshot loaded by this runner. */
  configRevision?: string;
  /** Main-frame loading error, when status is error. */
  error?: string;
  xpathState?: XPathObservationState;
  attention?: AttentionStateData;
}

export interface RunnerControlResponse {
  requestId: string;
  success: boolean;
  data?: RunnerStatusData | XPathEvaluationResult | Record<string, unknown>;
  error?: string;
}
