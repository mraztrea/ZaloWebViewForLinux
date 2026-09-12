import { describe, expect, it, vi } from 'vitest';
import { NativeImage } from 'electron';
import { TrayManager, TrayLike, TrayManagerDependencies } from '../src/main/tray-manager';
import { createSampleProfile } from './test-utils';

interface FakeImage {
  id: string;
  empty: boolean;
  isEmpty: () => boolean;
}

function createTrayDependencies(overrides: Partial<TrayManagerDependencies> = {}) {
  const images = new Map<string, FakeImage>();
  const tray = {
    setImage: vi.fn(),
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    destroy: vi.fn()
  } as unknown as TrayLike;
  let initialImage: NativeImage | null = null;
  let template: Array<{ label: string; click?: () => void }> = [];

  const dependencies: TrayManagerDependencies = {
    createImage: (imagePath) => {
      const image = images.get(imagePath) ?? { id: imagePath, empty: false, isEmpty() { return this.empty; } };
      images.set(imagePath, image);
      return image as unknown as NativeImage;
    },
    createTray: (image) => {
      initialImage = image;
      return tray;
    },
    buildMenu: (items) => {
      template = items as Array<{ label: string; click?: () => void }>;
      return {} as never;
    },
    ...overrides
  };

  return { dependencies, images, tray, getTemplate: () => template, getInitialImage: () => initialImage };
}

describe('TrayManager', () => {
  it('uses valid idle/unread images and updates mode-correct tooltip', () => {
    const deps = createTrayDependencies();
    const manager = new TrayManager({
      profile: createSampleProfile({ name: 'Zalo' }),
      assetsDir: '/assets',
      onOpenWindow: vi.fn(),
      onClearAttention: vi.fn(),
      onOpenManager: vi.fn(),
      onQuitProfile: vi.fn(),
      dependencies: deps.dependencies
    });

    expect(manager.getAvailability()).toBe('ready');
    expect(deps.tray.setToolTip).toHaveBeenLastCalledWith('Zalo');
    expect((deps.getInitialImage() as unknown as FakeImage).id).toBe('/assets/default-icon.png');

    manager.setUnread(true, {
      mode: 'badge_count',
      hasElement: true,
      count: 6,
      text: '6',
      changedForAlert: true,
      timestamp: 1
    });
    expect(deps.tray.setToolTip).toHaveBeenLastCalledWith('6 tin nhắn mới');
    expect(deps.tray.setImage).toHaveBeenCalledTimes(1);
    expect((deps.tray.setImage as ReturnType<typeof vi.fn>).mock.calls[0][0].id)
      .toBe('/assets/unread-icon.png');

    manager.setUnread(true, {
      mode: 'existence',
      hasElement: true,
      count: 0,
      text: '',
      changedForAlert: true,
      timestamp: 2
    });
    expect(deps.tray.setToolTip).toHaveBeenLastCalledWith('Có thông báo mới');
  });

  it('falls back from an invalid profile icon and reports unavailable when default is invalid', () => {
    const deps = createTrayDependencies();
    const profileIcon = '/profile.png';
    deps.images.set(profileIcon, { id: profileIcon, empty: true, isEmpty() { return this.empty; } });
    const manager = new TrayManager({
      profile: createSampleProfile({ iconPath: profileIcon }),
      assetsDir: '/assets',
      onOpenWindow: vi.fn(),
      onClearAttention: vi.fn(),
      onOpenManager: vi.fn(),
      onQuitProfile: vi.fn(),
      dependencies: deps.dependencies
    });

    expect(manager.getAvailability()).toBe('ready');
    expect(deps.images.has('/assets/default-icon.png')).toBe(true);

    const unavailableDeps = createTrayDependencies({
      createImage: () => ({ isEmpty: () => true } as unknown as NativeImage)
    });
    const unavailable = new TrayManager({
      profile: createSampleProfile(),
      assetsDir: '/assets',
      onOpenWindow: vi.fn(),
      onClearAttention: vi.fn(),
      onOpenManager: vi.fn(),
      onQuitProfile: vi.fn(),
      dependencies: unavailableDeps.dependencies
    });
    expect(unavailable.getAvailability()).toBe('unavailable');
  });

  it('wires all menu callbacks and destroys the tray once', () => {
    const onOpenWindow = vi.fn();
    const onClearAttention = vi.fn();
    const onOpenManager = vi.fn();
    const onQuitProfile = vi.fn();
    const deps = createTrayDependencies();
    const manager = new TrayManager({
      profile: createSampleProfile(),
      assetsDir: '/assets',
      onOpenWindow,
      onClearAttention,
      onOpenManager,
      onQuitProfile,
      dependencies: deps.dependencies
    });

    for (const item of deps.getTemplate()) item.click?.();
    expect(onOpenWindow).toHaveBeenCalledTimes(1);
    expect(onClearAttention).toHaveBeenCalledTimes(1);
    expect(onOpenManager).toHaveBeenCalledTimes(1);
    expect(onQuitProfile).toHaveBeenCalledTimes(1);

    manager.destroy();
    manager.destroy();
    expect(deps.tray.destroy).toHaveBeenCalledTimes(1);
    expect(manager.getAvailability()).toBe('disposed');
  });
});
