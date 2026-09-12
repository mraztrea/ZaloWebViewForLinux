import {
  Profile,
  XPathConfig,
  DesktopIntegrationConfig,
  WindowState,
  PROFILE_ID_REGEX,
  MAX_PROFILE_ID_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
  MAX_XPATH_SELECTOR_LENGTH,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  MIN_POLL_INTERVAL_MS,
  MAX_POLL_INTERVAL_MS,
  DEFAULT_POLL_INTERVAL_MS
} from '../shared/types';

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileValidationError';
  }
}

/**
 * Converts any string (including Vietnamese with diacritics) into a clean, safe URL slug.
 */
export function generateSlug(text: string): string {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric with hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .replace(/-{2,}/g, '-'); // collapse multiple hyphens

  if (!normalized) {
    return `profile-${Date.now().toString(36)}`;
  }
  return normalized.slice(0, MAX_PROFILE_ID_LENGTH);
}

export function validateProfileId(id: unknown): string {
  if (typeof id !== 'string') {
    throw new ProfileValidationError('Profile ID phải là chuỗi ký tự.');
  }

  const trimmed = id.trim();
  if (!trimmed || trimmed.length > MAX_PROFILE_ID_LENGTH) {
    throw new ProfileValidationError(`Profile ID phải từ 1 đến ${MAX_PROFILE_ID_LENGTH} ký tự.`);
  }

  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new ProfileValidationError('Profile ID không được chứa ký tự duyệt thư mục (path traversal).');
  }

  if (!PROFILE_ID_REGEX.test(trimmed)) {
    throw new ProfileValidationError('Profile ID chỉ được chứa chữ thường, số và dấu gạch nối (dạng slug).');
  }

  return trimmed;
}

export function validateProfileName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new ProfileValidationError('Tên profile phải là chuỗi ký tự.');
  }

  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_PROFILE_NAME_LENGTH) {
    throw new ProfileValidationError(`Tên profile phải từ 1 đến ${MAX_PROFILE_NAME_LENGTH} ký tự.`);
  }

  // Reject control characters
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    throw new ProfileValidationError('Tên profile không được chứa ký tự điều khiển hệ thống.');
  }

  return trimmed;
}

export function validateProfileUrl(urlStr: unknown): string {
  if (typeof urlStr !== 'string') {
    throw new ProfileValidationError('URL website phải là chuỗi ký tự.');
  }

  const trimmed = urlStr.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ProfileValidationError(`URL website không hợp lệ: "${trimmed}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ProfileValidationError(`Giao thức URL phải là HTTP hoặc HTTPS, nhận được: "${parsed.protocol}"`);
  }

  if (parsed.username || parsed.password) {
    throw new ProfileValidationError('URL website không được chứa thông tin đăng nhập nhúng (credentials).');
  }

  return trimmed;
}

export function validateXPathConfig(config: unknown): XPathConfig {
  if (!config || typeof config !== 'object') {
    return {
      selector: '',
      mode: 'badge_count',
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS
    };
  }

  const raw = config as Partial<XPathConfig>;

  const selector = typeof raw.selector === 'string' ? raw.selector.trim() : '';
  if (selector.length > MAX_XPATH_SELECTOR_LENGTH) {
    throw new ProfileValidationError(`Selector XPath không được vượt quá ${MAX_XPATH_SELECTOR_LENGTH} ký tự.`);
  }

  const mode = raw.mode ?? 'badge_count';
  if (mode !== 'badge_count' && mode !== 'text_content' && mode !== 'existence') {
    throw new ProfileValidationError(`Chế độ XPath mode không hợp lệ: "${String(mode)}".`);
  }

  const pollIntervalMs = typeof raw.pollIntervalMs === 'number'
    ? Math.floor(raw.pollIntervalMs)
    : DEFAULT_POLL_INTERVAL_MS;

  if (Number.isNaN(pollIntervalMs) || pollIntervalMs < MIN_POLL_INTERVAL_MS || pollIntervalMs > MAX_POLL_INTERVAL_MS) {
    throw new ProfileValidationError(`Chu kỳ quét pollIntervalMs phải từ ${MIN_POLL_INTERVAL_MS} đến ${MAX_POLL_INTERVAL_MS} ms.`);
  }

  return { selector, mode, pollIntervalMs };
}

export function validateDesktopConfig(config: unknown): DesktopIntegrationConfig {
  if (!config || typeof config !== 'object') {
    return {
      flashTaskbar: true,
      showTaskbarBadge: true,
      minimizeToTray: false,
      showDesktopNotification: true,
      createDesktopShortcut: true
    };
  }

  const raw = config as Partial<DesktopIntegrationConfig>;

  const ensureBool = (val: unknown, field: string, defaultVal: boolean): boolean => {
    if (val === undefined) return defaultVal;
    if (typeof val !== 'boolean') {
      throw new ProfileValidationError(`Trường desktopConfig.${field} phải là boolean.`);
    }
    return val;
  };

  return {
    flashTaskbar: ensureBool(raw.flashTaskbar, 'flashTaskbar', true),
    showTaskbarBadge: ensureBool(raw.showTaskbarBadge, 'showTaskbarBadge', true),
    minimizeToTray: ensureBool(raw.minimizeToTray, 'minimizeToTray', false),
    showDesktopNotification: ensureBool(raw.showDesktopNotification, 'showDesktopNotification', true),
    createDesktopShortcut: ensureBool(raw.createDesktopShortcut, 'createDesktopShortcut', true)
  };
}

export function validateProfile(profile: unknown): Profile {
  if (!profile || typeof profile !== 'object') {
    throw new ProfileValidationError('Dữ liệu profile không đúng định dạng đối tượng.');
  }

  const raw = profile as Partial<Profile>;

  const id = validateProfileId(raw.id);
  const name = validateProfileName(raw.name);
  const url = validateProfileUrl(raw.url);
  const xpathConfig = validateXPathConfig(raw.xpathConfig);
  const desktopConfig = validateDesktopConfig(raw.desktopConfig);

  const iconPath = typeof raw.iconPath === 'string' && raw.iconPath.trim() ? raw.iconPath.trim() : undefined;
  const userAgent = typeof raw.userAgent === 'string' && raw.userAgent.trim() ? raw.userAgent.trim() : undefined;

  const createdAt = typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))
    ? raw.createdAt
    : new Date().toISOString();

  const updatedAt = typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))
    ? raw.updatedAt
    : new Date().toISOString();

  return {
    id,
    name,
    url,
    iconPath,
    userAgent,
    xpathConfig,
    desktopConfig,
    createdAt,
    updatedAt
  };
}

export function validateWindowState(state: unknown): WindowState {
  const fallback: WindowState = {
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    isMaximized: false
  };

  if (!state || typeof state !== 'object') {
    return fallback;
  }

  const raw = state as Partial<WindowState>;
  const width = typeof raw.width === 'number' && raw.width >= MIN_WINDOW_WIDTH
    ? Math.floor(raw.width)
    : DEFAULT_WINDOW_WIDTH;

  const height = typeof raw.height === 'number' && raw.height >= MIN_WINDOW_HEIGHT
    ? Math.floor(raw.height)
    : DEFAULT_WINDOW_HEIGHT;

  const isMaximized = typeof raw.isMaximized === 'boolean' ? raw.isMaximized : false;

  const x = typeof raw.x === 'number' && Number.isFinite(raw.x) ? Math.floor(raw.x) : undefined;
  const y = typeof raw.y === 'number' && Number.isFinite(raw.y) ? Math.floor(raw.y) : undefined;

  return { x, y, width, height, isMaximized };
}
