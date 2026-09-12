import * as fs from 'node:fs';
import { PermissionStore, PermissionRecord } from '../shared/types';
import { resolvePermissionsPath } from './xdg-paths';
import { atomicWriteFile } from './atomic-writer';

export class PermissionManager {
  private store: PermissionStore = {};
  private profileId: string;

  constructor(profileId: string) {
    this.profileId = profileId;
    this.load();
  }

  public isPermissionGranted(origin: string, permission: string): boolean {
    const originRecords = this.store[origin];
    if (!originRecords) {
      return false;
    }
    const record = originRecords[permission];
    return record ? record.granted : false;
  }

  public setPermission(origin: string, permission: string, granted: boolean): void {
    if (!this.store[origin]) {
      this.store[origin] = {};
    }
    this.store[origin][permission] = {
      granted,
      updatedAt: new Date().toISOString()
    };
    this.save();
  }

  public getStore(): PermissionStore {
    return { ...this.store };
  }

  private load(): void {
    const permPath = resolvePermissionsPath(this.profileId);
    if (!fs.existsSync(permPath)) {
      this.store = {};
      return;
    }

    try {
      const content = fs.readFileSync(permPath, 'utf-8');
      this.store = JSON.parse(content);
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
