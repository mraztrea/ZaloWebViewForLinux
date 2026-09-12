import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSampleProfile, createTempXdgEnvironment, TestXdgEnvironment } from './test-utils';
import { PermissionManager } from '../src/main/permission-manager';
import { shouldAllowProfilePermission } from '../src/main/window-service';

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

  it('suppresses website notifications when XPath desktop popup is enabled', () => {
    const pm = new PermissionManager('test-acc');
    pm.setPermission('https://chat.zalo.me', 'notifications', true);
    const profile = createSampleProfile({
      desktopConfig: { ...createSampleProfile().desktopConfig, showDesktopNotification: true }
    });

    expect(shouldAllowProfilePermission(profile, 'notifications', 'https://chat.zalo.me', pm)).toBe(false);
  });

  it('preserves the stored website notification choice when XPath popup is disabled', () => {
    const pm = new PermissionManager('test-acc');
    pm.setPermission('https://chat.zalo.me', 'notifications', true);
    const profile = createSampleProfile({
      desktopConfig: { ...createSampleProfile().desktopConfig, showDesktopNotification: false }
    });

    expect(shouldAllowProfilePermission(profile, 'notifications', 'https://chat.zalo.me', pm)).toBe(true);
  });

  it('does not suppress a different origin when XPath popup is enabled', () => {
    const pm = new PermissionManager('test-acc');
    pm.setPermission('https://id.zalo.me', 'notifications', true);
    const profile = createSampleProfile();

    expect(shouldAllowProfilePermission(profile, 'notifications', 'https://id.zalo.me', pm)).toBe(true);
  });
});
