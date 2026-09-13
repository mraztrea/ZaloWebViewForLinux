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
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { ProfileManager } from './profile-manager';
import { validateProfileId } from './profile-validator';
import { resolveDataDir, resolveProfileDataDir, resolveSocketPath } from './xdg-paths';
import { sendSocketCommand } from './runner-control';
import { removeProfileShortcut, syncProfileShortcut } from './desktop-service';
import {
  fetchIconBuffer,
  ICON_MAX_DIMENSION,
  IconFetchError,
  type FetchedIcon,
  type ImageDecoder
} from './icon-fetcher';
import type {
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
import { MAX_XPATH_SELECTOR_LENGTH, SOCKET_TIMEOUT_MS } from '../shared/types';
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
  deleteProfileSession: 'zaloview:delete-profile-session'
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
  spawnRunner?: (args: string[]) => void;
  execPath?: string;
  appPath?: string;
  isPackaged?: boolean;
  isProcessAlive?: (pid: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  confirmAction?: (message: string, detail: string) => Promise<boolean>;
  showOpenDialog?: () => Promise<string | null>;
  decodeImage?: ImageDecoder;
  fetchImpl?: typeof fetch;
  iconDir?: string;
  fallbackIconPath?: string;
  shutdownPollIntervalMs?: number;
  shutdownTimeoutMs?: number;
}

/** Đường launcher cài đặt mặc định theo docs/installation.md. */
export function resolveLauncherPath(): string {
  return path.join(os.homedir(), '.local', 'opt', 'zaloview', 'zaloview');
}

function assertRecord(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ManagerError('VALIDATION_ERROR', `${field} phải là một đối tượng.`);
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

function notImplemented(method: string): never {
  throw new ManagerError('NOT_IMPLEMENTED', `Phương thức ${method} chưa được triển khai.`);
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

const MANAGER_PAGE_SUFFIX = 'renderer/manager/index.html';

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
    if (parsed.protocol !== 'file:') return false;
  } catch {
    return false;
  }
  return rawUrl.replace(/\\/g, '/').endsWith(MANAGER_PAGE_SUFFIX);
}

export interface IpcMainLike {
  handle(channel: string, listener: (event: ManagerIpcEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export class ManagerService {
  protected readonly deps: Required<ManagerServiceDeps>;

  constructor(deps: ManagerServiceDeps = {}) {
    this.deps = {
      profileManager: deps.profileManager ?? new ProfileManager(),
      sendCommand: deps.sendCommand ?? sendSocketCommand,
      syncShortcut: deps.syncShortcut ?? syncProfileShortcut,
      removeShortcut: deps.removeShortcut ?? removeProfileShortcut,
      launcherPath: deps.launcherPath ?? resolveLauncherPath(),
      spawnRunner: deps.spawnRunner ?? defaultSpawnRunner,
      execPath: deps.execPath ?? process.execPath,
      appPath: deps.appPath ?? '',
      isPackaged: deps.isPackaged ?? false,
      isProcessAlive: deps.isProcessAlive ?? defaultIsProcessAlive,
      sleep: deps.sleep ?? defaultSleep,
      confirmAction: deps.confirmAction ?? (async () => false),
      showOpenDialog: deps.showOpenDialog ?? (async () => null),
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
    assertRecord(input, 'profile');
    const raw = input as Record<string, unknown>;
    if (typeof raw.name !== 'string' || typeof raw.url !== 'string') {
      throw new ManagerError('VALIDATION_ERROR', 'name và url là bắt buộc và phải là chuỗi.');
    }

    let saved: Profile;
    try {
      const rawId = typeof raw.id === 'string' && raw.id.trim() ? raw.id : undefined;
      if (rawId === undefined) {
        saved = this.deps.profileManager.createProfile({
          name: raw.name,
          url: raw.url,
          iconPath: asOptionalString(raw.iconPath),
          userAgent: asOptionalString(raw.userAgent),
          xpathConfig: raw.xpathConfig as Profile['xpathConfig'],
          desktopConfig: raw.desktopConfig as Profile['desktopConfig']
        });
      } else {
        const id = assertValidProfileId(rawId);
        const existing = this.deps.profileManager.getProfile(id);
        if (!existing) {
          saved = this.deps.profileManager.createProfile({
            id,
            name: raw.name,
            url: raw.url,
            iconPath: asOptionalString(raw.iconPath),
            userAgent: asOptionalString(raw.userAgent),
            xpathConfig: raw.xpathConfig as Profile['xpathConfig'],
            desktopConfig: raw.desktopConfig as Profile['desktopConfig']
          });
        } else {
        const updates: {
          name?: string;
          url?: string;
          iconPath?: string;
          xpathConfig?: Profile['xpathConfig'];
          desktopConfig?: Profile['desktopConfig'];
        } = { name: raw.name, url: raw.url };
        // userAgent bất biến khi sửa: luôn giữ giá trị cũ, bỏ qua renderer gửi.
        if (raw.iconPath !== undefined) updates.iconPath = asOptionalString(raw.iconPath);
        if (raw.xpathConfig !== undefined) updates.xpathConfig = raw.xpathConfig as Profile['xpathConfig'];
        if (raw.desktopConfig !== undefined) {
          updates.desktopConfig = raw.desktopConfig as Profile['desktopConfig'];
        }
        saved = this.deps.profileManager.updateProfile(id, updates);
        }
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

    let shortcut: ShortcutSyncResult;
    try {
      shortcut = await this.deps.syncShortcut(saved, this.deps.launcherPath);
    } catch (err: unknown) {
      shortcut = { status: 'error', path: '', message: (err as Error).message };
    }

    return { profile: saved, shortcut, restartRequired: await this.checkRestartRequired(saved) };
  }

  public async deleteProfile(profileId: string): Promise<DeleteProfileResult> {
    const id = assertValidProfileId(profileId);
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
    void profile;
    return { removed: true, sessionKept: true };
  }

  /**
   * Dừng runner rồi xác nhận dừng thật: ACK shutdown chưa đủ, PID phải chết
   * và socket phải biến mất trước deadline. Mọi thất bại đều giữ dữ liệu.
   */
  protected async ensureRunnerStopped(profileId: string): Promise<void> {
    const socketPath = this.resolveSocket(profileId);
    if (!fs.existsSync(socketPath)) return;

    let status: RunnerStatusData;
    try {
      const response = await this.deps.sendCommand(socketPath, 'status');
      if (!response || response.success !== true || !isRunnerStatusData(response.data)) {
        throw new ManagerError('RUNNER_UNKNOWN', `Không xác định được trạng thái runner "${profileId}".`);
      }
      status = response.data;
    } catch (err: unknown) {
      if (err instanceof ManagerError) throw err;
      throw new ManagerError(
        'RUNNER_UNKNOWN',
        `Không thể liên lạc với runner "${profileId}": ${(err as Error).message}. Dữ liệu được giữ lại.`
      );
    }

    try {
      await this.deps.sendCommand(socketPath, 'shutdown');
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
    const appRoot = resolveDataDir();
    const target = resolveProfileDataDir(id);
    const relative = path.relative(appRoot, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new ManagerError('PATH_TRAVERSAL', 'Đường dẫn phiên nằm ngoài vùng dữ liệu ứng dụng.');
    }
    const confirmed = await this.deps.confirmAction(
      `Xóa dữ liệu phiên của profile "${id}"?`,
      'Hành động này xóa toàn bộ phiên đăng nhập và trạng thái website của đúng profile trên. Hồ sơ profile không bị ảnh hưởng.'
    );
    if (!confirmed) return { deleted: false, cancelled: true };
    try {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
      }
    } catch (err: unknown) {
      throw new ManagerError(
        'SESSION_DELETE_FAILED',
        `Không thể xóa phiên của "${id}": ${(err as Error).message}`
      );
    }
    return { deleted: true };
  }

  public async launchProfile(profileId: string): Promise<LaunchResult> {
    const id = assertValidProfileId(profileId);
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
      this.deps.spawnRunner(args);
    } catch (err: unknown) {
      if (err instanceof ManagerError) throw err;
      throw new ManagerError('LAUNCH_FAILED', `Không thể khởi chạy runner: ${(err as Error).message}`);
    }
    return { requested: true, profileId: id };
  }

  public async toggleShortcut(profileId: string, enabled: boolean): Promise<ToggleShortcutResult> {
    const id = assertValidProfileId(profileId);
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
    let shortcut: ShortcutSyncResult;
    try {
      shortcut = await this.deps.syncShortcut(saved, this.deps.launcherPath);
    } catch (err: unknown) {
      shortcut = { status: 'error', path: '', message: (err as Error).message };
    }
    return { saved, shortcut };
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
        SOCKET_TIMEOUT_MS
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
      buffer = fs.readFileSync(filePath);
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
      return { state: fs.existsSync(socketPath) ? 'unknown' : 'stopped' };
    }
    if (!response || response.success !== true || !isRunnerStatusData(response.data)) {
      return { state: 'unknown' };
    }
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
    const decoded = this.deps.decodeImage(buffer);
    if (!decoded) {
      return this.fallbackIcon('Ảnh không đọc được hoặc sai định dạng.');
    }
    if (decoded.width > ICON_MAX_DIMENSION || decoded.height > ICON_MAX_DIMENSION) {
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
    typeof raw.status === 'string' &&
    typeof raw.profileId === 'string' &&
    typeof raw.pid === 'number'
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
    typeof raw.mode === 'string'
  );
}

function defaultSpawnRunner(args: string[]): void {
  try {
    const child = spawn(process.execPath, args, { detached: true, stdio: 'ignore' });
    child.on('error', (err: Error) => {
      console.warn('[ZaloWebView] Không thể khởi chạy runner:', err.message);
    });
    child.unref();
  } catch (err: unknown) {
    throw new ManagerError('LAUNCH_FAILED', `Không thể khởi chạy runner: ${(err as Error).message}`);
  }
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
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

/** Giữ tham chiếu kiểu để import type không bị coi là thừa. */
export type { FetchedIcon, RunnerStatusData };

/**
 * Đăng ký 11 kênh Manager lên ipcMain. Mỗi listener kiểm tra sender trước
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
}

export { fetchIconBuffer };
export type { ImageDecoder };
