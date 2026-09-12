import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Resolves the configuration directory for ZaloWebView according to XDG Base Directory specification.
 * Falls back to ~/.config/zaloview if XDG_CONFIG_HOME is unset or relative.
 */
export function resolveConfigDir(): string {
  const envConfig = process.env.XDG_CONFIG_HOME;
  const baseConfig = envConfig && path.isAbsolute(envConfig)
    ? envConfig
    : path.join(os.homedir(), '.config');
  return path.join(baseConfig, 'zaloview');
}

/**
 * Resolves the data directory for ZaloWebView according to XDG Base Directory specification.
 * Falls back to ~/.local/share/zaloview if XDG_DATA_HOME is unset or relative.
 */
export function resolveDataDir(): string {
  const envData = process.env.XDG_DATA_HOME;
  const baseData = envData && path.isAbsolute(envData)
    ? envData
    : path.join(os.homedir(), '.local', 'share');
  return path.join(baseData, 'zaloview');
}

/**
 * Resolves the runtime directory for temporary IPC sockets if available.
 * Returns undefined if XDG_RUNTIME_DIR is not set or not an absolute path.
 */
export function resolveRuntimeDir(): string | undefined {
  const envRuntime = process.env.XDG_RUNTIME_DIR;
  if (envRuntime && path.isAbsolute(envRuntime)) {
    return path.join(envRuntime, 'zaloview');
  }
  return undefined;
}

/**
 * Resolves the full path to the centralized profiles registry file.
 */
export function resolveRegistryPath(): string {
  return path.join(resolveConfigDir(), 'profiles.json');
}

/**
 * Resolves the root data directory for a specific profile.
 */
export function resolveProfileDataDir(profileId: string): string {
  return path.join(resolveDataDir(), 'profiles', profileId);
}

/**
 * Resolves the path to the window-state.json file for a profile.
 */
export function resolveWindowStatePath(profileId: string): string {
  return path.join(resolveProfileDataDir(profileId), 'window-state.json');
}

/**
 * Resolves the path to the permissions.json file for a profile.
 */
export function resolvePermissionsPath(profileId: string): string {
  return path.join(resolveProfileDataDir(profileId), 'permissions.json');
}

/**
 * Resolves the Unix domain socket path for runner IPC.
 * Prefers XDG_RUNTIME_DIR if path length does not exceed standard Unix socket limit (104 chars),
 * otherwise falls back to the profile's data directory.
 */
export function resolveSocketPath(profileId: string): string {
  const runtimeDir = resolveRuntimeDir();
  if (runtimeDir) {
    const candidate = path.join(runtimeDir, `${profileId}.sock`);
    if (Buffer.byteLength(candidate) <= 104) {
      return candidate;
    }
  }
  return path.join(resolveProfileDataDir(profileId), 'runner.sock');
}
