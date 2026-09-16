import { describe, expect, it } from 'vitest';
import { buildExportBundle, parseImportBundle, ProfileTransferError } from '../src/main/profile-transfer';
import { createSampleProfile } from './test-utils';

describe('profile-transfer US1: buildExportBundle', () => {
  it('giữ cấu hình profile, bỏ mốc thời gian và iconPath', () => {
    const profile = createSampleProfile({
      id: 'zalo-a',
      name: 'Zalo A',
      url: 'https://chat.zalo.me',
      userAgent: 'UA-1',
      iconPath: '/data/icons/a.png'
    });

    const bundle = buildExportBundle([profile], () => null, new Date('2026-09-16T09:00:00.000Z'));

    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.exportedAt).toBe('2026-09-16T09:00:00.000Z');
    expect(bundle.profiles).toHaveLength(1);

    const entry = bundle.profiles[0] as unknown as Record<string, unknown>;
    expect(entry.id).toBe('zalo-a');
    expect(entry.name).toBe('Zalo A');
    expect(entry.url).toBe('https://chat.zalo.me');
    expect(entry.userAgent).toBe('UA-1');
    expect(entry.xpathConfig).toEqual(profile.xpathConfig);
    expect(entry.desktopConfig).toEqual(profile.desktopConfig);
    expect(entry).not.toHaveProperty('createdAt');
    expect(entry).not.toHaveProperty('updatedAt');
    expect(entry).not.toHaveProperty('iconPath');
    expect(entry).not.toHaveProperty('icon');
  });

  it('nhúng icon base64 khi đọc được, bỏ icon khi không đọc được', () => {
    const withIcon = createSampleProfile({ id: 'a', iconPath: '/icons/a.png' });
    const withoutIcon = createSampleProfile({ id: 'b', iconPath: '/icons/missing.png' });

    const bundle = buildExportBundle([withIcon, withoutIcon], (path) =>
      path.endsWith('a.png') ? Buffer.from([1, 2, 3]) : null
    );

    expect(bundle.profiles[0].icon).toEqual({
      mimeType: 'image/png',
      data: Buffer.from([1, 2, 3]).toString('base64')
    });
    expect(bundle.profiles[1].icon).toBeUndefined();
  });

  it('danh sách rỗng trả mảng profiles rỗng', () => {
    const bundle = buildExportBundle([], () => null);
    expect(bundle.profiles).toEqual([]);
  });
});

function validProfileJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'zalo-a',
    name: 'Zalo A',
    url: 'https://chat.zalo.me',
    userAgent: 'UA-1',
    xpathConfig: { selector: '//div', mode: 'badge_count', pollIntervalMs: 3000 },
    desktopConfig: {
      flashTaskbar: true,
      showTaskbarBadge: true,
      minimizeToTray: false,
      showDesktopNotification: true,
      createDesktopShortcut: true
    },
    ...overrides
  };
}

function bundleJson(profiles: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ schemaVersion: 1, exportedAt: '2026-09-16T09:00:00.000Z', profiles, ...extra });
}

describe('profile-transfer US2: parseImportBundle', () => {
  it('map profile hợp lệ sang ParsedProfileEntry kèm index và iconBase64', () => {
    const raw = bundleJson([
      validProfileJson({
        icon: { mimeType: 'image/png', data: 'AAECAw==' },
        createdAt: '2000-01-01T00:00:00.000Z',
        foo: 'lạ'
      }),
      validProfileJson({ id: 'zalo-b', name: 'Zalo B' })
    ]);

    const result = parseImportBundle(raw);

    expect(result.invalid).toEqual([]);
    expect(result.entries).toHaveLength(2);
    const [first, second] = result.entries;
    expect(first.index).toBe(0);
    expect(first.id).toBe('zalo-a');
    expect(first.name).toBe('Zalo A');
    expect(first.userAgent).toBe('UA-1');
    expect(first.xpathConfig).toEqual({ selector: '//div', mode: 'badge_count', pollIntervalMs: 3000 });
    expect(first.desktopConfig).toEqual({
      flashTaskbar: true,
      showTaskbarBadge: true,
      minimizeToTray: false,
      showDesktopNotification: true,
      createDesktopShortcut: true
    });
    expect(first.iconBase64).toBe('AAECAw==');
    expect(first as unknown as Record<string, unknown>).not.toHaveProperty('createdAt');
    expect(first as unknown as Record<string, unknown>).not.toHaveProperty('foo');
    expect(second.index).toBe(1);
    expect(second.iconBase64).toBeUndefined();
  });

  it('từ chối tệp sai cấu trúc', () => {
    expect(() => parseImportBundle('{hong')).toThrow(ProfileTransferError);
    expect(() => parseImportBundle('[]')).toThrow(ProfileTransferError);
    expect(() => parseImportBundle(bundleJson([], { schemaVersion: 2 }))).toThrow(ProfileTransferError);
    expect(() => parseImportBundle(JSON.stringify({ schemaVersion: 1, profiles: {} }))).toThrow(
      ProfileTransferError
    );
  });

  it('gom profile không hợp lệ vào invalid kèm index, không chặn mục khác', () => {
    const raw = bundleJson([
      validProfileJson({ id: 'ok-1' }),
      validProfileJson({ id: 'bad-name', name: '' }),
      validProfileJson({ id: 'bad-url', url: 'ftp://x' }),
      validProfileJson({ id: 'bad-mode', xpathConfig: { selector: '', mode: 'lạ', pollIntervalMs: 3000 } }),
      validProfileJson({ id: 'bad-interval', xpathConfig: { selector: '', mode: 'badge_count', pollIntervalMs: 5 } }),
      validProfileJson({ id: 'bad-bool', desktopConfig: { flashTaskbar: 'yes' } }),
      validProfileJson({ id: 'ok-2' })
    ]);

    const result = parseImportBundle(raw);

    expect(result.entries.map((entry) => entry.id)).toEqual(['ok-1', 'ok-2']);
    expect(result.invalid.map((item) => item.index)).toEqual([1, 2, 3, 4, 5]);
    for (const item of result.invalid) expect(item.reason.length).toBeGreaterThan(0);
  });

  it('bỏ icon thiếu mimeType/data nhưng vẫn nhận profile; mảng rỗng trả entries rỗng', () => {
    const withoutIcon = parseImportBundle(bundleJson([validProfileJson({ icon: { mimeType: 1 } })]));
    expect(withoutIcon.invalid).toEqual([]);
    expect(withoutIcon.entries[0].iconBase64).toBeUndefined();

    const empty = parseImportBundle(bundleJson([]));
    expect(empty.entries).toEqual([]);
    expect(empty.invalid).toEqual([]);
  });
});

