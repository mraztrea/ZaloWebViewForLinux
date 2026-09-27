/**
 * Manager IPC Handlers (Main Process)
 *
 * Lớp điều phối mỏng giữa bridge Manager (preload) và các service hiện có:
 * ProfileManager, socket runner (sendSocketCommand), desktop-service và
 * icon-fetcher. Mọi validation sender/payload diễn ra trước khi chạm
 * storage hoặc socket.
 *
 * Thiết kế cho phép unit test không cần Electron: ManagerService nhận mọi
 * dependency qua constructor; wiring Electron nằm ở registerManagerHandlers.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ProfileManager } from './profile-manager';
import { validateProfileId, validateProfileName, validateProfileUrl, validateXPathConfig, validateDesktopConfig } from './profile-validator';
import { resolveDataDir, resolveProfileDataDir, resolveSocketPath } from './xdg-paths';
import { atomicWriteFile } from './atomic-writer';
import { buildExportBundle, parseImportBundle, MAX_IMPORT_FILE_BYTES, type ParseImportResult } from './profile-transfer';
import { sendSocketCommand, XPATH_TEST_TIMEOUT_MS } from './runner-control';
import { removeProfileShortcut, syncProfileShortcut } from './desktop-service';
import {
  fetchIconBuffer,
  ICON_MAX_DIMENSION,
  ICON_MAX_BYTES,
  IconFetchError,
  type FetchedIcon,
  type ImageDecoder
} from './icon-fetcher';
import type {
  ExportResult,
  ImportReport,
  ManagerRunnerStatus,
  ManagerSaveResult,
  Profile,
  RunnerControlResponse,
  RunnerStatusData,
  ShortcutSyncResult,
  XPathEvaluationResult,
  XPathEvaluationStatus,
  XPathObservationMode
} from '../shared/types';
import { MAX_XPATH_SELECTOR_LENGTH } from '../shared/types';
import type { SaveProfileInput } from '../preload/manager-preload';

export const MANAGER_CHANNELS = {
  getProfiles: 'zaloview:get-profiles',
  saveProfile: 'zaloview:save-profile',
  deleteProfile: 'zaloview:delete-profile',
  launchProfile: 'zaloview:launch-profile',
  toggleShortcut: 'zaloview:toggle-shortcut',
  getRunnerStatus: 'zaloview:get-runner-status',
  clearAttention: 'zaloview:clear-attention',
  testXPath: 'zaloview:test-xpath',
  chooseIcon: 'zaloview:choose-icon',
  fetchIcon: 'zaloview:fetch-icon',
  deleteProfileSession: 'zaloview:delete-profile-session',
  exportProfiles: 'zaloview:export-profiles',
  importProfiles: 'zaloview:import-profiles'
} as const;

export class ManagerError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'ManagerError';
    this.code = code;
  }
}

export interface LaunchResult {
  requested: true;
  profileId: string;
}

export interface ToggleShortcutResult {
  saved: Profile;
  shortcut: ShortcutSyncResult;
}

export interface ClearAttentionResult {
  cleared: boolean;
}

export interface IconResult {
  path: string;
  fallback: boolean;
  reason?: string;
}

export interface DeleteProfileResult {
  removed: true;
  sessionKept: true;
}

export interface DeleteSessionResult {
  deleted: boolean;
  cancelled?: boolean;
}

export interface ManagerServiceDeps {
  profileManager?: ProfileManager;
  sendCommand?: (
    socketPath: string,
    action: 'status' | 'shutdown' | 'clear-attention' | 'test-xpath',
    params?: Record<string, unknown>,
    timeoutMs?: number
  ) => Promise<RunnerControlResponse>;
  syncShortcut?: (profile: Profile, launcherPath: string) => Promise<ShortcutSyncResult>;
  removeShortcut?: (profileId: string) => Promise<ShortcutSyncResult>;
  launcherPath?: string;
  spawnRunner?: (args: string[]) => void | number | Promise<void | number>;
  execPath?: string;
  appPath?: string;
  isPackaged?: boolean;
  isProcessAlive?: (pid: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  confirmAction?: (message: string, detail: string) => Promise<boolean>;
  showOpenDialog?: () => Promise<string | null>;
  showSaveDialog?: (defaultName: string) => Promise<string | null>;
  showJsonOpenDialog?: () => Promise<string | null>;
  decodeImage?: ImageDecoder;
  fetchImpl?: typeof fetch;
  iconDir?: string;
  fallbackIconPath?: string;
  shutdownPollIntervalMs?: number;
  shutdownTimeoutMs?: number;
}

/**
 * Đường launcher mặc định.
 *
 * - Chế độ packaged (bundle/RPM): binary đang chạy chính là launcher.
 * - Chế độ dev (đường dẫn cài cấp người dùng theo docs/installation.md).
 */
export function resolveLauncherPath(isPackaged = false): string {
  if (isPackaged) {
    try {
      return fs.realpathSync(process.execPath);
    } catch {
      return process.execPath;
    }
  }
  return path.join(os.homedir(), '.local', 'opt', 'zaloview', 'zaloview');
}

function assertRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ManagerError('VALIDATION_ERROR', `${field} phải là một đối tượng.`);
  }
}

function assertAllowedFields(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new ManagerError('VALIDATION_ERROR', 'Payload chứa trường không được phép.');
  }
}

function validateSaveInput(value: unknown): asserts value is SaveProfileInput {
  assertRecord(value, 'profile');
  assertAllowedFields(value, ['id', 'name', 'url', 'iconPath', 'userAgent', 'xpathConfig', 'desktopConfig']);
  if (value.id !== undefined) assertValidProfileId(value.id);
  for (const field of ['iconPath', 'userAgent']) {
    if (value[field] !== undefined && typeof value[field] !== 'string') {
      throw new ManagerError('VALIDATION_ERROR', `${field} phải là chuỗi.`);
    }
  }
  if (value.xpathConfig !== undefined) {
    assertRecord(value.xpathConfig, 'xpathConfig');
    assertAllowedFields(value.xpathConfig, ['selector', 'mode', 'pollIntervalMs']);
    const config = value.xpathConfig;
    if ((config.selector !== undefined && typeof config.selector !== 'string')
      || (config.pollIntervalMs !== undefined && !Number.isInteger(config.pollIntervalMs))) {
      throw new ManagerError('VALIDATION_ERROR', 'Selector phải là chuỗi, chu kỳ quét phải là số nguyên.');
    }
    if (config.mode !== undefined) assertXPathMode(config.mode);
  }
  if (value.desktopConfig !== undefined) {
    assertRecord(value.desktopConfig, 'desktopConfig');
    assertAllowedFields(value.desktopConfig, ['flashTaskbar', 'showTaskbarBadge', 'minimizeToTray', 'showDesktopNotification', 'createDesktopShortcut', 'enableContextMenu']);
  }
  try {
    validateProfileName(value.name);
    validateProfileUrl(value.url);
    validateXPathConfig(value.xpathConfig);
    validateDesktopConfig(value.desktopConfig);
  } catch (err: unknown) {
    throw new ManagerError('VALIDATION_ERROR', (err as Error).message);
  }
}

function assertValidProfileId(value: unknown): string {
  try {
    return validateProfileId(value);
  } catch (err: unknown) {
    throw new ManagerError('VALIDATION_ERROR', (err as Error).message);
  }
}

function assertBoolean(value: unknown, field: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new ManagerError('VALIDATION_ERROR', `${field} phải là boolean.`);
  }
}

const XPATH_MODES: XPathObservationMode[] = ['badge_count', 'text_content', 'existence'];

function assertXPathMode(value: unknown): asserts value is XPathObservationMode {
  if (typeof value !== 'string' || !XPATH_MODES.includes(value as XPathObservationMode)) {
    throw new ManagerError('VALIDATION_ERROR', `mode phải là một trong: ${XPATH_MODES.join(', ')}.`);
  }
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ManagerError('VALIDATION_ERROR', 'Trường chuỗi không đúng định dạng.');
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Tên tệp xuất dạng zaloview-profiles-YYYYMMDD.json. */
function formatDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export interface ManagerFrameRef {
  url?: string;
}

export interface ManagerIpcEvent {
  senderFrame?: ManagerFrameRef | null;
}

export interface ManagerWindowRef {
  webContents: {
    mainFrame: ManagerFrameRef;
  };
}

const MANAGER_PAGE_URL = pathToFileURL(path.join(__dirname, '../renderer/manager/index.html')).href;

/**
 * Kiểm tra event IPC đến từ frame chính của cửa sổ Manager local.
 * Từ chối website, iframe và mọi URL không phải trang Manager local.
 */
export function isTrustedManagerEvent(event: ManagerIpcEvent, win: ManagerWindowRef | null): boolean {
  if (!win) return false;
  const frame = event.senderFrame;
  if (!frame || frame !== win.webContents.mainFrame) return false;
  const rawUrl = frame.url;
  if (typeof rawUrl !== 'string' || !rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.href === MANAGER_PAGE_URL;
  } catch {
    return false;
  }
}

export interface IpcMainLike {
  handle(channel: string, listener: (event: ManagerIpcEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export class ManagerService {
  protected readonly deps: Required<ManagerServiceDeps>;
  private readonly launchingRunners = new Map<string, number | undefined>();
  private readonly busyProfiles = new Set<string>();

  constructor(deps: ManagerServiceDeps = {}) {
    this.deps = {
      profileManager: deps.profileManager ?? new ProfileManager(),
      sendCommand: deps.sendCommand ?? sendSocketCommand,
      syncShortcut: deps.syncShortcut ?? syncProfileShortcut,
      removeShortcut: deps.removeShortcut ?? removeProfileShortcut,
      launcherPath: deps.launcherPath ?? resolveLauncherPath(deps.isPackaged ?? false),
      spawnRunner: deps.spawnRunner ?? ((args) => defaultSpawnRunner(args, deps.execPath ?? process.execPath)),
      execPath: deps.execPath ?? process.execPath,
      appPath: deps.appPath ?? '',
      isPackaged: deps.isPackaged ?? false,
      isProcessAlive: deps.isProcessAlive ?? defaultIsProcessAlive,
      sleep: deps.sleep ?? defaultSleep,
      confirmAction: deps.confirmAction ?? (async () => false),
      showOpenDialog: deps.showOpenDialog ?? (async () => null),
      showSaveDialog: deps.showSaveDialog ?? (async () => null),
      showJsonOpenDialog: deps.showJsonOpenDialog ?? (async () => null),
      decodeImage: deps.decodeImage ?? defaultDecodeImage,
      fetchImpl: deps.fetchImpl ?? fetch,
      iconDir: deps.iconDir ?? path.join(resolveDataDir(), 'icons'),
      fallbackIconPath: deps.fallbackIconPath ?? defaultFallbackIconPath(),
      shutdownPollIntervalMs: deps.shutdownPollIntervalMs ?? 200,
      shutdownTimeoutMs: deps.shutdownTimeoutMs ?? 5000
    };
  }

  public async getProfiles(): Promise<Profile[]> {
    try {
      return this.deps.profileManager.loadRegistry().profiles;
    } catch (err: unknown) {
      throw new ManagerError(
        'REGISTRY_CORRUPT',
        `Không thể đọc danh sách profile: ${(err as Error).message}`
      );
    }
  }

  public async saveProfile(input: SaveProfileInput): Promise<ManagerSaveResult> {
    validateSaveInput(input);
    const raw = input;
    if (raw.id !== undefined) this.assertProfileAvailable(assertValidProfileId(raw.id));
    let icon = asOptionalString(raw.iconPath);
    let iconWarning: string | undefined;
    if (icon && icon !== this.deps.fallbackIconPath) {
      try {
        const relative = path.relative(path.resolve(this.deps.iconDir), icon);
        if (!path.isAbsolute(icon) || !relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error();
        if (!fs.existsSync(icon)) {
          icon = this.deps.fallbackIconPath;
          iconWarning = 'Biểu tượng đã mất, dùng biểu tượng dự phòng.';
        } else {
          const realRelative = path.relative(fs.realpathSync(this.deps.iconDir), fs.realpathSync(icon));
          if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error();
        }
      } catch {
        throw new ManagerError('VALIDATION_ERROR', 'Hãy chọn hoặc tải lại biểu tượng trong vùng icon của ứng dụng.');
      }
    }
    if (typeof raw.name !== 'string' || typeof raw.url !== 'string') {
      throw new ManagerError('VALIDATION_ERROR', 'name và url là bắt buộc và phải là chuỗi.');
    }

    let saved: Profile;
    try {
      const rawId = raw.id;
      if (rawId === undefined) {
        saved = this.deps.profileManager.createProfile({
          name: raw.name,
          url: raw.url,
          iconPath: icon,
          userAgent: asOptionalString(raw.userAgent),
          xpathConfig: raw.xpathConfig as Profile['xpathConfig'],
          desktopConfig: raw.desktopConfig as Profile['desktopConfig']
        });
      } else {
        const id = assertValidProfileId(rawId);
        const existing = this.deps.profileManager.getProfile(id);
        if (!existing) {
          throw new ManagerError('NOT_FOUND', `Không tìm thấy profile với ID: "${id}".`);
        }
        const updates: {
          name?: string;
          url?: string;
          iconPath?: string;
          xpathConfig?: Profile['xpathConfig'];
          desktopConfig?: Profile['desktopConfig'];
        } = { name: raw.name, url: raw.url };
        // userAgent bất biến khi sửa: luôn giữ giá trị cũ, bỏ qua renderer gửi.
        if (Object.hasOwn(raw, 'iconPath')) updates.iconPath = icon;
        if (raw.xpathConfig !== undefined) updates.xpathConfig = raw.xpathConfig as Profile['xpathConfig'];
        if (raw.desktopConfig !== undefined) {
          updates.desktopConfig = raw.desktopConfig as Profile['desktopConfig'];
        }
        saved = this.deps.profileManager.updateProfile(id, updates);
        if (existing.iconPath !== saved.iconPath) this.pruneIcon(existing.iconPath);
      }
    } catch (err: unknown) {
      if (err instanceof ManagerError) throw err;
      const name = (err as Error).name ?? '';
      if (name === 'ProfileNotFoundError') {
        throw new ManagerError('NOT_FOUND', (err as Error).message);
      }
      if (name === 'ProfileDataExistsError') {
        throw new ManagerError('ID_EXISTS', (err as Error).message);
      }
      if (name === 'ProfileValidationError' || name === 'ProfileDuplicateIdError') {
        throw new ManagerError('VALIDATION_ERROR', (err as Error).message);
      }
      throw new ManagerError('REGISTRY_ERROR', `Không thể lưu profile: ${(err as Error).message}`);
    }

    this.busyProfiles.add(saved.id);
    try {
    let shortcut: ShortcutSyncResult;
    try {
      shortcut = await this.deps.syncShortcut(saved, this.deps.launcherPath);
    } catch (err: unknown) {
      shortcut = { status: 'error', path: '', message: (err as Error).message };
    }

    return {
      profile: saved, shortcut, restartRequired: await this.checkRestartRequired(saved),
      ...(iconWarning ? { iconWarning } : {})
    };
    } finally { this.busyProfiles.delete(saved.id); }
  }

  public async deleteProfile(profileId: string): Promise<DeleteProfileResult> {
    const id = assertValidProfileId(profileId);
    this.assertProfileAvailable(id);
    this.busyProfiles.add(id);
    try {
    let profile: Profile;
    try {
      const found = this.deps.profileManager.getProfile(id);
      if (!found) {
        throw new ManagerError('NOT_FOUND', `Không tìm thấy profile với ID: "${id}".`);
      }
      profile = found;
    } catch (err: unknown) {
      throw mapRegistryError(err, 'Không thể đọc profile');
    }
    await this.ensureRunnerStopped(id);

    let removed: ShortcutSyncResult;
    try {
      removed = await this.deps.removeShortcut(id);
    } catch (err: unknown) {
      throw new ManagerError(
        'SHORTCUT_REMOVE_FAILED',
        `Không gỡ được shortcut của "${id}": ${(err as Error).message}. Registry được giữ lại, hãy thử lại.`
      );
    }
    if (removed.status === 'error') {
      throw new ManagerError(
        'SHORTCUT_REMOVE_FAILED',
        `Không gỡ được shortcut của "${id}": ${removed.message}. Registry được giữ lại, hãy thử lại.`
      );
    }

    try {
      this.deps.profileManager.deleteProfile(id);
    } catch (err: unknown) {
      if (err instanceof ManagerError) throw err;
      const name = (err as Error).name ?? '';
      if (name === 'ProfileNotFoundError') {
        throw new ManagerError('NOT_FOUND', (err as Error).message);
      }
      throw new ManagerError(
        'REGISTRY_ERROR',
        `Shortcut đã gỡ nhưng không xóa được registry: ${(err as Error).message}. Profile còn trong danh sách, hãy đồng bộ lại shortcut.`
      );
    }
    this.pruneIcon(profile.iconPath);
    return { removed: true, sessionKept: true };
    } finally { this.busyProfiles.delete(id); }
  }

  /**
   * Dừng runner rồi xác nhận dừng thật: ACK shutdown chưa đủ, PID phải chết
   * và socket phải biến mất trước deadline. Mọi thất bại đều giữ dữ liệu.
   */
  protected async ensureRunnerStopped(profileId: string): Promise<void> {
    const socketPath = this.resolveSocket(profileId);
    const probed = await this.probeRunnerState(profileId);
    if (probed.state === 'stopped') return;
    if (probed.state !== 'running' || !probed.data) {
      throw new ManagerError('RUNNER_UNKNOWN', `Không xác định được trạng thái runner "${profileId}". Dữ liệu được giữ lại.`);
    }
    const status = probed.data;

    try {
      const response = await this.deps.sendCommand(socketPath, 'shutdown');
      if (!response.success) throw new Error(response.error ?? 'Runner từ chối lệnh dừng.');
    } catch (err: unknown) {
      throw new ManagerError(
        'RUNNER_STOP_FAILED',
        `Không gửi được lệnh dừng tới runner "${profileId}": ${(err as Error).message}. Dữ liệu được giữ lại.`
      );
    }

    const deadline = Date.now() + this.deps.shutdownTimeoutMs;
    for (;;) {
      await this.deps.sleep(this.deps.shutdownPollIntervalMs);
      const pidAlive = this.deps.isProcessAlive(status.pid);
      const socketGone = !fs.existsSync(socketPath);
      if (!pidAlive && socketGone) return;
      if (Date.now() >= deadline) {
        throw new ManagerError(
          'RUNNER_STOP_TIMEOUT',
          `Runner "${profileId}" chưa dừng (PID còn sống hoặc socket còn). Dữ liệu được giữ lại, hãy thử lại.`
        );
      }
    }
  }

  public async deleteProfileSession(profileId: string): Promise<DeleteSessionResult> {
    const id = assertValidProfileId(profileId);
    this.assertProfileAvailable(id);
    this.busyProfiles.add(id);
    try {
    await this.assertSessionRunnerStopped(id);
    const target = resolveProfileDataDir(id);
    const confirmed = await this.deps.confirmAction(
      `Xóa dữ liệu phiên của profile "${id}"?`,
      `Xóa toàn bộ phiên đăng nhập và trạng thái website trong ${target}. Hồ sơ profile không bị ảnh hưởng.`
    );
    if (!confirmed) return { deleted: false, cancelled: true };
    // Dialog có thể mở lâu: kiểm tra lại ngay trước thao tác xóa.
    await this.assertSessionRunnerStopped(id);
    const appRoot = resolveDataDir();
    for (const candidate of [path.dirname(target), target]) {
      if (fs.existsSync(candidate)) {
        const relative = path.relative(fs.realpathSync(appRoot), fs.realpathSync(candidate));
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
          throw new ManagerError('PATH_TRAVERSAL', 'Đường dẫn phiên nằm ngoài vùng dữ liệu ứng dụng.');
        }
      }
    }
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch (err: unknown) {
      throw new ManagerError('SESSION_DELETE_FAILED', `Không thể xóa phiên của "${id}": ${(err as Error).message}`);
    }
    return { deleted: true };
    } finally { this.busyProfiles.delete(id); }
  }

  private async assertSessionRunnerStopped(id: string): Promise<void> {
    const state = await this.probeRunnerState(id).catch(
      (): ManagerRunnerStatus => ({ state: 'unknown' })
    );
    if (state.state === 'running') {
      throw new ManagerError(
        'RUNNER_RUNNING',
        `Runner "${id}" còn chạy. Hãy dừng runner trước khi xóa phiên.`
      );
    }
    if (state.state === 'unknown') {
      throw new ManagerError(
        'RUNNER_UNKNOWN',
        `Chưa xác định được runner "${id}" đã dừng. Dữ liệu được giữ lại.`
      );
    }
  }

  /**
   * Xuất toàn bộ cấu hình profile ra một tệp JSON. Chỉ cấu hình, không kèm dữ
   * liệu phiên; icon được nhúng base64. Danh sách rỗng thì không ghi tệp.
   */
  public async exportProfiles(): Promise<ExportResult> {
    let profiles: Profile[];
    try {
      profiles = this.deps.profileManager.loadRegistry().profiles;
    } catch (err: unknown) {
      throw mapRegistryError(err, 'Không thể đọc danh sách profile');
    }

    if (profiles.length === 0) {
      return { cancelled: true, reason: 'EMPTY' };
    }

    const target = await this.deps.showSaveDialog(
      `zaloview-profiles-${formatDateStamp(new Date())}.json`
    );
    if (!target) return { cancelled: true, reason: 'CANCELLED' };

    const bundle = buildExportBundle(profiles, (iconPath) => this.readIconBuffer(iconPath));
    try {
      atomicWriteFile(target, JSON.stringify(bundle, null, 2));
    } catch (err: unknown) {
      throw new ManagerError('EXPORT_WRITE_FAILED', `Không thể ghi tệp xuất: ${(err as Error).message}`);
    }

    return { cancelled: false, count: profiles.length, path: target };
  }

  /** Đường dẫn icon nếu nằm thật trong vùng icon của ứng dụng; ngoài vùng/lỗi trả null. */
  private resolveManagedIcon(iconPath: string): string | null {
    try {
      const iconRoot = fs.realpathSync(this.deps.iconDir);
      const resolved = path.resolve(iconPath);
      const relative = path.relative(iconRoot, resolved);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
      const realRelative = path.relative(iconRoot, fs.realpathSync(resolved));
      if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) return null;
      return resolved;
    } catch {
      return null;
    }
  }

  /** Đọc icon trong vùng icon của ứng dụng; mọi lỗi/đường dẫn ngoài vùng đều trả null. */
  private readIconBuffer(iconPath: string): Buffer | null {
    const resolved = this.resolveManagedIcon(iconPath);
    if (!resolved) return null;
    try {
      const buffer = fs.readFileSync(resolved);
      return buffer.length > 0 ? buffer : null;
    } catch {
      return null;
    }
  }

  /**
   * Xóa icon cũ khi không còn profile nào dùng. Icon đặt tên theo hash nên
   * nhiều profile có thể dùng chung một tệp. Best effort: lỗi không chặn thao tác.
   */
  private pruneIcon(iconPath: string | undefined): void {
    if (!iconPath || iconPath === this.deps.fallbackIconPath) return;
    const resolved = this.resolveManagedIcon(iconPath);
    if (!resolved) return;
    try {
      const inUse = this.deps.profileManager.loadRegistry().profiles
        .some((p) => p.iconPath && path.resolve(p.iconPath) === resolved);
      if (!inUse) fs.unlinkSync(resolved);
    } catch {
      // ignore: icon mồ côi chỉ tốn dung lượng
    }
  }

  /**
   * Nhập danh sách profile từ tệp JSON. Chỉ thêm profile mới, bỏ qua profile
   * trùng ID hoặc không hợp lệ; trả báo cáo chi tiết cho người dùng.
   */
  public async importProfiles(): Promise<ImportReport> {
    const report: ImportReport = {
      cancelled: false,
      addedCount: 0,
      added: [],
      skipped: [],
      invalid: [],
      warnings: []
    };

    const filePath = await this.deps.showJsonOpenDialog();
    if (!filePath) return { ...report, cancelled: true };

    let size: number;
    try {
      size = fs.statSync(filePath).size;
    } catch (err: unknown) {
      throw new ManagerError('IMPORT_INVALID_FILE', `Không thể đọc tệp: ${(err as Error).message}`);
    }
    if (size > MAX_IMPORT_FILE_BYTES) {
      throw new ManagerError(
        'IMPORT_FILE_TOO_LARGE',
        `Tệp vượt quá giới hạn ${Math.floor(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MiB.`
      );
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err: unknown) {
      throw new ManagerError('IMPORT_INVALID_FILE', `Không thể đọc tệp: ${(err as Error).message}`);
    }

    let parsed: ParseImportResult;
    try {
      parsed = parseImportBundle(content);
    } catch (err: unknown) {
      throw new ManagerError('IMPORT_INVALID_FILE', (err as Error).message);
    }

    let existingIds: Set<string>;
    try {
      existingIds = new Set(this.deps.profileManager.loadRegistry().profiles.map((p) => p.id));
    } catch (err: unknown) {
      throw mapRegistryError(err, 'Không thể đọc danh sách profile');
    }

    report.invalid.push(...parsed.invalid);

    for (const entry of parsed.entries) {
      if (existingIds.has(entry.id)) {
        report.skipped.push({ id: entry.id, reason: 'ID_EXISTS' });
        continue;
      }

      let iconPath: string | undefined;
      if (entry.iconBase64) {
        const buffer = Buffer.from(entry.iconBase64, 'base64');
        if (buffer.length === 0 || buffer.length > ICON_MAX_BYTES) {
          report.warnings.push({ id: entry.id, reason: 'ICON_IGNORED' });
        } else {
          const stored = this.storeIconBuffer(buffer);
          if (stored.fallback) {
            report.warnings.push({ id: entry.id, reason: 'ICON_IGNORED' });
          } else {
            iconPath = stored.path;
          }
        }
      }

      let saved: Profile;
      try {
        saved = this.deps.profileManager.createProfile({
          id: entry.id,
          name: entry.name,
          url: entry.url,
          iconPath,
          userAgent: entry.userAgent,
          xpathConfig: entry.xpathConfig,
          desktopConfig: entry.desktopConfig
        });
      } catch (err: unknown) {
        const name = (err as Error).name ?? '';
        if (name === 'ProfileDataExistsError') {
          report.skipped.push({ id: entry.id, reason: 'SESSION_DATA_EXISTS' });
        } else if (name === 'ProfileValidationError' || name === 'ProfileDuplicateIdError') {
          report.invalid.push({ index: entry.index, reason: (err as Error).message });
        } else {
          throw mapRegistryError(err, 'Không thể tạo profile khi nhập');
        }
        continue;
      }

      existingIds.add(saved.id);
      report.addedCount++;
      report.added.push({ id: saved.id, name: saved.name });

      try {
        await this.deps.syncShortcut(saved, this.deps.launcherPath);
      } catch {
        report.warnings.push({ id: saved.id, reason: 'SHORTCUT_FAILED' });
      }
    }

    return report;
  }

  public async launchProfile(profileId: string): Promise<LaunchResult> {
    const id = assertValidProfileId(profileId);
    this.assertProfileAvailable(id);
    const profile = this.deps.profileManager.getProfile(id);
    if (!profile) {
      throw new ManagerError('NOT_FOUND', `Không tìm thấy profile với ID: "${id}".`);
    }
    const args = this.deps.isPackaged
      ? ['--profile', id]
      : [this.deps.appPath, '--profile', id];
    if (args.some((arg) => !arg)) {
      throw new ManagerError('LAUNCH_FAILED', 'Thiếu đường dẫn ứng dụng để khởi chạy runner.');
    }
    try {
      if (this.launchingRunners.has(id)) await this.probeRunnerState(id);
      if (this.launchingRunners.has(id)) return { requested: true, profileId: id };
      this.launchingRunners.set(id, undefined);
      const pid = await this.deps.spawnRunner(args);
      this.launchingRunners.set(id, typeof pid === 'number' ? pid : undefined);
    } catch (err: unknown) {
      this.launchingRunners.delete(id);
      if (err instanceof ManagerError) throw err;
      throw new ManagerError('LAUNCH_FAILED', `Không thể khởi chạy runner: ${(err as Error).message}`);
    }
    return { requested: true, profileId: id };
  }

  public async toggleShortcut(profileId: string, enabled: boolean): Promise<ToggleShortcutResult> {
    const id = assertValidProfileId(profileId);
    this.assertProfileAvailable(id);
    assertBoolean(enabled, 'enabled');
    const existing = this.deps.profileManager.getProfile(id);
    if (!existing) {
      throw new ManagerError('NOT_FOUND', `Không tìm thấy profile với ID: "${id}".`);
    }
    let saved: Profile;
    try {
      saved = this.deps.profileManager.updateProfile(id, {
        desktopConfig: { ...existing.desktopConfig, createDesktopShortcut: enabled }
      });
    } catch (err: unknown) {
      throw mapRegistryError(err, 'Không thể lưu tùy chọn shortcut');
    }
    this.busyProfiles.add(id);
    try {
    let shortcut: ShortcutSyncResult;
    try {
      shortcut = await this.deps.syncShortcut(saved, this.deps.launcherPath);
    } catch (err: unknown) {
      shortcut = { status: 'error', path: '', message: (err as Error).message };
    }
    return { saved, shortcut };
    } finally { this.busyProfiles.delete(id); }
  }

  private assertProfileAvailable(id: string): void {
    if (this.busyProfiles.has(id)) throw new ManagerError('PROFILE_BUSY', `Profile "${id}" đang được lưu hoặc xóa. Hãy thử lại sau.`);
  }

  public async getRunnerStatus(profileId: string): Promise<ManagerRunnerStatus> {
    const id = assertValidProfileId(profileId);
    return this.probeRunnerState(id);
  }

  public async clearAttention(profileId: string): Promise<ClearAttentionResult> {
    const id = assertValidProfileId(profileId);
    const socketPath = this.resolveSocket(id);
    let response: RunnerControlResponse;
    try {
      response = await this.deps.sendCommand(socketPath, 'clear-attention');
    } catch (err: unknown) {
      throw new ManagerError(
        fs.existsSync(socketPath) ? 'RUNNER_UNKNOWN' : 'RUNNER_NOT_RUNNING',
        `Không thể liên lạc với runner "${id}": ${(err as Error).message}`
      );
    }
    if (!response || response.success !== true) {
      throw new ManagerError(
        'RUNNER_ERROR',
        `Runner báo lỗi khi xóa cảnh báo: ${response?.error ?? 'không rõ nguyên nhân'}.`
      );
    }
    const data = response.data as { cleared?: unknown } | undefined;
    if (!data || typeof data.cleared !== 'boolean') {
      throw new ManagerError('RUNNER_ERROR', 'Phản hồi xóa cảnh báo không đúng định dạng.');
    }
    return { cleared: data.cleared };
  }

  public async testXPath(
    profileId: string,
    selector: string,
    mode: XPathObservationMode
  ): Promise<XPathEvaluationResult> {
    const id = assertValidProfileId(profileId);
    if (typeof selector !== 'string' || !selector.trim()) {
      throw new ManagerError('VALIDATION_ERROR', 'selector không được rỗng.');
    }
    const trimmed = selector.trim();
    if (trimmed.length > MAX_XPATH_SELECTOR_LENGTH) {
      throw new ManagerError(
        'VALIDATION_ERROR',
        `selector không được vượt quá ${MAX_XPATH_SELECTOR_LENGTH} ký tự.`
      );
    }
    assertXPathMode(mode);
    const profile = this.deps.profileManager.getProfile(id);
    if (!profile) {
      throw new ManagerError('NOT_FOUND', `Không tìm thấy profile với ID: "${id}".`);
    }
    const socketPath = this.resolveSocket(id);
    let response: RunnerControlResponse;
    try {
      response = await this.deps.sendCommand(
        socketPath,
        'test-xpath',
        { selector: trimmed, mode },
        XPATH_TEST_TIMEOUT_MS + 1000
      );
    } catch (err: unknown) {
      throw new ManagerError(
        fs.existsSync(socketPath) ? 'RUNNER_UNKNOWN' : 'RUNNER_NOT_RUNNING',
        `Không thể thử XPath trên runner "${id}": ${(err as Error).message}`
      );
    }
    if (!response || response.success !== true || !isXPathEvaluationResult(response.data)) {
      throw new ManagerError(
        'XPATH_FAILED',
        `Thử XPath thất bại: ${response?.error ?? 'phản hồi không đúng định dạng'}.`
      );
    }
    const result = response.data;
    if (result.mode !== mode || result.selector.trim() !== trimmed) {
      throw new ManagerError('XPATH_FAILED', 'Kết quả XPath không khớp yêu cầu đang chờ.');
    }
    return result;
  }

  public async chooseIcon(): Promise<IconResult | null> {
    const filePath = await this.deps.showOpenDialog();
    if (!filePath) return null;
    let buffer: Buffer;
    try {
      const fd = fs.openSync(filePath, 'r');
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > ICON_MAX_BYTES) return this.fallbackIcon('Tệp không hợp lệ hoặc vượt quá 2 MiB.');
        buffer = Buffer.alloc(ICON_MAX_BYTES + 1);
        let size = 0;
        while (size < buffer.length) {
          const read = fs.readSync(fd, buffer, size, buffer.length - size, null);
          if (!read) break;
          size += read;
        }
        buffer = buffer.subarray(0, size);
      } finally { fs.closeSync(fd); }
    } catch (err: unknown) {
      return this.fallbackIcon(`Không thể đọc tệp: ${(err as Error).message}`);
    }
    return this.storeIconBuffer(buffer);
  }

  public async fetchIcon(url: string): Promise<IconResult> {
    if (typeof url !== 'string' || !url.trim()) {
      throw new ManagerError('VALIDATION_ERROR', 'url không được rỗng.');
    }
    let fetched: FetchedIcon;
    try {
      fetched = await fetchIconBuffer(url.trim(), this.deps.fetchImpl);
    } catch (err: unknown) {
      if (err instanceof IconFetchError) {
        return this.fallbackIcon(`${err.reason}: ${err.message}`);
      }
      return this.fallbackIcon(`Không thể tải biểu tượng: ${(err as Error).message}`);
    }
    return this.storeIconBuffer(fetched.buffer);
  }

  protected resolveSocket(profileId: string): string {
    return resolveSocketPath(profileId);
  }

  /**
   * Thăm dò trạng thái runner qua socket. Socket file không tồn tại nghĩa là
   * runner đã dừng (server dọn file khi dừng); mọi lỗi kết nối khác khi file
   * còn tồn tại nghĩa là chưa thể xác định — không suy là đã dừng.
   */
  protected async probeRunnerState(profileId: string): Promise<ManagerRunnerStatus> {
    const socketPath = this.resolveSocket(profileId);
    let response: RunnerControlResponse;
    try {
      response = await this.deps.sendCommand(socketPath, 'status');
    } catch {
      if (this.launchingRunners.has(profileId)) {
        const pid = this.launchingRunners.get(profileId);
        if (pid === undefined || this.deps.isProcessAlive(pid)) return { state: 'unknown' };
        this.launchingRunners.delete(profileId);
      }
      return { state: fs.existsSync(socketPath) ? 'unknown' : 'stopped' };
    }
    if (!response || response.success !== true || !isRunnerStatusData(response.data) || response.data.profileId !== profileId) {
      return { state: 'unknown' };
    }
    this.launchingRunners.delete(profileId);
    return { state: 'running', data: response.data };
  }

  protected async checkRestartRequired(profile: Profile): Promise<boolean | null> {
    const status = await this.probeRunnerState(profile.id).catch(
      (): ManagerRunnerStatus => ({ state: 'unknown' })
    );
    if (status.state !== 'running') {
      return status.state === 'stopped' ? false : null;
    }
    const revision = status.data?.configRevision;
    if (!revision) return null;
    return revision !== profile.updatedAt;
  }

  private fallbackIcon(reason: string): IconResult {
    return { path: this.deps.fallbackIconPath, fallback: true, reason };
  }

  private storeIconBuffer(buffer: Buffer): IconResult {
    if (buffer.length > ICON_MAX_BYTES) return this.fallbackIcon('Biểu tượng vượt quá 2 MiB.');
    let decoded;
    try { decoded = this.deps.decodeImage(buffer); } catch { return this.fallbackIcon('Không thể giải mã ảnh.'); }
    if (!decoded) {
      return this.fallbackIcon('Ảnh không đọc được hoặc sai định dạng.');
    }
    if (!(decoded.width > 0 && decoded.height > 0) || decoded.width > ICON_MAX_DIMENSION || decoded.height > ICON_MAX_DIMENSION) {
      return this.fallbackIcon(`Ảnh vượt quá ${ICON_MAX_DIMENSION}×${ICON_MAX_DIMENSION}.`);
    }
    try {
      fs.mkdirSync(this.deps.iconDir, { recursive: true, mode: 0o700 });
      const name = `icon-${createHash('sha256').update(decoded.png).digest('hex').slice(0, 16)}.png`;
      const dest = path.join(this.deps.iconDir, name);
      fs.writeFileSync(dest, decoded.png, { mode: 0o600 });
      return { path: dest, fallback: false };
    } catch (err: unknown) {
      return this.fallbackIcon(`Không thể lưu biểu tượng: ${(err as Error).message}`);
    }
  }
}

function mapRegistryError(err: unknown, context: string): ManagerError {
  if (err instanceof ManagerError) return err;
  const name = (err as Error).name ?? '';
  if (name === 'ProfileNotFoundError') {
    return new ManagerError('NOT_FOUND', (err as Error).message);
  }
  if (name === 'ProfileValidationError' || name === 'ProfileDuplicateIdError') {
    return new ManagerError('VALIDATION_ERROR', (err as Error).message);
  }
  return new ManagerError('REGISTRY_ERROR', `${context}: ${(err as Error).message}`);
}

function isRunnerStatusData(value: unknown): value is RunnerStatusData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return (
    ['starting', 'running', 'error'].includes(raw.status as string) &&
    typeof raw.profileId === 'string' &&
    Number.isSafeInteger(raw.pid) && (raw.pid as number) > 0 &&
    typeof raw.url === 'string' && Number.isFinite(raw.uptimeSeconds) &&
    !!raw.windowState && typeof raw.windowState === 'object' &&
    (raw.configRevision === undefined || typeof raw.configRevision === 'string')
  );
}

const XPATH_RESULT_STATUSES: XPathEvaluationStatus[] = [
  'match',
  'no_match',
  'invalid_selector',
  'invalid_data',
  'error'
];

function isXPathEvaluationResult(value: unknown): value is XPathEvaluationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return (
    typeof raw.status === 'string' &&
    XPATH_RESULT_STATUSES.includes(raw.status as XPathEvaluationStatus) &&
    typeof raw.selector === 'string' &&
    XPATH_MODES.includes(raw.mode as XPathObservationMode) &&
    typeof raw.hasElement === 'boolean' && Number.isFinite(raw.count) && (raw.count as number) >= 0 &&
    typeof raw.textPreview === 'string' && Number.isFinite(raw.executionTimeMs) &&
    (raw.error === undefined || typeof raw.error === 'string')
  );
}

function defaultSpawnRunner(args: string[], execPath: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const child = spawn(execPath, args, { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve(child.pid);
    });
  });
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function defaultDecodeImage(buffer: Buffer): { width: number; height: number; png: Buffer } | null {
  try {
    const require = createRequire(__filename);
    const electron = require('electron') as {
      nativeImage?: {
        createFromBuffer(buffer: Buffer): {
          isEmpty(): boolean;
          getSize(): { width: number; height: number };
          toPNG(): Buffer;
        };
      };
    };
    const nativeImage = electron?.nativeImage;
    if (!nativeImage) return null;
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) return null;
    const { width, height } = image.getSize();
    return { width, height, png: image.toPNG() };
  } catch {
    return null;
  }
}

function defaultFallbackIconPath(): string {
  return path.join(__dirname, '..', 'assets', 'default-icon.png');
}

/**
 * Đăng ký các kênh MANAGER_CHANNELS lên ipcMain. Mỗi listener kiểm tra sender trước
 * khi gọi service; payload chi tiết do từng method của service validate.
 */
export function registerManagerHandlers(
  ipc: IpcMainLike,
  getManagerWindow: () => ManagerWindowRef | null,
  service: ManagerService
): void {
  const guard = (event: ManagerIpcEvent): void => {
    if (!isTrustedManagerEvent(event, getManagerWindow())) {
      throw new ManagerError('VALIDATION_ERROR', 'Yêu cầu không đến từ cửa sổ Manager local.');
    }
  };

  ipc.handle(MANAGER_CHANNELS.getProfiles, (event) => {
    guard(event);
    return service.getProfiles();
  });
  ipc.handle(MANAGER_CHANNELS.saveProfile, (event, input: unknown) => {
    guard(event);
    assertRecord(input, 'profile');
    return service.saveProfile(input as unknown as SaveProfileInput);
  });
  ipc.handle(MANAGER_CHANNELS.deleteProfile, (event, profileId: unknown) => {
    guard(event);
    return service.deleteProfile(assertValidProfileId(profileId));
  });
  ipc.handle(MANAGER_CHANNELS.launchProfile, (event, profileId: unknown) => {
    guard(event);
    return service.launchProfile(assertValidProfileId(profileId));
  });
  ipc.handle(MANAGER_CHANNELS.toggleShortcut, (event, profileId: unknown, enabled: unknown) => {
    guard(event);
    const id = assertValidProfileId(profileId);
    assertBoolean(enabled, 'enabled');
    return service.toggleShortcut(id, enabled);
  });
  ipc.handle(MANAGER_CHANNELS.getRunnerStatus, (event, profileId: unknown) => {
    guard(event);
    return service.getRunnerStatus(assertValidProfileId(profileId));
  });
  ipc.handle(MANAGER_CHANNELS.clearAttention, (event, profileId: unknown) => {
    guard(event);
    return service.clearAttention(assertValidProfileId(profileId));
  });
  ipc.handle(MANAGER_CHANNELS.testXPath, (event, profileId: unknown, selector: unknown, mode: unknown) => {
    guard(event);
    const id = assertValidProfileId(profileId);
    if (typeof selector !== 'string') {
      throw new ManagerError('VALIDATION_ERROR', 'selector phải là chuỗi.');
    }
    assertXPathMode(mode);
    return service.testXPath(id, selector, mode);
  });
  ipc.handle(MANAGER_CHANNELS.chooseIcon, (event) => {
    guard(event);
    return service.chooseIcon();
  });
  ipc.handle(MANAGER_CHANNELS.fetchIcon, (event, url: unknown) => {
    guard(event);
    if (typeof url !== 'string') {
      throw new ManagerError('VALIDATION_ERROR', 'url phải là chuỗi.');
    }
    return service.fetchIcon(url);
  });
  ipc.handle(MANAGER_CHANNELS.deleteProfileSession, (event, profileId: unknown) => {
    guard(event);
    return service.deleteProfileSession(assertValidProfileId(profileId));
  });
  ipc.handle(MANAGER_CHANNELS.exportProfiles, (event) => {
    guard(event);
    return service.exportProfiles();
  });
  ipc.handle(MANAGER_CHANNELS.importProfiles, (event) => {
    guard(event);
    return service.importProfiles();
  });
}

export { fetchIconBuffer };
export type { ImageDecoder };
