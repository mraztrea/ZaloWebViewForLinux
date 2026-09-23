import { Menu, nativeImage, Tray } from 'electron';
import type { MenuItemConstructorOptions, NativeImage } from 'electron';
import * as path from 'node:path';
import { Profile, XPathObservationState } from '../shared/types';

export type TrayAvailability = 'ready' | 'unavailable' | 'disposed';

export interface TrayState {
  availability: TrayAvailability;
  unread: boolean;
  tooltip: string;
  iconKind: 'normal' | 'unread';
}

export interface TrayLike {
  setImage: (image: NativeImage) => void;
  setToolTip: (toolTip: string) => void;
  setContextMenu: (menu: Menu | null) => void;
  destroy: () => void;
}

export interface TrayManagerDependencies {
  createImage: (imagePath: string) => NativeImage;
  createTray: (image: NativeImage) => TrayLike;
  buildMenu: (template: MenuItemConstructorOptions[]) => Menu;
}

export interface TrayManagerOptions {
  profile: Profile;
  assetsDir: string;
  onOpenWindow: () => void;
  onClearAttention: () => void;
  onOpenManager: () => void;
  onQuitProfile: () => void;
  dependencies?: TrayManagerDependencies;
}

const electronDependencies: TrayManagerDependencies = {
  createImage: (imagePath) => nativeImage.createFromPath(imagePath),
  createTray: (image) => new Tray(image),
  buildMenu: (template) => Menu.buildFromTemplate(template)
};

function loadImage(createImage: TrayManagerDependencies['createImage'], imagePath: string): NativeImage | null {
  try {
    const image = createImage(imagePath);
    return image && !image.isEmpty() ? image : null;
  } catch {
    return null;
  }
}

function getUnreadTooltip(profile: Profile, unread: boolean, state: XPathObservationState | null): string {
  if (!unread) return profile.name;
  if (state?.mode === 'badge_count') return `${state.count} tin nhắn mới`;
  return 'Có thông báo mới';
}

export class TrayManager {
  private readonly profile: Profile;
  private readonly options: TrayManagerOptions;
  private readonly dependencies: TrayManagerDependencies;
  private tray: TrayLike | null = null;
  private normalImage: NativeImage | null = null;
  private unreadImage: NativeImage | null = null;
  private state: TrayState;

  public constructor(options: TrayManagerOptions) {
    this.profile = options.profile;
    this.options = options;
    this.dependencies = options.dependencies ?? electronDependencies;
    this.state = {
      availability: 'unavailable',
      unread: false,
      tooltip: options.profile.name,
      iconKind: 'normal'
    };
    this.initialize();
  }

  public getAvailability(): TrayAvailability {
    return this.state.availability;
  }

  public getState(): TrayState {
    return { ...this.state };
  }

  public isReady(): boolean {
    return this.state.availability === 'ready';
  }

  public setUnread(unread: boolean, observation: XPathObservationState | null): void {
    if (!this.isReady() || !this.tray) return;
    const tooltip = getUnreadTooltip(this.profile, unread, observation);
    const iconKind = unread && this.unreadImage ? 'unread' : 'normal';
    this.state = {
      ...this.state,
      unread,
      tooltip,
      iconKind
    };
    try {
      this.tray.setImage(iconKind === 'unread' ? this.unreadImage! : this.normalImage!);
      this.tray.setToolTip(tooltip);
    } catch {
      // A desktop shell can reject a late tray update; keep the runner usable.
    }
  }

  public destroy(): void {
    if (this.state.availability === 'disposed') return;
    try {
      this.tray?.destroy();
    } catch {
      // Tray destruction is best effort during application teardown.
    }
    this.tray = null;
    this.state = {
      availability: 'disposed',
      unread: false,
      tooltip: this.profile.name,
      iconKind: 'normal'
    };
  }

  private initialize(): void {
    const defaultImagePath = path.join(this.options.assetsDir, 'default-icon.png');
    const unreadImagePath = path.join(this.options.assetsDir, 'unread-icon.png');
    const defaultImage = loadImage(this.dependencies.createImage, defaultImagePath);
    const profileImage = this.profile.iconPath
      ? loadImage(this.dependencies.createImage, this.profile.iconPath)
      : null;
    this.normalImage = profileImage ?? defaultImage;
    if (!this.normalImage) return;

    // Icon 'unread' chỉ là đỏ báo hiệu (không phải ảnh Zalo), giữ nguyên logic hiện có.
    // Xem spec 004: ảnh Zalo dùng cho tray thường (default-icon.png).
    this.unreadImage = loadImage(this.dependencies.createImage, unreadImagePath) ?? defaultImage;
    this.unreadImage ??= this.normalImage;

    let createdTray: TrayLike | null = null;
    try {
      createdTray = this.dependencies.createTray(this.normalImage);
      const menu = this.dependencies.buildMenu([
        { label: 'Mở cửa sổ', click: () => this.options.onOpenWindow() },
        { label: 'Xóa cảnh báo', click: () => this.options.onClearAttention() },
        { label: 'Mở Manager', click: () => this.options.onOpenManager() },
        { label: 'Thoát profile', click: () => this.options.onQuitProfile() }
      ]);
      createdTray.setToolTip(this.profile.name);
      createdTray.setContextMenu(menu);
      this.tray = createdTray;
      this.state = { ...this.state, availability: 'ready' };
    } catch {
      try {
        createdTray?.destroy();
      } catch {
        // ignore cleanup failure
      }
      this.tray = null;
    }
  }
}
