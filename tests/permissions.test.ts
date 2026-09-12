import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTempXdgEnvironment, TestXdgEnvironment } from './test-utils';
import { PermissionManager } from '../src/main/permission-manager';

describe('PermissionManager', () => {
  let env: TestXdgEnvironment;

  beforeEach(() => {
    env = createTempXdgEnvironment();
    process.env.XDG_DATA_HOME = env.dataHome;
  });

  afterEach(() => {
    env.cleanup();
  });

  it('defaults to false for ungranted origin permissions', () => {
    const pm = new PermissionManager('test-acc');
    expect(pm.isPermissionGranted('https://chat.zalo.me', 'media')).toBe(false);
  });

  it('stores and retrieves origin-specific permissions accurately', () => {
    const pm = new PermissionManager('test-acc');

    pm.setPermission('https://chat.zalo.me', 'media', true);

    expect(pm.isPermissionGranted('https://chat.zalo.me', 'media')).toBe(true);
    // Other origin should NOT inherit permission
    expect(pm.isPermissionGranted('https://malicious.example.com', 'media')).toBe(false);
    // Other permission on same origin should be false
    expect(pm.isPermissionGranted('https://chat.zalo.me', 'geolocation')).toBe(false);
  });

  it('persists permissions to disk across instances', () => {
    const pm1 = new PermissionManager('test-acc');
    pm1.setPermission('https://chat.zalo.me', 'media', true);

    const pm2 = new PermissionManager('test-acc');
    expect(pm2.isPermissionGranted('https://chat.zalo.me', 'media')).toBe(true);
  });
});
