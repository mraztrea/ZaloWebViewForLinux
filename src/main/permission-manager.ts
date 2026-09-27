import * as fs from 'node:fs';
import { PermissionStore } from '../shared/types';
import { resolvePermissionsPath } from './xdg-paths';
import { atomicWriteFile } from './atomic-writer';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class PermissionManager {
  private store: PermissionStore = {};
  private profileId: string;

  constructor(profileId: string) {
    this.profileId = profileId;
    this.load();
  }

  /** Quyết định đã lưu cho origin/quyền; undefined nếu người dùng chưa chọn. */
  public getPermission(origin: string, permission: string): boolean | undefined {
    const originRecords = Object.hasOwn(this.store, origin) ? this.store[origin] : undefined;
    const record = originRecords && Object.hasOwn(originRecords, permission) ? originRecords[permission] : undefined;
    return typeof record?.granted === 'boolean' ? record.granted : undefined;
  }

  public isPermissionGranted(origin: string, permission: string): boolean {
    return this.getPermission(origin, permission) === true;
  }

  public setPermission(origin: string, permission: string, granted: boolean): void {
    if (!Object.hasOwn(this.store, origin)) {
      this.store[origin] = {};
    }
    this.store[origin][permission] = {
      granted,
      updatedAt: new Date().toISOString()
    };
    this.save();
  }

  private load(): void {
    const permPath = resolvePermissionsPath(this.profileId);
    this.store = {};
    if (!fs.existsSync(permPath)) return;

    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(permPath, 'utf-8'));
      // Bỏ qua tệp hỏng/sai cấu trúc thay vì để handler quyền ném lỗi.
      if (!isRecord(parsed)) return;
      for (const [origin, records] of Object.entries(parsed)) {
        if (isRecord(records)) this.store[origin] = records as PermissionStore[string];
      }
    } catch {
      this.store = {};
    }
  }

  private save(): void {
    const permPath = resolvePermissionsPath(this.profileId);
    const content = JSON.stringify(this.store, null, 2);
    atomicWriteFile(permPath, content);
  }
}
