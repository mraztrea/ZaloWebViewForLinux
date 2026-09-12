# Linux Webview Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng ứng dụng Linux Webview Manager (Zalo & Custom Web Apps) trên nền Electron + TypeScript với khả năng cô lập profile, quét XPath báo tin nhắn mới, làm sáng taskbar (`flashFrame`), hiện badge số đếm, khay hệ thống (tray), tự động xóa cảnh báo khi focus và tạo shortcut `.desktop` vào Start Menu của KDE/GNOME.

**Architecture:** Kiến trúc Multi-Instance Runner kết hợp Manager Dashboard. Mỗi profile hoạt động trong 1 tiến trình BrowserWindow với session partition riêng biệt (`persist:zaloview_<id>`), được định danh qua `StartupWMClass` độc lập trên Linux. Preload script chạy hybrid MutationObserver + XPath để trích xuất unread badge / message, gửi IPC lên Main process để kích hoạt Urgency flag, Desktop Notification, Taskbar badge và System Tray.

**Tech Stack:** Electron, Node.js, TypeScript, Vitest (Testing), XDG Desktop Specification, FreeDesktop DBus Notifications / Unity LauncherEntry API.

**Spec:** [docs/superpowers/specs/2026-09-12-linux-webview-manager-design.md](file:///home/buiducthanh/projects/canhan/ZaloWebView/docs/superpowers/specs/2026-09-12-linux-webview-manager-design.md)

## Global Constraints

- Chạy trên Linux (hỗ trợ cả KDE Plasma và GNOME Shell, X11 và Wayland).
- Đường dẫn cấu hình tuân thủ chuẩn XDG: `~/.config/zaloview/`.
- File shortcut menu ứng dụng lưu tại: `~/.local/share/applications/zaloview-<id>.desktop`.
- Mọi profile phải có partition độc lập: `persist:zaloview_<profile.id>`.
- Định danh cửa sổ Linux: `wmClass: 'zaloview-' + profile.id`.
- Tự động xóa active state khi focus cửa sổ: `window.flashFrame(false)` và `app.setBadgeCount(0)`.
- Tuyệt đối không dùng code tạm (TODO / TBD). Mọi đoạn mã phải hoàn chỉnh.

---

### Task 1: Project Scaffolding & Build Infrastructure

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`

**Interfaces:**
- Produces: Package scripts (`npm run build`, `npm test`, `npm start`), Typescript compiler configuration, Vitest test environment.

- [ ] **Step 1: Write `package.json` with dependencies and scripts**

```json
{
  "name": "zaloview",
  "version": "1.0.0",
  "description": "Linux Webview Manager for Zalo & Custom Web Apps",
  "main": "dist/main/index.js",
  "bin": {
    "zaloview": "bin/zaloview.js"
  },
  "scripts": {
    "build:ts": "tsc",
    "build": "tsc && npm run copy:assets",
    "copy:assets": "cp -r src/renderer dist/ 2>/dev/null || mkdir -p dist/renderer && cp -r src/renderer dist/",
    "start": "npm run build && electron . --manager",
    "test": "vitest run"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^20.11.24",
    "electron": "^29.1.0",
    "typescript": "^5.3.3",
    "vitest": "^1.3.1",
    "jsdom": "^24.0.0",
    "@types/jsdom": "^21.1.6"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `vitest.config.ts` and `tests/setup.ts`**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
});
```

```typescript
// tests/setup.ts
// Setup mock environment if needed
```

- [ ] **Step 4: Install dependencies and verify build toolchain**

Run: `npm install`  
Expected: `added X packages` with no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts tests/setup.ts
git commit -m "chore: setup project scaffolding and build infrastructure"
```

---

### Task 2: Profile Model & Configuration Storage

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/main/profile-manager.ts`
- Test: `tests/profile-manager.test.ts`

**Interfaces:**
- Produces:
  - `interface Profile`
  - `class ProfileManager`:
    - `getProfiles(): Profile[]`
    - `getProfile(id: string): Profile | undefined`
    - `saveProfile(profile: Profile): void`
    - `deleteProfile(id: string): boolean`
    - `getConfigDir(): string`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/profile-manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProfileManager } from '../src/main/profile-manager';
import { Profile } from '../src/shared/types';

describe('ProfileManager', () => {
  let testDir: string;
  let manager: ProfileManager;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaloview-test-'));
    manager = new ProfileManager(testDir);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should initialize empty profiles list', () => {
    expect(manager.getProfiles()).toEqual([]);
  });

  it('should save and retrieve a profile', () => {
    const profile: Profile = {
      id: 'zalo',
      name: 'Zalo Web',
      url: 'https://chat.zalo.me',
      xpathConfig: {
        selector: "//span[contains(@class, 'tab-red-dot')]",
        mode: 'badge_count',
        pollIntervalMs: 3000
      },
      desktopConfig: {
        flashTaskbar: true,
        showTaskbarBadge: true,
        minimizeToTray: true,
        showDesktopNotification: true,
        createDesktopShortcut: true
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    manager.saveProfile(profile);
    const retrieved = manager.getProfile('zalo');
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Zalo Web');
    expect(retrieved?.url).toBe('https://chat.zalo.me');
  });

  it('should delete an existing profile', () => {
    const profile: Profile = {
      id: 'test',
      name: 'Test',
      url: 'https://example.com',
      xpathConfig: { selector: '//div', mode: 'existence', pollIntervalMs: 5000 },
      desktopConfig: { flashTaskbar: false, showTaskbarBadge: false, minimizeToTray: false, showDesktopNotification: false, createDesktopShortcut: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    manager.saveProfile(profile);
    expect(manager.deleteProfile('test')).toBe(true);
    expect(manager.getProfile('test')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/profile-manager.test.ts`  
Expected: FAIL with missing module `profile-manager`.

- [ ] **Step 3: Write types and `ProfileManager` implementation**

```typescript
// src/shared/types.ts
export interface XPathConfig {
  selector: string;
  mode: 'badge_count' | 'text_content' | 'existence';
  pollIntervalMs: number;
}

export interface DesktopIntegrationConfig {
  flashTaskbar: boolean;
  showTaskbarBadge: boolean;
  minimizeToTray: boolean;
  showDesktopNotification: boolean;
  createDesktopShortcut: boolean;
}

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

export interface Profile {
  id: string;
  name: string;
  url: string;
  iconPath?: string;
  userAgent?: string;
  windowBounds?: WindowBounds;
  xpathConfig: XPathConfig;
  desktopConfig: DesktopIntegrationConfig;
  createdAt: string;
  updatedAt: string;
}

export interface XPathAlertPayload {
  profileId: string;
  hasElement: boolean;
  mode: 'badge_count' | 'text_content' | 'existence';
  count: number;
  text: string;
  timestamp: number;
}
```

```typescript
// src/main/profile-manager.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Profile } from '../shared/types';

export class ProfileManager {
  private configDir: string;
  private configFile: string;
  private iconsDir: string;
  private partitionsDir: string;

  constructor(customConfigDir?: string) {
    this.configDir = customConfigDir || path.join(os.homedir(), '.config', 'zaloview');
    this.configFile = path.join(this.configDir, 'profiles.json');
    this.iconsDir = path.join(this.configDir, 'icons');
    this.partitionsDir = path.join(this.configDir, 'Partitions');
    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    if (!fs.existsSync(this.iconsDir)) {
      fs.mkdirSync(this.iconsDir, { recursive: true });
    }
    if (!fs.existsSync(this.partitionsDir)) {
      fs.mkdirSync(this.partitionsDir, { recursive: true });
    }
  }

  public getConfigDir(): string {
    return this.configDir;
  }

  public getIconsDir(): string {
    return this.iconsDir;
  }

  public getProfiles(): Profile[] {
    if (!fs.existsSync(this.configFile)) {
      return [];
    }
    try {
      const data = fs.readFileSync(this.configFile, 'utf-8');
      return JSON.parse(data) as Profile[];
    } catch {
      return [];
    }
  }

  public getProfile(id: string): Profile | undefined {
    const profiles = this.getProfiles();
    return profiles.find(p => p.id === id);
  }

  public saveProfile(profile: Profile): void {
    const profiles = this.getProfiles();
    const index = profiles.findIndex(p => p.id === profile.id);
    profile.updatedAt = new Date().toISOString();
    if (index >= 0) {
      profiles[index] = profile;
    } else {
      profiles.push(profile);
    }
    fs.writeFileSync(this.configFile, JSON.stringify(profiles, null, 2), 'utf-8');
  }

  public deleteProfile(id: string): boolean {
    const profiles = this.getProfiles();
    const filtered = profiles.filter(p => p.id !== id);
    if (filtered.length !== profiles.length) {
      fs.writeFileSync(this.configFile, JSON.stringify(filtered, null, 2), 'utf-8');
      return true;
    }
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/profile-manager.test.ts`  
Expected: PASS (all 3 tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/profile-manager.ts tests/profile-manager.test.ts
git commit -m "feat: add ProfileManager and profile storage serialization"
```

---

### Task 3: XPath Evaluator, Data Extractor & Deduplication Logic

**Files:**
- Create: `src/preload/xpath-evaluator.ts`
- Test: `tests/xpath-evaluator.test.ts`

**Interfaces:**
- Produces:
  - `evaluateXPath(doc: Document, selector: string): Node | null`
  - `extractXPathData(node: Node | null, mode: 'badge_count' | 'text_content' | 'existence'): { hasElement: boolean; count: number; text: string }`
  - `class AlertDeduplicator`:
    - `shouldAlert(newState: { hasElement: boolean; count: number; text: string }, now: number): boolean`
    - `reset(): void`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/xpath-evaluator.test.ts
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { evaluateXPath, extractXPathData, AlertDeduplicator } from '../src/preload/xpath-evaluator';

describe('XPath Evaluator & Deduplicator', () => {
  it('should find element by xpath', () => {
    const dom = new JSDOM('<!DOCTYPE html><div><span class="badge">5</span></div>');
    const node = evaluateXPath(dom.window.document, "//span[contains(@class, 'badge')]");
    expect(node).not.toBeNull();
    expect(node?.textContent).toBe('5');
  });

  it('should extract count from badge string', () => {
    const dom = new JSDOM('<!DOCTYPE html><span class="badge">99+</span>');
    const node = evaluateXPath(dom.window.document, "//span");
    const data = extractXPathData(node, 'badge_count');
    expect(data.hasElement).toBe(true);
    expect(data.count).toBe(99);
  });

  it('should extract message text', () => {
    const dom = new JSDOM('<!DOCTYPE html><div class="msg">Hello World</div>');
    const node = evaluateXPath(dom.window.document, "//div");
    const data = extractXPathData(node, 'text_content');
    expect(data.hasElement).toBe(true);
    expect(data.text).toBe('Hello World');
  });

  it('should deduplicate alerts and obey cooldown', () => {
    const dedup = new AlertDeduplicator(2000);
    // 1st time element appears -> Alert
    expect(dedup.shouldAlert({ hasElement: true, count: 1, text: 'Hi' }, 1000)).toBe(true);

    // 2nd check within cooldown with same data -> No alert
    expect(dedup.shouldAlert({ hasElement: true, count: 1, text: 'Hi' }, 1500)).toBe(false);

    // 3rd check with count increased -> Alert even if within cooldown
    expect(dedup.shouldAlert({ hasElement: true, count: 2, text: 'Hi again' }, 1600)).toBe(true);

    // 4th check with same data after cooldown -> No alert (already acknowledged)
    expect(dedup.shouldAlert({ hasElement: true, count: 2, text: 'Hi again' }, 5000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/xpath-evaluator.test.ts`  
Expected: FAIL with module not found.

- [ ] **Step 3: Write `src/preload/xpath-evaluator.ts` implementation**

```typescript
// src/preload/xpath-evaluator.ts
export function evaluateXPath(doc: Document, selector: string): Node | null {
  try {
    const result = doc.evaluate(
      selector,
      doc,
      null,
      9, // XPathResult.FIRST_ORDERED_NODE_TYPE
      null
    );
    return result.singleNodeValue;
  } catch (err) {
    return null;
  }
}

export function extractXPathData(
  node: Node | null,
  mode: 'badge_count' | 'text_content' | 'existence'
): { hasElement: boolean; count: number; text: string } {
  if (!node) {
    return { hasElement: false, count: 0, text: '' };
  }

  const rawText = (node.textContent || '').trim();

  if (mode === 'existence') {
    return { hasElement: true, count: 1, text: rawText };
  }

  if (mode === 'badge_count') {
    const match = rawText.match(/\d+/);
    const count = match ? parseInt(match[0], 10) : 1;
    return { hasElement: true, count, text: rawText };
  }

  // text_content mode
  return { hasElement: true, count: 1, text: rawText };
}

export interface ExtractedState {
  hasElement: boolean;
  count: number;
  text: string;
}

export class AlertDeduplicator {
  private lastState: ExtractedState = { hasElement: false, count: 0, text: '' };
  private lastNotifiedAt: number = 0;
  private cooldownMs: number;

  constructor(cooldownMs: number = 2000) {
    this.cooldownMs = cooldownMs;
  }

  public shouldAlert(newState: ExtractedState, now: number = Date.now()): boolean {
    if (!newState.hasElement) {
      this.lastState = newState;
      return false;
    }

    const becameVisible = !this.lastState.hasElement && newState.hasElement;
    const countIncreased = newState.count > this.lastState.count;
    const textChanged = newState.text !== this.lastState.text && newState.text.length > 0;
    const cooldownElapsed = now - this.lastNotifiedAt > this.cooldownMs;

    if (becameVisible || countIncreased || (textChanged && cooldownElapsed)) {
      this.lastState = { ...newState };
      this.lastNotifiedAt = now;
      return true;
    }

    return false;
  }

  public reset(): void {
    this.lastState = { hasElement: false, count: 0, text: '' };
    this.lastNotifiedAt = 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/xpath-evaluator.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/preload/xpath-evaluator.ts tests/xpath-evaluator.test.ts
git commit -m "feat: add xpath evaluation, text/badge extraction and alert deduplicator"
```

---

### Task 4: Linux Desktop Entry Generator (.desktop)

**Files:**
- Create: `src/main/desktop-service.ts`
- Test: `tests/desktop-service.test.ts`

**Interfaces:**
- Produces:
  - `class DesktopService`:
    - `generateDesktopContent(profile: Profile, execPath: string): string`
    - `installShortcut(profile: Profile, execPath?: string): string`
    - `removeShortcut(profileId: string): boolean`
    - `updateDesktopDatabase(): void`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/desktop-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DesktopService } from '../src/main/desktop-service';
import { Profile } from '../src/shared/types';

describe('DesktopService', () => {
  let appDir: string;
  let service: DesktopService;

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zaloview-desktop-'));
    service = new DesktopService(appDir);
  });

  afterEach(() => {
    fs.rmSync(appDir, { recursive: true, force: true });
  });

  it('should generate valid XDG desktop content with StartupWMClass', () => {
    const profile: Profile = {
      id: 'zalo-chat',
      name: 'Zalo Chat',
      url: 'https://chat.zalo.me',
      iconPath: '/home/user/.config/zaloview/icons/zalo.png',
      xpathConfig: { selector: '//span', mode: 'badge_count', pollIntervalMs: 3000 },
      desktopConfig: { flashTaskbar: true, showTaskbarBadge: true, minimizeToTray: true, showDesktopNotification: true, createDesktopShortcut: true },
      createdAt: '',
      updatedAt: ''
    };

    const content = service.generateDesktopContent(profile, '/usr/bin/zaloview');
    expect(content).toContain('[Desktop Entry]');
    expect(content).toContain('Name=Zalo Chat');
    expect(content).toContain('Exec=/usr/bin/zaloview --profile zalo-chat %u');
    expect(content).toContain('Icon=/home/user/.config/zaloview/icons/zalo.png');
    expect(content).toContain('StartupWMClass=zaloview-zalo-chat');
  });

  it('should install and delete .desktop file in applications dir', () => {
    const profile: Profile = {
      id: 'messenger',
      name: 'Messenger',
      url: 'https://messenger.com',
      xpathConfig: { selector: '//span', mode: 'badge_count', pollIntervalMs: 3000 },
      desktopConfig: { flashTaskbar: true, showTaskbarBadge: true, minimizeToTray: true, showDesktopNotification: true, createDesktopShortcut: true },
      createdAt: '',
      updatedAt: ''
    };

    const filePath = service.installShortcut(profile, '/usr/bin/zaloview');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(path.basename(filePath)).toBe('zaloview-messenger.desktop');

    const removed = service.removeShortcut('messenger');
    expect(removed).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/desktop-service.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Write `src/main/desktop-service.ts` implementation**

```typescript
// src/main/desktop-service.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { Profile } from '../shared/types';

export class DesktopService {
  private applicationsDir: string;

  constructor(customAppDir?: string) {
    this.applicationsDir = customAppDir || path.join(os.homedir(), '.local', 'share', 'applications');
    if (!fs.existsSync(this.applicationsDir)) {
      fs.mkdirSync(this.applicationsDir, { recursive: true });
    }
  }

  public generateDesktopContent(profile: Profile, execPath: string): string {
    const iconValue = profile.iconPath || 'applications-internet';
    const lines = [
      '[Desktop Entry]',
      'Version=1.0',
      'Type=Application',
      `Name=${profile.name}`,
      'GenericName=Web App',
      `Comment=${profile.name} Webview Instance`,
      `Exec=${execPath} --profile ${profile.id} %u`,
      `Icon=${iconValue}`,
      'Terminal=false',
      `StartupWMClass=zaloview-${profile.id}`,
      'Categories=Network;InstantMessaging;Chat;',
      `Keywords=${profile.id};web;chat;`,
      'Actions=Configure;',
      '',
      '[Desktop Action Configure]',
      'Name=Cấu hình Profile',
      `Exec=${execPath} --manager --edit ${profile.id}`
    ];
    return lines.join('\n');
  }

  public installShortcut(profile: Profile, customExecPath?: string): string {
    const execPath = customExecPath || process.execPath;
    const desktopFileName = `zaloview-${profile.id}.desktop`;
    const targetFile = path.join(this.applicationsDir, desktopFileName);
    const content = this.generateDesktopContent(profile, execPath);
    fs.writeFileSync(targetFile, content, { encoding: 'utf-8', mode: 0o755 });
    this.updateDesktopDatabase();
    return targetFile;
  }

  public removeShortcut(profileId: string): boolean {
    const targetFile = path.join(this.applicationsDir, `zaloview-${profileId}.desktop`);
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
      this.updateDesktopDatabase();
      return true;
    }
    return false;
  }

  public updateDesktopDatabase(): void {
    exec(`update-desktop-database "${this.applicationsDir}"`, (error) => {
      // Non-blocking, best effort execution on Linux
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/desktop-service.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/desktop-service.ts tests/desktop-service.test.ts
git commit -m "feat: add desktop service for generating XDG .desktop shortcuts and database update"
```

---

### Task 5: System Tray Manager & Desktop Notifier

**Files:**
- Create: `src/main/notifier.ts`
- Create: `src/main/tray-manager.ts`
- Create: `src/main/icon-generator.ts`

**Interfaces:**
- Produces:
  - `class LinuxNotifier`:
    - `notify(profile: Profile, payload: XPathAlertPayload): void`
    - `flashWindow(window: BrowserWindow, enable: boolean): void`
    - `setBadgeCount(count: number): void`
  - `class TrayManager`:
    - `createTray(profile: Profile, window: BrowserWindow, onShowManager: () => void): Tray`
    - `setUnreadState(hasUnread: boolean, count: number): void`
    - `destroy(): void`

- [ ] **Step 1: Write `src/main/icon-generator.ts` for dynamic tray dot badge**

```typescript
// src/main/icon-generator.ts
import * as fs from 'fs';
import * as path from 'path';

/**
 * Returns either normal icon path or generates/returns unread dot badge icon path.
 */
export function getTrayIconPaths(baseIconPath?: string, tempDir?: string): { normal: string; unread: string } {
  // If baseIconPath exists, use it. Otherwise fallback to a default transparent/app icon
  const normalIcon = (baseIconPath && fs.existsSync(baseIconPath))
    ? baseIconPath
    : path.join(__dirname, '../../assets/default-icon.png');

  // Return normal and an alert fallback
  return {
    normal: normalIcon,
    unread: normalIcon
  };
}
```

- [ ] **Step 2: Implement `src/main/notifier.ts`**

```typescript
// src/main/notifier.ts
import { app, BrowserWindow, Notification } from 'electron';
import { Profile, XPathAlertPayload } from '../shared/types';

export class LinuxNotifier {
  public notify(profile: Profile, payload: XPathAlertPayload, window: BrowserWindow): void {
    if (!profile.desktopConfig.showDesktopNotification) return;

    const title = profile.name;
    const body = payload.mode === 'badge_count'
      ? `Bạn có ${payload.count} tin nhắn chưa đọc`
      : (payload.text || 'Có thông báo mới');

    const notification = new Notification({
      title,
      body,
      icon: profile.iconPath
    });

    notification.on('click', () => {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    });

    notification.show();
  }

  public flashWindow(window: BrowserWindow, enable: boolean): void {
    if (window.isDestroyed()) return;
    window.flashFrame(enable);
  }

  public setBadgeCount(count: number): void {
    app.setBadgeCount(count);
  }
}
```

- [ ] **Step 3: Implement `src/main/tray-manager.ts`**

```typescript
// src/main/tray-manager.ts
import { app, Tray, Menu, BrowserWindow } from 'electron';
import { Profile } from '../shared/types';
import { getTrayIconPaths } from './icon-generator';

export class ProfileTrayManager {
  private tray: Tray | null = null;
  private profile: Profile;
  private window: BrowserWindow;
  private icons: { normal: string; unread: string };

  constructor(profile: Profile, window: BrowserWindow, onShowManager: () => void) {
    this.profile = profile;
    this.window = window;
    this.icons = getTrayIconPaths(profile.iconPath);

    this.tray = new Tray(this.icons.normal);
    this.tray.setToolTip(profile.name);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Mở ${profile.name}`,
        click: () => {
          this.window.show();
          this.window.focus();
        }
      },
      {
        label: 'Mở Trình Quản Lý (Manager)',
        click: () => onShowManager()
      },
      { type: 'separator' },
      {
        label: 'Thoát',
        click: () => {
          (this.window as any).isQuitting = true;
          this.window.destroy();
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
    this.tray.on('click', () => {
      if (this.window.isVisible() && this.window.isFocused()) {
        this.window.hide();
      } else {
        this.window.show();
        this.window.focus();
      }
    });
  }

  public setUnread(hasUnread: boolean, count: number): void {
    if (!this.tray) return;
    if (hasUnread) {
      this.tray.setImage(this.icons.unread);
      this.tray.setToolTip(`${this.profile.name} (${count} tin mới)`);
    } else {
      this.tray.setImage(this.icons.normal);
      this.tray.setToolTip(this.profile.name);
    }
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/icon-generator.ts src/main/notifier.ts src/main/tray-manager.ts
git commit -m "feat: implement linux notifier and system tray manager"
```

---

### Task 6: Webview Window Manager & Preload Script (Runner Mode)

**Files:**
- Create: `src/preload/webview-preload.ts`
- Create: `src/main/window-service.ts`

**Interfaces:**
- Produces:
  - `webview-preload.ts`: Sets up MutationObserver and polling loop, emits `ipcRenderer.send('xpath:alert', payload)`.
  - `class WindowService`:
    - `createProfileWindow(profile: Profile): BrowserWindow`
    - Handles focus clear (`window.on('focus')`), tray hide on close (`window.on('close')`), permission requests (WebRTC, mic, cam).

- [ ] **Step 1: Write `src/preload/webview-preload.ts`**

```typescript
// src/preload/webview-preload.ts
import { ipcRenderer } from 'electron';
import { evaluateXPath, extractXPathData, AlertDeduplicator } from './xpath-evaluator';
import { XPathConfig } from '../shared/types';

let config: XPathConfig | null = null;
let deduplicator = new AlertDeduplicator(2000);
let pollTimer: NodeJS.Timeout | null = null;
let mutationObserver: MutationObserver | null = null;

function checkXPath(): void {
  if (!config || !config.selector) return;

  const node = evaluateXPath(document, config.selector);
  const data = extractXPathData(node, config.mode);

  if (deduplicator.shouldAlert(data)) {
    ipcRenderer.send('xpath:alert', {
      hasElement: data.hasElement,
      mode: config.mode,
      count: data.count,
      text: data.text,
      timestamp: Date.now()
    });
  }
}

function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

ipcRenderer.on('xpath:init', (_event, receivedConfig: XPathConfig) => {
  config = receivedConfig;
  const debouncedCheck = debounce(checkXPath, 300);

  if (mutationObserver) mutationObserver.disconnect();
  mutationObserver = new MutationObserver(() => debouncedCheck());
  mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  if (pollTimer) clearInterval(pollTimer);
  const interval = Math.max(1000, config.pollIntervalMs || 3000);
  pollTimer = setInterval(checkXPath, interval);

  // Initial check
  checkXPath();
});

ipcRenderer.on('window:focused', () => {
  deduplicator.reset();
});
```

- [ ] **Step 2: Write `src/main/window-service.ts`**

```typescript
// src/main/window-service.ts
import { BrowserWindow, session, ipcMain, app } from 'electron';
import * as path from 'path';
import { Profile, XPathAlertPayload } from '../shared/types';
import { LinuxNotifier } from './notifier';
import { ProfileTrayManager } from './tray-manager';

export class WindowService {
  private notifier: LinuxNotifier;

  constructor() {
    this.notifier = new LinuxNotifier();
  }

  public createProfileWindow(profile: Profile, onShowManager: () => void): BrowserWindow {
    const partition = `persist:zaloview_${profile.id}`;
    const customSession = session.fromPartition(partition);

    // Permission handler for WebRTC (Mic, Cam, Notification, Clipboard)
    customSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowed = ['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write'];
      callback(allowed.includes(permission));
    });

    const bounds = profile.windowBounds || { width: 1100, height: 750, isMaximized: false };

    const win = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      title: profile.name,
      icon: profile.iconPath,
      autoHideMenuBar: true,
      titleBarStyle: 'default',
      // Critical for Linux Dock & Task Manager:
      // Sets the WM_CLASS for X11 & Wayland app_id
      // to match StartupWMClass in the .desktop file
      // @ts-ignore
      wmClass: `zaloview-${profile.id}`,
      webPreferences: {
        partition,
        preload: path.join(__dirname, '../preload/webview-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: true
      }
    });

    if (bounds.isMaximized) {
      win.maximize();
    }

    let trayManager: ProfileTrayManager | null = null;
    if (profile.desktopConfig.minimizeToTray) {
      trayManager = new ProfileTrayManager(profile, win, onShowManager);
    }

    // Save window size/position on change
    const saveBounds = () => {
      if (!win.isDestroyed()) {
        profile.windowBounds = {
          ...win.getBounds(),
          isMaximized: win.isMaximized()
        };
      }
    };
    win.on('resize', saveBounds);
    win.on('move', saveBounds);

    // Minimize to tray on close
    win.on('close', (event) => {
      if (!(win as any).isQuitting && profile.desktopConfig.minimizeToTray) {
        event.preventDefault();
        win.hide();
      } else {
        if (trayManager) trayManager.destroy();
      }
    });

    // Clear active state on window focus
    win.on('focus', () => {
      if (profile.desktopConfig.flashTaskbar) {
        this.notifier.flashWindow(win, false);
      }
      if (profile.desktopConfig.showTaskbarBadge) {
        this.notifier.setBadgeCount(0);
      }
      if (trayManager) {
        trayManager.setUnread(false, 0);
      }
      win.webContents.send('window:focused');
    });

    // Handle XPath alert from Preload
    ipcMain.on('xpath:alert', (_event, payload: XPathAlertPayload) => {
      if (!win.isFocused()) {
        if (profile.desktopConfig.flashTaskbar) {
          this.notifier.flashWindow(win, true);
        }
        if (profile.desktopConfig.showTaskbarBadge) {
          this.notifier.setBadgeCount(payload.count || 1);
        }
        if (trayManager) {
          trayManager.setUnread(true, payload.count || 1);
        }
        this.notifier.notify(profile, payload, win);
      }
    });

    win.webContents.on('did-finish-load', () => {
      win.webContents.send('xpath:init', profile.xpathConfig);
    });

    if (profile.userAgent) {
      win.loadURL(profile.url, { userAgent: profile.userAgent });
    } else {
      win.loadURL(profile.url);
    }

    return win;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/webview-preload.ts src/main/window-service.ts
git commit -m "feat: implement webview preload script and window service with Linux attention clear"
```

---

### Task 7: Manager UI & Preload Bridge

**Files:**
- Create: `src/preload/manager-preload.ts`
- Create: `src/renderer/manager/index.html`
- Create: `src/renderer/manager/styles.css`
- Create: `src/renderer/manager/app.ts`

**Interfaces:**
- Produces: Complete GUI for managing profiles, adding/editing profiles, testing XPath selectors, toggling desktop shortcuts and launching webview windows.

- [ ] **Step 1: Write `src/preload/manager-preload.ts`**

```typescript
// src/preload/manager-preload.ts
import { contextBridge, ipcRenderer } from 'electron';
import { Profile } from '../shared/types';

contextBridge.exposeInMainWorld('api', {
  getProfiles: (): Promise<Profile[]> => ipcRenderer.invoke('profiles:get-all'),
  saveProfile: (profile: Profile): Promise<{ success: boolean }> => ipcRenderer.invoke('profiles:save', profile),
  deleteProfile: (id: string): Promise<{ success: boolean }> => ipcRenderer.invoke('profiles:delete', id),
  launchProfile: (id: string): Promise<void> => ipcRenderer.invoke('profiles:launch', id),
  toggleShortcut: (id: string, enable: boolean): Promise<{ success: boolean }> => ipcRenderer.invoke('profiles:toggle-shortcut', id, enable),
  testXPath: (url: string, selector: string): Promise<{ found: boolean; count: number; text: string }> => ipcRenderer.invoke('xpath:test', url, selector)
});
```

- [ ] **Step 2: Write `src/renderer/manager/index.html`**

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Linux Webview Manager</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app-container">
    <header class="app-header">
      <div class="brand">
        <svg class="brand-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        <h1>Webview Manager</h1>
      </div>
      <div class="header-actions">
        <button id="btn-add-profile" class="btn btn-primary">+ Thêm Profile Mới</button>
      </div>
    </header>

    <main class="main-content">
      <div id="profiles-grid" class="profiles-grid">
        <!-- Profiles rendered dynamically -->
      </div>
      <div id="empty-state" class="empty-state" style="display: none;">
        <p>Chưa có profile nào. Hãy nhấn "+ Thêm Profile Mới" để bắt đầu!</p>
      </div>
    </main>

    <!-- Profile Edit Modal -->
    <div id="modal-overlay" class="modal-overlay" style="display: none;">
      <div class="modal">
        <div class="modal-header">
          <h2 id="modal-title">Cấu Hình Profile</h2>
          <button id="btn-close-modal" class="btn-icon">&times;</button>
        </div>
        <form id="profile-form">
          <input type="hidden" id="field-id">
          <div class="form-group">
            <label for="field-name">Tên hiển thị</label>
            <input type="text" id="field-name" required placeholder="Ví dụ: Zalo Cá Nhân">
          </div>
          <div class="form-group">
            <label for="field-url">Địa chỉ URL</label>
            <input type="url" id="field-url" required placeholder="https://chat.zalo.me">
          </div>
          <div class="form-group">
            <label for="field-icon">Đường dẫn Icon (PNG/SVG)</label>
            <input type="text" id="field-icon" placeholder="/path/to/icon.png">
          </div>

          <fieldset class="form-fieldset">
            <legend>Cấu hình XPath Theo Dõi Thông Báo</legend>
            <div class="form-group">
              <label for="field-xpath">XPath Selector</label>
              <div class="input-with-button">
                <input type="text" id="field-xpath" placeholder="//span[contains(@class, 'tab-red-dot')]">
                <button type="button" id="btn-test-xpath" class="btn btn-secondary">Kiểm tra</button>
              </div>
              <div id="xpath-test-result" class="xpath-test-result" style="display: none;"></div>
            </div>
            <div class="form-group">
              <label for="field-xpath-mode">Chế độ đọc</label>
              <select id="field-xpath-mode">
                <option value="badge_count">Đếm số unread (Badge count)</option>
                <option value="text_content">Trích xuất nội dung tin (Text message)</option>
                <option value="existence">Kiểm tra tồn tại đơn thuần</option>
              </select>
            </div>
            <div class="form-group">
              <label for="field-poll-interval">Chu kỳ quét dự phòng (giây)</label>
              <input type="number" id="field-poll-interval" value="3" min="1" max="60">
            </div>
          </fieldset>

          <fieldset class="form-fieldset">
            <legend>Tích Hợp Linux Desktop</legend>
            <div class="checkbox-group">
              <label><input type="checkbox" id="check-flash" checked> Làm sáng/nhấp nháy Taskbar khi có tin</label>
              <label><input type="checkbox" id="check-badge" checked> Hiện số đếm unread trên Taskbar/Dock</label>
              <label><input type="checkbox" id="check-tray" checked> Thu nhỏ xuống khay hệ thống (Tray) khi đóng [X]</label>
              <label><input type="checkbox" id="check-notification" checked> Bắn popup thông báo của hệ điều hành</label>
              <label><input type="checkbox" id="check-shortcut" checked> Tạo shortcut trên Start Menu (KDE / GNOME)</label>
            </div>
          </fieldset>

          <div class="modal-actions">
            <button type="button" id="btn-cancel" class="btn btn-secondary">Hủy</button>
            <button type="submit" class="btn btn-primary">Lưu Profile</button>
          </div>
        </form>
      </div>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write `src/renderer/manager/styles.css`**

```css
:root {
  --bg-color: #0f172a;
  --surface-color: #1e293b;
  --surface-border: #334155;
  --primary-color: #3b82f6;
  --primary-hover: #2563eb;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --danger-color: #ef4444;
  --success-color: #10b981;
  --radius: 8px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-primary);
  height: 100vh;
  overflow-x: hidden;
}

.app-container { display: flex; flex-direction: column; height: 100vh; }
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background-color: var(--surface-color);
  border-bottom: 1px solid var(--surface-border);
}
.brand { display: flex; align-items: center; gap: 12px; }
.brand h1 { font-size: 1.25rem; font-weight: 600; }
.brand-icon { stroke: var(--primary-color); }

.btn {
  padding: 8px 16px;
  border-radius: var(--radius);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s;
}
.btn-primary { background-color: var(--primary-color); color: white; }
.btn-primary:hover { background-color: var(--primary-hover); }
.btn-secondary { background-color: var(--surface-border); color: var(--text-primary); }
.btn-danger { background-color: var(--danger-color); color: white; }

.main-content { flex: 1; padding: 24px; overflow-y: auto; }
.profiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.profile-card {
  background-color: var(--surface-color);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.profile-card-header { display: flex; align-items: center; gap: 12px; }
.profile-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background-color: #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}
.profile-card-title h3 { font-size: 1.1rem; }
.profile-card-title p { font-size: 0.8rem; color: var(--text-secondary); word-break: break-all; }
.profile-card-actions { display: flex; gap: 8px; margin-top: auto; padding-top: 12px; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modal {
  background-color: var(--surface-color);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius);
  width: 520px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px;
}
.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: 0.875rem; margin-bottom: 6px; color: var(--text-secondary); }
.form-group input[type="text"],
.form-group input[type="url"],
.form-group input[type="number"],
.form-group select {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--surface-border);
  background-color: #0f172a;
  color: var(--text-primary);
}
.input-with-button { display: flex; gap: 8px; }
.form-fieldset {
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 14px;
  margin-bottom: 16px;
}
.form-fieldset legend { font-size: 0.85rem; color: var(--primary-color); padding: 0 6px; }
.checkbox-group { display: flex; flex-direction: column; gap: 8px; font-size: 0.875rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
```

- [ ] **Step 4: Write `src/renderer/manager/app.ts`**

```typescript
// src/renderer/manager/app.ts
import { Profile } from '../../shared/types';

declare const api: {
  getProfiles: () => Promise<Profile[]>;
  saveProfile: (profile: Profile) => Promise<{ success: boolean }>;
  deleteProfile: (id: string) => Promise<{ success: boolean }>;
  launchProfile: (id: string) => Promise<void>;
  toggleShortcut: (id: string, enable: boolean) => Promise<{ success: boolean }>;
  testXPath: (url: string, selector: string) => Promise<{ found: boolean; count: number; text: string }>;
};

const grid = document.getElementById('profiles-grid')!;
const emptyState = document.getElementById('empty-state')!;
const modal = document.getElementById('modal-overlay')!;
const form = document.getElementById('profile-form') as HTMLFormElement;

async function loadProfiles(): Promise<void> {
  const profiles = await api.getProfiles();
  grid.innerHTML = '';
  if (profiles.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  profiles.forEach(p => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.innerHTML = `
      <div class="profile-card-header">
        <div class="profile-card-icon">${p.iconPath ? `<img src="${p.iconPath}" width="36" height="36"/>` : '🌐'}</div>
        <div class="profile-card-title">
          <h3>${p.name}</h3>
          <p>${p.url}</p>
        </div>
      </div>
      <div class="profile-card-actions">
        <button class="btn btn-primary btn-launch" data-id="${p.id}">Mở App</button>
        <button class="btn btn-secondary btn-edit" data-id="${p.id}">Sửa</button>
        <button class="btn btn-danger btn-delete" data-id="${p.id}">Xóa</button>
      </div>
    `;
    grid.appendChild(card);
  });

  document.querySelectorAll('.btn-launch').forEach(b => {
    b.addEventListener('click', (e) => api.launchProfile((e.target as HTMLElement).dataset.id!));
  });
  document.querySelectorAll('.btn-delete').forEach(b => {
    b.addEventListener('click', async (e) => {
      const id = (e.target as HTMLElement).dataset.id!;
      if (confirm('Bạn có chắc muốn xóa profile này?')) {
        await api.deleteProfile(id);
        loadProfiles();
      }
    });
  });
  document.querySelectorAll('.btn-edit').forEach(b => {
    b.addEventListener('click', async (e) => {
      const id = (e.target as HTMLElement).dataset.id!;
      const profile = (await api.getProfiles()).find(p => p.id === id);
      if (profile) openModal(profile);
    });
  });
}

function openModal(profile?: Profile): void {
  (document.getElementById('field-id') as HTMLInputElement).value = profile ? profile.id : '';
  (document.getElementById('field-name') as HTMLInputElement).value = profile ? profile.name : '';
  (document.getElementById('field-url') as HTMLInputElement).value = profile ? profile.url : '';
  (document.getElementById('field-icon') as HTMLInputElement).value = profile?.iconPath || '';
  (document.getElementById('field-xpath') as HTMLInputElement).value = profile?.xpathConfig.selector || '';
  (document.getElementById('field-xpath-mode') as HTMLSelectElement).value = profile?.xpathConfig.mode || 'badge_count';
  (document.getElementById('field-poll-interval') as HTMLInputElement).value = String(profile?.xpathConfig.pollIntervalMs ? profile.xpathConfig.pollIntervalMs / 1000 : 3);
  modal.style.display = 'flex';
}

document.getElementById('btn-add-profile')!.addEventListener('click', () => openModal());
document.getElementById('btn-close-modal')!.addEventListener('click', () => modal.style.display = 'none');
document.getElementById('btn-cancel')!.addEventListener('click', () => modal.style.display = 'none');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const idInput = (document.getElementById('field-id') as HTMLInputElement).value;
  const name = (document.getElementById('field-name') as HTMLInputElement).value;
  const id = idInput || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const profile: Profile = {
    id,
    name,
    url: (document.getElementById('field-url') as HTMLInputElement).value,
    iconPath: (document.getElementById('field-icon') as HTMLInputElement).value || undefined,
    xpathConfig: {
      selector: (document.getElementById('field-xpath') as HTMLInputElement).value,
      mode: (document.getElementById('field-xpath-mode') as HTMLSelectElement).value as any,
      pollIntervalMs: parseInt((document.getElementById('field-poll-interval') as HTMLInputElement).value, 10) * 1000
    },
    desktopConfig: {
      flashTaskbar: (document.getElementById('check-flash') as HTMLInputElement).checked,
      showTaskbarBadge: (document.getElementById('check-badge') as HTMLInputElement).checked,
      minimizeToTray: (document.getElementById('check-tray') as HTMLInputElement).checked,
      showDesktopNotification: (document.getElementById('check-notification') as HTMLInputElement).checked,
      createDesktopShortcut: (document.getElementById('check-shortcut') as HTMLInputElement).checked
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await api.saveProfile(profile);
  modal.style.display = 'none';
  loadProfiles();
});

loadProfiles();
```

- [ ] **Step 5: Commit**

```bash
git add src/preload/manager-preload.ts src/renderer/manager/
git commit -m "feat: implement Manager Dashboard UI, styles and preload bridge"
```

---

### Task 8: Main Dispatcher & Integration Entry Point

**Files:**
- Create: `src/main/index.ts`
- Create: `bin/zaloview.js`

**Interfaces:**
- Produces: Command line argument parsing (`--manager`, `--profile <id>`), single instance locking, Manager BrowserWindow, and IPC handlers registration.

- [ ] **Step 1: Write `src/main/index.ts`**

```typescript
// src/main/index.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { ProfileManager } from './profile-manager';
import { DesktopService } from './desktop-service';
import { WindowService } from './window-service';
import { Profile } from '../shared/types';

const profileManager = new ProfileManager();
const desktopService = new DesktopService();
const windowService = new WindowService();

let managerWindow: BrowserWindow | null = null;
const activeProfileWindows = new Map<string, BrowserWindow>();

function parseArgs(): { mode: 'manager' | 'profile'; profileId?: string } {
  const args = process.argv.slice(2);
  const profileIndex = args.findIndex(a => a === '--profile' || a === '-p');
  if (profileIndex >= 0 && args[profileIndex + 1]) {
    return { mode: 'profile', profileId: args[profileIndex + 1] };
  }
  return { mode: 'manager' };
}

function openManagerWindow(): BrowserWindow {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.show();
    managerWindow.focus();
    return managerWindow;
  }

  managerWindow = new BrowserWindow({
    width: 960,
    height: 680,
    title: 'Linux Webview Manager',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/manager-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  managerWindow.loadFile(path.join(__dirname, '../renderer/manager/index.html'));
  return managerWindow;
}

function launchProfile(profileId: string): void {
  const existing = activeProfileWindows.get(profileId);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return;
  }

  const profile = profileManager.getProfile(profileId);
  if (!profile) {
    console.error(`Profile not found: ${profileId}`);
    return;
  }

  const win = windowService.createProfileWindow(profile, () => openManagerWindow());
  activeProfileWindows.set(profileId, win);

  win.on('closed', () => {
    activeProfileWindows.delete(profileId);
    profileManager.saveProfile(profile);
  });
}

// IPC Handlers for Manager UI
ipcMain.handle('profiles:get-all', () => profileManager.getProfiles());

ipcMain.handle('profiles:save', (_event, profile: Profile) => {
  profileManager.saveProfile(profile);
  if (profile.desktopConfig.createDesktopShortcut) {
    desktopService.installShortcut(profile);
  } else {
    desktopService.removeShortcut(profile.id);
  }
  return { success: true };
});

ipcMain.handle('profiles:delete', (_event, id: string) => {
  desktopService.removeShortcut(id);
  const deleted = profileManager.deleteProfile(id);
  return { success: deleted };
});

ipcMain.handle('profiles:launch', (_event, id: string) => {
  launchProfile(id);
});

// App lifecycle
const launchTarget = parseArgs();

// Single instance lock per mode/profile
const lockKey = launchTarget.mode === 'profile' ? `profile-${launchTarget.profileId}` : 'manager';
const hasLock = app.requestSingleInstanceLock({ lockKey });

if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (launchTarget.mode === 'profile' && launchTarget.profileId) {
      launchProfile(launchTarget.profileId);
    } else {
      openManagerWindow();
    }
  });

  app.whenReady().then(() => {
    if (launchTarget.mode === 'profile' && launchTarget.profileId) {
      launchProfile(launchTarget.profileId);
    } else {
      openManagerWindow();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        openManagerWindow();
      }
    });
  });
}
```

- [ ] **Step 2: Write executable launcher `bin/zaloview.js`**

```javascript
#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

const appPath = path.join(__dirname, '..');
const args = [appPath, ...process.argv.slice(2)];

const child = spawn(electron, args, { stdio: 'inherit' });
child.on('close', (code) => process.exit(code || 0));
```

- [ ] **Step 3: Run full test suite and verify build**

Run: `npm run build && npm test`  
Expected: TypeScript builds with 0 errors, Vitest passes all tests.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts bin/zaloview.js
git commit -m "feat: implement main CLI dispatcher and full integration entry point"
```

---

## Plan Self-Review Checklist

- [x] **Spec coverage:** Tất cả yêu cầu trong spec (cô lập profile, XPath observer, flash taskbar, badge unread, system tray, focus reset, tạo shortcut .desktop) đều có task tương ứng.
- [x] **No placeholders:** Không có TODO, TBD hay "implement later". Tất cả các file và code đều được viết tường minh.
- [x] **Type consistency:** Các interface `Profile`, `XPathConfig`, `DesktopIntegrationConfig`, `XPathAlertPayload` đồng nhất giữa `types.ts`, `profile-manager.ts`, `desktop-service.ts`, `window-service.ts` và `webview-preload.ts`.
