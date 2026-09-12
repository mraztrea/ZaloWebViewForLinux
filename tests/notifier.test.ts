import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttentionController, AttentionEffects } from '../src/main/notifier';
import { DesktopIntegrationConfig, XPathObservationState } from '../src/shared/types';

const desktopConfig: DesktopIntegrationConfig = {
  flashTaskbar: true,
  showTaskbarBadge: true,
  minimizeToTray: false,
  showDesktopNotification: true,
  createDesktopShortcut: true
};

function observation(overrides: Partial<XPathObservationState> = {}): XPathObservationState {
  return {
    mode: 'badge_count',
    hasElement: true,
    count: 5,
    text: '5',
    changedForAlert: true,
    timestamp: 0,
    ...overrides
  };
}

function createController(now: () => number, effects: Partial<AttentionEffects> = {}) {
  const allEffects: AttentionEffects = {
    setFlash: vi.fn(),
    setBadge: vi.fn(),
    setTrayUnread: vi.fn(),
    showPopup: vi.fn(() => true),
    closePopup: vi.fn(),
    ...effects
  };
  const controller = new AttentionController({
    profileId: 'test-profile',
    mode: 'badge_count',
    desktopConfig,
    effects: allEffects,
    now
  });
  return { controller, effects: allEffects };
}

describe('AttentionController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('alerts only the profile receiving a background change', () => {
    let clock = 0;
    const first = createController(() => clock);
    const second = createController(() => clock);

    first.controller.onObservation(observation());

    expect(first.controller.getStatus()).toEqual({ active: true, mode: 'badge_count', count: 5 });
    expect(second.controller.getStatus()).toEqual({ active: false, mode: 'badge_count', count: 0 });
    expect(first.effects.setFlash).toHaveBeenCalledWith(true);
    expect(first.effects.setBadge).toHaveBeenCalledWith(5);
    expect(first.effects.setTrayUnread).toHaveBeenCalledWith(true, observation());
    expect(first.effects.showPopup).toHaveBeenCalledTimes(1);
    expect(second.effects.showPopup).not.toHaveBeenCalled();
    clock = 1;
  });

  it('updates a decreasing count without another popup', () => {
    const result = createController(() => 0);
    result.controller.onObservation(observation());
    result.controller.onObservation(observation({ count: 3, text: '3', changedForAlert: false }));

    expect(result.controller.getStatus()).toEqual({ active: true, mode: 'badge_count', count: 3 });
    expect(result.effects.setBadge).toHaveBeenLastCalledWith(3);
    expect(result.effects.showPopup).toHaveBeenCalledTimes(1);
  });

  it('coalesces cooldown events and shows the newest state', () => {
    let clock = 0;
    const result = createController(() => clock);

    result.controller.onObservation(observation({ count: 5 }));
    clock = 500;
    result.controller.onObservation(observation({ count: 6, text: '6' }));
    clock = 1000;
    result.controller.onObservation(observation({ count: 7, text: '7' }));

    expect(result.effects.showPopup).toHaveBeenCalledTimes(1);
    clock = 2000;
    vi.advanceTimersByTime(1500);
    expect(result.effects.showPopup).toHaveBeenCalledTimes(2);
    expect(result.effects.showPopup).toHaveBeenLastCalledWith(observation({ count: 7, text: '7' }));
  });

  it('preserves baseline semantics across focus and blur', () => {
    let clock = 0;
    const result = createController(() => clock);

    result.controller.onObservation(observation({ count: 5 }));
    result.controller.setFocused(true);
    result.controller.setFocused(false);
    result.controller.onObservation(observation({ count: 5, changedForAlert: false }));
    expect(result.effects.showPopup).toHaveBeenCalledTimes(1);

    clock = 2001;
    result.controller.onObservation(observation({ count: 6, text: '6' }));
    expect(result.controller.getStatus().active).toBe(true);
    expect(result.effects.showPopup).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending popup when state becomes zero', () => {
    let clock = 0;
    const result = createController(() => clock);

    result.controller.onObservation(observation({ count: 5 }));
    clock = 500;
    result.controller.onObservation(observation({ count: 6, text: '6' }));
    result.controller.onObservation(observation({ count: 0, text: '0', changedForAlert: false }));
    vi.advanceTimersByTime(2000);

    expect(result.controller.getStatus()).toEqual({ active: false, mode: 'badge_count', count: 0 });
    expect(result.effects.showPopup).toHaveBeenCalledTimes(1);
    expect(result.effects.setBadge).toHaveBeenLastCalledWith(0);
  });

  it('clears active attention idempotently without changing the latest observation', () => {
    const result = createController(() => 0);
    result.controller.onObservation(observation({ count: 5 }));

    expect(result.controller.clear()).toBe(true);
    expect(result.controller.clear()).toBe(false);
    expect(result.controller.getStatus()).toEqual({ active: false, mode: 'badge_count', count: 0 });
    expect(result.effects.closePopup).toHaveBeenCalledTimes(2);
    expect(result.effects.setTrayUnread).toHaveBeenLastCalledWith(false, null);
  });

  it('updates baseline while focused without creating attention', () => {
    const result = createController(() => 0);
    result.controller.setFocused(true);
    result.controller.onObservation(observation({ count: 5 }));

    expect(result.controller.getStatus().active).toBe(false);
    expect(result.effects.showPopup).not.toHaveBeenCalled();
    expect(result.effects.setFlash).toHaveBeenLastCalledWith(false);
  });

  it('ignores observations outside the validated preview range', () => {
    const result = createController(() => 0);
    result.controller.onObservation(observation({ text: 'x'.repeat(501) }));

    expect(result.controller.getStatus()).toEqual({ active: false, mode: 'badge_count', count: 0 });
    expect(result.effects.showPopup).not.toHaveBeenCalled();
  });

  it('keeps desktop indicators working when popup creation fails', () => {
    const result = createController(() => 0, {
      showPopup: vi.fn(() => {
        throw new Error('unsupported');
      })
    });

    expect(() => result.controller.onObservation(observation())).not.toThrow();
    expect(result.controller.getStatus()).toEqual({ active: true, mode: 'badge_count', count: 5 });
    expect(result.effects.setBadge).toHaveBeenLastCalledWith(5);
  });
});
