import * as fs from 'node:fs';
import { Profile, ProfileRegistry, WindowState } from '../shared/types';
import { resolveProfileDataDir, resolveRegistryPath, resolveWindowStatePath } from './xdg-paths';
import { atomicWriteFile } from './atomic-writer';
import {
  validateProfile,
  validateWindowState,
  validateProfileId,
  generateSlug,
  ProfileValidationError
} from './profile-validator';

export { ProfileValidationError } from './profile-validator';

export class ProfileRegistryCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileRegistryCorruptError';
  }
}

export class ProfileNotFoundError extends Error {
  constructor(id: string) {
    super(`Không tìm thấy profile với ID: "${id}".`);
    this.name = 'ProfileNotFoundError';
  }
}

export class ProfileDuplicateIdError extends Error {
  constructor(id: string) {
    super(`Profile ID đã tồn tại: "${id}".`);
    this.name = 'ProfileDuplicateIdError';
  }
}

export class ProfileDataExistsError extends Error {
  constructor(id: string) {
    super(`Dữ liệu phiên của profile "${id}" vẫn còn trên đĩa; hãy xóa phiên riêng trước khi dùng lại ID.`);
    this.name = 'ProfileDataExistsError';
  }
}

export interface CreateProfileParams {
  id?: string;
  name: string;
  url: string;
  iconPath?: string;
  userAgent?: string;
  xpathConfig?: Profile['xpathConfig'];
  desktopConfig?: Profile['desktopConfig'];
}

export interface UpdateProfileParams {
  name?: string;
  url?: string;
  iconPath?: string;
  userAgent?: string;
  xpathConfig?: Profile['xpathConfig'];
  desktopConfig?: Profile['desktopConfig'];
}

export class ProfileManager {
  /**
   * Loads and validates the profiles registry from profiles.json.
   * If the file does not exist, returns an empty registry without creating the file.
   * If the file contains invalid JSON or unsupported schemaVersion, throws ProfileRegistryCorruptError.
   */
  public loadRegistry(): ProfileRegistry {
    const registryPath = resolveRegistryPath();

    if (!fs.existsSync(registryPath)) {
      return { schemaVersion: 1, profiles: [] };
    }

    let rawContent: string;
    try {
      rawContent = fs.readFileSync(registryPath, 'utf-8');
    } catch (err: unknown) {
      throw new ProfileRegistryCorruptError(`Không thể đọc tệp profiles.json: ${(err as Error).message}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err: unknown) {
      throw new ProfileRegistryCorruptError(`Tệp profiles.json bị lỗi cú pháp JSON: ${(err as Error).message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new ProfileRegistryCorruptError('Tệp profiles.json không phải là một đối tượng JSON hợp lệ.');
    }

    const rawRegistry = parsed as Partial<ProfileRegistry>;
    if (rawRegistry.schemaVersion !== 1) {
      throw new ProfileRegistryCorruptError(
        `Phiên bản cấu trúc schemaVersion không được hỗ trợ: ${String(rawRegistry.schemaVersion)}. Yêu cầu phiên bản: 1.`
      );
    }

    if (!Array.isArray(rawRegistry.profiles)) {
      throw new ProfileRegistryCorruptError('Trường "profiles" trong profiles.json bắt buộc phải là một mảng.');
    }

    const seenIds = new Set<string>();
    const validatedProfiles: Profile[] = [];

    for (const rawProfile of rawRegistry.profiles) {
      const profile = validateProfile(rawProfile);
      if (seenIds.has(profile.id)) {
        throw new ProfileRegistryCorruptError(`Tệp profiles.json chứa ID bị trùng lặp: "${profile.id}".`);
      }
      seenIds.add(profile.id);
      validatedProfiles.push(profile);
    }

    return {
      schemaVersion: 1,
      profiles: validatedProfiles
    };
  }

  /**
   * Retrieves a single profile by its unique ID.
   */
  public getProfile(id: string): Profile | undefined {
    const registry = this.loadRegistry();
    return registry.profiles.find((p) => p.id === id);
  }

  /**
   * Creates a new profile, assigning an auto-generated safe slug ID if not specified.
   * Automatically persists changes atomically to profiles.json.
   */
  public createProfile(params: CreateProfileParams): Profile {
    const registry = this.loadRegistry();

    let id: string;
    if (params.id) {
      id = validateProfileId(params.id);
      if (registry.profiles.some((p) => p.id === id)) {
        throw new ProfileDuplicateIdError(id);
      }
      if (fs.existsSync(resolveProfileDataDir(id))) {
        throw new ProfileDataExistsError(id);
      }
    } else {
      const baseSlug = generateSlug(params.name);
      id = baseSlug;
      let counter = 1;
      while (registry.profiles.some((p) => p.id === id) || fs.existsSync(resolveProfileDataDir(id))) {
        id = `${baseSlug}-${counter++}`;
      }
    }

    const now = new Date().toISOString();
    const newProfile: Profile = validateProfile({
      ...params,
      id,
      createdAt: now,
      updatedAt: now
    });

    registry.profiles.push(newProfile);
    this.saveRegistry(registry);
    return newProfile;
  }

  /**
   * Updates an existing profile's configuration.
   * Preserves immutable fields (id, createdAt) and updates updatedAt.
   */
  public updateProfile(id: string, updates: UpdateProfileParams): Profile {
    const registry = this.loadRegistry();
    const index = registry.profiles.findIndex((p) => p.id === id);

    if (index === -1) {
      throw new ProfileNotFoundError(id);
    }

    const existing = registry.profiles[index];
    const now = new Date(Math.max(Date.now(), Date.parse(existing.updatedAt) + 1)).toISOString();

    const merged: Profile = validateProfile({
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now
    });

    registry.profiles[index] = merged;
    this.saveRegistry(registry);
    return merged;
  }

  /**
   * Deletes a profile from the registry.
   * Preserves user data on disk by default.
   */
  public deleteProfile(id: string): void {
    const registry = this.loadRegistry();
    const index = registry.profiles.findIndex((p) => p.id === id);

    if (index === -1) {
      throw new ProfileNotFoundError(id);
    }

    registry.profiles.splice(index, 1);
    this.saveRegistry(registry);
  }

  /**
   * Loads the window-state.json for a profile.
   * Returns standard defaults (1024x768) if the file is missing or invalid.
   */
  public loadWindowState(profileId: string): WindowState {
    const statePath = resolveWindowStatePath(profileId);
    if (!fs.existsSync(statePath)) {
      return validateWindowState(null);
    }

    try {
      const content = fs.readFileSync(statePath, 'utf-8');
      const parsed = JSON.parse(content);
      return validateWindowState(parsed);
    } catch {
      return validateWindowState(null);
    }
  }

  /**
   * Atomically saves the window state for a profile.
   * Does not touch profiles.json.
   */
  public saveWindowState(profileId: string, state: WindowState): void {
    const validState = validateWindowState(state);
    const statePath = resolveWindowStatePath(profileId);
    const content = JSON.stringify(validState, null, 2);
    atomicWriteFile(statePath, content);
  }

  private saveRegistry(registry: ProfileRegistry): void {
    const registryPath = resolveRegistryPath();
    const content = JSON.stringify(registry, null, 2);
    atomicWriteFile(registryPath, content);
  }
}
