import * as fs from 'node:fs';
import * as path from 'node:path';
import { atomicWriteFile } from './atomic-writer';
import { validateProfileId, validateProfileName } from './profile-validator';
import { resolveDataDir } from './xdg-paths';
import type { Profile, ShortcutSyncResult } from '../shared/types';

const FALLBACK_ICON = 'applications-internet';
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function applicationsDir(): string {
  return path.join(path.dirname(resolveDataDir()), 'applications');
}

/**
 * Tên file `.desktop` của một profile. Dùng chung cho shortcut đã cài và
 * `app.setDesktopName` để LauncherEntry app_uri (`application://<tên>`) khớp
 * đúng file shortcut, nhờ đó badge taskbar hoạt động.
 */
export function profileDesktopFileName(profileId: string): string {
  return `zaloview-${profileId}.desktop`;
}

function shortcutPath(profileId: string): string {
  return path.join(applicationsDir(), profileDesktopFileName(profileId));
}

function rejectControlCharacters(value: string, field: string): void {
  if (CONTROL_CHARACTERS.test(value)) {
    throw new Error(`${field} không được chứa ký tự điều khiển.`);
  }
}

function quoteExecArg(value: string): string {
  let escaped = '';
  for (const character of value) {
    if (character === '\\') escaped += '\\\\\\\\';
    else if (character === '"' || character === '$' || character === '`') escaped += `\\\\${character}`;
    else if (character === '%') escaped += '%%';
    else escaped += character;
  }
  return `"${escaped}"`;
}

function escapeDesktopString(value: string): string {
  return value.replaceAll('\\', '\\\\');
}

function managedIconPath(iconPath: string | undefined): string {
  if (!iconPath) return FALLBACK_ICON;
  rejectControlCharacters(iconPath, 'Icon');
  if (!path.isAbsolute(iconPath)) return FALLBACK_ICON;

  const iconRoot = path.resolve(path.join(resolveDataDir(), 'icons'));
  const candidate = path.resolve(iconPath);

  try {
    const realIconRoot = fs.realpathSync(iconRoot);
    const realCandidate = fs.realpathSync(candidate);
    const relative = path.relative(realIconRoot, realCandidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return FALLBACK_ICON;

    const stat = fs.lstatSync(candidate);
    return stat.isFile() ? candidate : FALLBACK_ICON;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return FALLBACK_ICON;
    throw error;
  }
}

function validatedProfile(profile: Profile): Pick<Profile, 'id' | 'name' | 'desktopConfig' | 'iconPath'> {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Profile không đúng định dạng.');
  }

  const id = validateProfileId(profile.id);
  const name = validateProfileName(profile.name);
  if (!profile.desktopConfig || typeof profile.desktopConfig.createDesktopShortcut !== 'boolean') {
    throw new Error('desktopConfig.createDesktopShortcut phải là boolean.');
  }
  return { id, name, desktopConfig: profile.desktopConfig, iconPath: profile.iconPath };
}

function validateLauncherPath(launcherPath: string): void {
  if (typeof launcherPath !== 'string' || !path.isAbsolute(launcherPath)) {
    throw new Error('launcherPath phải là đường dẫn tuyệt đối.');
  }
  rejectControlCharacters(launcherPath, 'launcherPath');
  if (launcherPath.includes('=')) {
    throw new Error('launcherPath không được chứa dấu bằng theo chuẩn Desktop Entry.');
  }

  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(launcherPath);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new Error(`Không tìm thấy launcher: ${launcherPath}`);
    throw error;
  }
  if (!stat.isFile() || (stat.mode & 0o111) === 0) {
    throw new Error(`Launcher không phải file executable: ${launcherPath}`);
  }
}

function desktopEntry(profile: Pick<Profile, 'id' | 'name' | 'iconPath'>, launcherPath: string): string {
  const icon = managedIconPath(profile.iconPath);
  return [
    '[Desktop Entry]',
    'Version=1.5',
    'Type=Application',
    `Name=${escapeDesktopString(profile.name)}`,
    `Exec=${quoteExecArg(launcherPath)} --profile ${quoteExecArg(profile.id)}`,
    `Icon=${escapeDesktopString(icon)}`,
    'Terminal=false',
    'Categories=Network;',
    `StartupWMClass=zaloview-${profile.id}`,
    `X-ZaloWebView-ProfileId=${profile.id}`,
    ''
  ].join('\n');
}

function errorResult(targetPath: string, error: unknown): ShortcutSyncResult {
  const message = error instanceof Error ? error.message : String(error);
  return { status: 'error', path: targetPath, message };
}

function ownedEntry(targetPath: string, profileId: string): { exists: false } | { exists: true; content: string } {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(targetPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false };
    throw error;
  }

  if (!stat.isFile()) {
    throw new Error(`Shortcut không phải file regular: ${targetPath}`);
  }
  const content = fs.readFileSync(targetPath, 'utf8');
  const marker = `X-ZaloWebView-ProfileId=${profileId}`;
  const markers = content.split(/\r?\n/).filter((line) => line === marker);
  if (markers.length !== 1) {
    throw new Error(`Shortcut không thuộc profile ${profileId}: ${targetPath}`);
  }
  return { exists: true, content };
}

export async function syncProfileShortcut(profile: Profile, launcherPath: string): Promise<ShortcutSyncResult> {
  const validated = validatedProfile(profile);
  const targetPath = shortcutPath(validated.id);

  if (!validated.desktopConfig.createDesktopShortcut) {
    return removeProfileShortcut(validated.id);
  }

  validateLauncherPath(launcherPath);
  const content = desktopEntry(validated, launcherPath);

  try {
    const existing = ownedEntry(targetPath, validated.id);
    if (!existing.exists) {
      atomicWriteFile(targetPath, content, 0o644);
      return { status: 'created', path: targetPath };
    }
    if (existing.content === content) return { status: 'unchanged', path: targetPath };

    atomicWriteFile(targetPath, content, 0o644);
    return { status: 'updated', path: targetPath };
  } catch (error: unknown) {
    return errorResult(targetPath, error);
  }
}

export async function removeProfileShortcut(profileId: string): Promise<ShortcutSyncResult> {
  const id = validateProfileId(profileId);
  const targetPath = shortcutPath(id);

  try {
    const existing = ownedEntry(targetPath, id);
    if (!existing.exists) return { status: 'unchanged', path: targetPath };
    fs.unlinkSync(targetPath);
    return { status: 'removed', path: targetPath };
  } catch (error: unknown) {
    return errorResult(targetPath, error);
  }
}
