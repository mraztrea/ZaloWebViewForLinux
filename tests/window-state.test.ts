import { describe, it, expect } from 'vitest';
import { clampWindowBounds, DisplayLike } from '../src/main/screen-utils';

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
});
