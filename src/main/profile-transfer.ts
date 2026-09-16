/**
 * Chuyển đổi tệp nhập/xuất profile (Phase 9).
 *
 * Module thuần: không import `electron`, không chạm hệ thống tệp. Mọi thao tác
 * đọc/ghi tệp do ManagerService thực hiện; nơi đây chỉ dựng và kiểm tra payload.
 */
import {
  ExportBundle,
  ExportedProfile,
  ParsedProfileEntry,
  Profile
} from '../shared/types';
import { validateProfile } from './profile-validator';

export class ProfileTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileTransferError';
  }
}

export const PROFILE_EXPORT_SCHEMA_VERSION = 1;
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;

export interface ParseImportResult {
  entries: ParsedProfileEntry[];
  invalid: { index: number; reason: string }[];
}

/**
 * Dựng payload xuất từ danh sách profile. `iconReader` trả Buffer ảnh hoặc null;
 * lỗi đọc icon chỉ khiến profile đó không có icon, không chặn việc xuất.
 */
export function buildExportBundle(
  profiles: Profile[],
  iconReader: (iconPath: string) => Buffer | null,
  now: Date = new Date()
): ExportBundle {
  const exported: ExportedProfile[] = profiles.map((profile) => {
    const entry: ExportedProfile = {
      id: profile.id,
      name: profile.name,
      url: profile.url,
      xpathConfig: profile.xpathConfig,
      desktopConfig: profile.desktopConfig
    };

    if (profile.userAgent) entry.userAgent = profile.userAgent;

    if (profile.iconPath) {
      const buffer = iconReader(profile.iconPath);
      if (buffer && buffer.length > 0) {
        entry.icon = { mimeType: 'image/png', data: buffer.toString('base64') };
      }
    }

    return entry;
  });

  return {
    schemaVersion: PROFILE_EXPORT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    profiles: exported
  };
}

function readIconBase64(rawProfile: unknown): string | undefined {
  if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) return undefined;
  const icon = (rawProfile as { icon?: unknown }).icon;
  if (!icon || typeof icon !== 'object' || Array.isArray(icon)) return undefined;
  const raw = icon as { mimeType?: unknown; data?: unknown };
  const mimeType = typeof raw.mimeType === 'string' ? raw.mimeType.trim() : '';
  const data = typeof raw.data === 'string' ? raw.data.trim() : '';
  return mimeType && data ? data : undefined;
}

/**
 * Kiểm tra cấu trúc tệp nhập và map từng profile hợp lệ. Lỗi cấu trúc (JSON,
 * schemaVersion, profiles) ném `ProfileTransferError`; lỗi từng profile chỉ được
 * gom vào `invalid` để không chặn các profile khác.
 */
export function parseImportBundle(raw: string): ParseImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new ProfileTransferError(`Tệp không phải JSON hợp lệ: ${(err as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ProfileTransferError('Tệp không phải là một đối tượng JSON hợp lệ.');
  }

  const bundle = parsed as Partial<ExportBundle>;
  if (bundle.schemaVersion !== PROFILE_EXPORT_SCHEMA_VERSION) {
    throw new ProfileTransferError(
      `Phiên bản định dạng không được hỗ trợ: ${String(bundle.schemaVersion)}. Yêu cầu: ${PROFILE_EXPORT_SCHEMA_VERSION}.`
    );
  }
  if (!Array.isArray(bundle.profiles)) {
    throw new ProfileTransferError('Trường "profiles" bắt buộc phải là một mảng.');
  }

  const entries: ParsedProfileEntry[] = [];
  const invalid: { index: number; reason: string }[] = [];

  bundle.profiles.forEach((rawProfile: unknown, index: number) => {
    try {
      const profile = validateProfile(rawProfile);
      const entry: ParsedProfileEntry = {
        index,
        id: profile.id,
        name: profile.name,
        url: profile.url,
        xpathConfig: profile.xpathConfig,
        desktopConfig: profile.desktopConfig
      };
      if (profile.userAgent) entry.userAgent = profile.userAgent;
      const iconBase64 = readIconBase64(rawProfile);
      if (iconBase64) entry.iconBase64 = iconBase64;
      entries.push(entry);
    } catch (err: unknown) {
      invalid.push({ index, reason: (err as Error).message });
    }
  });

  return { entries, invalid };
}
