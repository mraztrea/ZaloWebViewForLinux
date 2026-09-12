import { describe, it, expect, vi } from 'vitest';
import { clampWindowBounds, DisplayLike } from '../src/main/screen-utils';
import { canCloseToTray, captureWindowState, restoreRunnerWindow } from '../src/main/window-service';
import { createSampleProfile } from './test-utils';
import { AttentionController } from '../src/main/notifier';

describe('ScreenUtils & Window Boundary Clamping', () => {
  const primaryDisplay: DisplayLike = {
    workArea: { x: 0, y: 0, width: 1920, height: 1080 }
  };

  const secondaryDisplay: DisplayLike = {
    workArea: { x: 1920, y: 0, width: 1920, height: 1080 }
  };

  it('keeps bounds unchanged when window is within display work area', () => {
    const bounds = { x: 100, y: 100, width: 1024, height: 768 };
    const clamped = clampWindowBounds(bounds, [primaryDisplay], primaryDisplay);

    expect(clamped.x).toBe(100);
    expect(clamped.y).toBe(100);
    expect(clamped.width).toBe(1024);
    expect(clamped.height).toBe(768);
  });

  it('keeps bounds when window is on secondary display', () => {
    const bounds = { x: 2000, y: 100, width: 1024, height: 768 };
    const clamped = clampWindowBounds(bounds, [primaryDisplay, secondaryDisplay], primaryDisplay);

    expect(clamped.x).toBe(2000);
    expect(clamped.y).toBe(100);
  });

  it('clamps coordinates to primary display center when secondary display is disconnected', () => {
    // Window was on secondary display at x=2500, but now only primary display is connected
    const bounds = { x: 2500, y: 100, width: 1024, height: 768 };
    const clamped = clampWindowBounds(bounds, [primaryDisplay], primaryDisplay);

    // Expected to center on 1920x1080: x = (1920 - 1024) / 2 = 448; y = (1080 - 768) / 2 = 156
    expect(clamped.x).toBe(448);
    expect(clamped.y).toBe(156);
    expect(clamped.width).toBe(1024);
    expect(clamped.height).toBe(768);
  });

  it('returns untouched bounds if x or y is undefined', () => {
    const bounds = { width: 1024, height: 768 };
    const clamped = clampWindowBounds(bounds, [primaryDisplay], primaryDisplay);

    expect(clamped.x).toBeUndefined();
    expect(clamped.y).toBeUndefined();
    expect(clamped.width).toBe(1024);
    expect(clamped.height).toBe(768);
  });

  it('restores, shows and focuses a minimized or hidden runner', () => {
    const win = {
      isMinimized: () => true,
      restore: vi.fn(),
      isVisible: () => false,
      show: vi.fn(),
      focus: vi.fn()
    };

    restoreRunnerWindow(win as never);

    expect(win.restore).toHaveBeenCalledTimes(1);
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });

  it('allows close-to-tray only when enabled, ready and not quitting', () => {
    const profile = createSampleProfile({ desktopConfig: { ...createSampleProfile().desktopConfig, minimizeToTray: true } });
    expect(canCloseToTray(profile, true, false)).toBe(true);
    expect(canCloseToTray(profile, false, false)).toBe(false);
    expect(canCloseToTray(profile, true, true)).toBe(false);
  });

  it('captures final normal bounds while retaining the maximized state', () => {
    const win = {
      isMaximized: () => false,
      getBounds: () => ({ x: 1, y: 2, width: 3, height: 4 }),
      getNormalBounds: () => ({ x: 10, y: 20, width: 800, height: 600 })
    };
    const previous = { x: 0, y: 0, width: 1024, height: 768, isMaximized: true };

    expect(captureWindowState(win, previous)).toEqual({
      x: 10,
      y: 20,
      width: 800,
      height: 600,
      isMaximized: false
    });
  });

  it('disposes attention resources terminally so later observations have no effects', () => {
    const effects = {
      setFlash: vi.fn(),
      setBadge: vi.fn(),
      setTrayUnread: vi.fn(),
      showPopup: vi.fn(() => true),
      closePopup: vi.fn()
    };
    const controller = new AttentionController({
      profileId: 'test-profile',
      mode: 'badge_count',
      desktopConfig: createSampleProfile().desktopConfig,
      effects,
      now: () => 0
    });
    controller.onObservation({
      mode: 'badge_count',
      hasElement: true,
      count: 5,
      text: '5',
      changedForAlert: true,
      timestamp: 1
    });
    controller.dispose();
    controller.onObservation({
      mode: 'badge_count',
      hasElement: true,
      count: 6,
      text: '6',
      changedForAlert: true,
      timestamp: 2
    });

    expect(effects.showPopup).toHaveBeenCalledTimes(1);
    expect(controller.getStatus()).toEqual({ active: false, mode: 'badge_count', count: 0 });
  });
});
