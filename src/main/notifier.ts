import {
  AttentionStateData,
  DesktopIntegrationConfig,
  MAX_XPATH_TEXT_PREVIEW_LENGTH,
  XPathObservationMode,
  XPathObservationState
} from '../shared/types';

const POPUP_COOLDOWN_MS = 2000;

export interface AttentionEffects {
  setFlash: (enabled: boolean) => void;
  setBadge: (count: number) => void;
  setTrayUnread: (unread: boolean, state: XPathObservationState | null) => void;
  showPopup: (state: XPathObservationState) => boolean;
  closePopup: () => void;
}

export interface AttentionControllerOptions {
  profileId: string;
  mode: XPathObservationMode;
  desktopConfig: DesktopIntegrationConfig;
  effects: AttentionEffects;
  now?: () => number;
}

function hasMeaningfulValue(state: XPathObservationState): boolean {
  if (state.mode === 'badge_count') return state.hasElement && state.count > 0;
  if (state.mode === 'existence') return state.hasElement;
  return state.text.trim().length > 0;
}

export function isValidXPathObservationState(
  state: unknown,
  mode: XPathObservationMode
): state is XPathObservationState {
  return state !== null
    && typeof state === 'object'
    && (state as XPathObservationState).mode === mode
    && typeof (state as XPathObservationState).hasElement === 'boolean'
    && Number.isSafeInteger((state as XPathObservationState).count)
    && (state as XPathObservationState).count >= 0
    && typeof (state as XPathObservationState).text === 'string'
    && (state as XPathObservationState).text.length <= MAX_XPATH_TEXT_PREVIEW_LENGTH
    && typeof (state as XPathObservationState).changedForAlert === 'boolean'
    && Number.isFinite((state as XPathObservationState).timestamp);
}

export class AttentionController {
  private readonly mode: XPathObservationMode;
  private readonly desktopConfig: DesktopIntegrationConfig;
  private readonly effects: AttentionEffects;
  private readonly now: () => number;
  private readonly profileId: string;

  private focused = false;
  private disposed = false;
  private active = false;
  private displayCount = 0;
  private latestState: XPathObservationState | null = null;
  private pendingPopup: XPathObservationState | null = null;
  private popupTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPopupAt: number | null = null;

  public constructor(options: AttentionControllerOptions) {
    this.profileId = options.profileId;
    this.mode = options.mode;
    this.desktopConfig = options.desktopConfig;
    this.effects = options.effects;
    this.now = options.now ?? (() => performance.now());
  }

  public onObservation(state: XPathObservationState): void {
    if (this.disposed || !isValidXPathObservationState(state, this.mode)) return;

    this.latestState = state;
    this.displayCount = state.mode === 'badge_count' ? state.count : 0;

    if (!hasMeaningfulValue(state)) {
      this.clear();
      return;
    }

    if (this.focused) {
      this.render(false);
      return;
    }

    if (state.changedForAlert) {
      this.active = true;
      this.render(true);
      this.schedulePopup(state);
      return;
    }

    if (this.active) this.render(true);
  }

  public setFocused(focused: boolean): void {
    if (this.disposed) return;
    if (this.focused === focused) return;
    this.focused = focused;
    if (focused) this.clear();
  }

  public clear(): boolean {
    if (this.disposed) return false;
    const cleared = this.active || this.displayCount > 0 || this.pendingPopup !== null || this.popupTimer !== null;
    this.active = false;
    this.displayCount = 0;
    this.pendingPopup = null;
    this.lastPopupAt = null;
    this.cancelPopupTimer();
    this.render(false);
    this.effects.closePopup();
    return cleared;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }

  public getStatus(): AttentionStateData {
    return {
      active: this.active,
      mode: this.mode,
      count: this.active && this.mode === 'badge_count' ? this.displayCount : 0
    };
  }

  private getBadgeCount(active: boolean): number {
    if (!active) return 0;
    // existence/text_content chỉ là chỉ báo boolean nên cần badge > 0;
    // badge_count dùng đúng số lượng đang hiển thị.
    return this.mode === 'badge_count' ? this.displayCount : 1;
  }

  private render(active: boolean): void {
    this.effects.setFlash(active && this.desktopConfig.flashTaskbar);
    const badgeCount = this.getBadgeCount(active);
    this.effects.setBadge(this.desktopConfig.showTaskbarBadge ? badgeCount : 0);
    this.effects.setTrayUnread(active, active ? this.latestState : null);
  }

  private schedulePopup(state: XPathObservationState): void {
    if (!this.desktopConfig.showDesktopNotification) return;

    const currentTime = this.now();
    const elapsed = this.lastPopupAt === null ? POPUP_COOLDOWN_MS : currentTime - this.lastPopupAt;
    if (this.lastPopupAt === null || elapsed >= POPUP_COOLDOWN_MS) {
      this.pendingPopup = null;
      this.cancelPopupTimer();
      if (this.tryShowPopup(state)) this.lastPopupAt = currentTime;
      return;
    }

    this.pendingPopup = state;
    if (!this.popupTimer) {
      this.popupTimer = setTimeout(() => {
        this.popupTimer = null;
        this.flushPopup();
      }, POPUP_COOLDOWN_MS - elapsed);
    }
  }

  private flushPopup(): void {
    const pending = this.pendingPopup;
    this.pendingPopup = null;
    if (
      !pending
      || this.disposed
      || !this.active
      || this.focused
      || !this.desktopConfig.showDesktopNotification
      || !this.latestState
      || !hasMeaningfulValue(this.latestState)
    ) return;

    if (this.tryShowPopup(this.latestState)) this.lastPopupAt = this.now();
  }

  private tryShowPopup(state: XPathObservationState): boolean {
    try {
      return this.effects.showPopup(state);
    } catch {
      return false;
    }
  }

  private cancelPopupTimer(): void {
    if (this.popupTimer) clearTimeout(this.popupTimer);
    this.popupTimer = null;
  }
}
