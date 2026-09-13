/**
 * Manager Preload Script (Isolated Sandbox)
 * contextIsolation: true, nodeIntegration: false, sandbox: true
 *
 * Chỉ expose từng API quản lý qua `window.zaloview`. Không expose cơ chế
 * gọi chung (generic invoke), `ipcRenderer` hay event cho renderer.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type {
  ManagerRunnerStatus,
  ManagerSaveResult,
  Profile,
  RunnerStatusData,
  ShortcutSyncResult,
  XPathEvaluationResult,
  XPathObservationMode
} from '../shared/types';

export interface SaveProfileInput {
  id?: string;
  name: string;
  url: string;
  iconPath?: string;
  userAgent?: string;
  xpathConfig?: Profile['xpathConfig'];
  desktopConfig?: Profile['desktopConfig'];
}

export interface ToggleShortcutResult {
  saved: Profile;
  shortcut: ShortcutSyncResult;
}

export interface LaunchResult {
  requested: true;
  profileId: string;
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

export interface ManagerBridgeApi {
  getProfiles(): Promise<Profile[]>;
  saveProfile(input: SaveProfileInput): Promise<ManagerSaveResult>;
  deleteProfile(profileId: string): Promise<DeleteProfileResult>;
  launchProfile(profileId: string): Promise<LaunchResult>;
  toggleShortcut(profileId: string, enabled: boolean): Promise<ToggleShortcutResult>;
  getRunnerStatus(profileId: string): Promise<ManagerRunnerStatus>;
  clearAttention(profileId: string): Promise<ClearAttentionResult>;
  testXPath(profileId: string, selector: string, mode: XPathObservationMode): Promise<XPathEvaluationResult>;
  chooseIcon(): Promise<IconResult | null>;
  fetchIcon(url: string): Promise<IconResult>;
  deleteProfileSession(profileId: string): Promise<DeleteSessionResult>;
}

const api: ManagerBridgeApi = {
  getProfiles: () => ipcRenderer.invoke('zaloview:get-profiles'),
  saveProfile: (input: SaveProfileInput) => ipcRenderer.invoke('zaloview:save-profile', input),
  deleteProfile: (profileId: string) => ipcRenderer.invoke('zaloview:delete-profile', profileId),
  launchProfile: (profileId: string) => ipcRenderer.invoke('zaloview:launch-profile', profileId),
  toggleShortcut: (profileId: string, enabled: boolean) =>
    ipcRenderer.invoke('zaloview:toggle-shortcut', profileId, enabled),
  getRunnerStatus: (profileId: string) => ipcRenderer.invoke('zaloview:get-runner-status', profileId),
  clearAttention: (profileId: string) => ipcRenderer.invoke('zaloview:clear-attention', profileId),
  testXPath: (profileId: string, selector: string, mode: XPathObservationMode) =>
    ipcRenderer.invoke('zaloview:test-xpath', profileId, selector, mode),
  chooseIcon: () => ipcRenderer.invoke('zaloview:choose-icon'),
  fetchIcon: (url: string) => ipcRenderer.invoke('zaloview:fetch-icon', url),
  deleteProfileSession: (profileId: string) => ipcRenderer.invoke('zaloview:delete-profile-session', profileId)
};

contextBridge.exposeInMainWorld('zaloview', api);

declare global {
  interface Window {
    zaloview: ManagerBridgeApi;
  }
}

// Giữ tham chiếu kiểu để RunnerStatusData không bị coi là import thừa khi kiểm tra isolatedModules.
export type { RunnerStatusData };
