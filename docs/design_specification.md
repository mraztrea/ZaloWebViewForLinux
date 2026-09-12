# Thiết Kế Kỹ Thuật: Trình Quản Lý Webview Đa Ứng Dụng Cho Linux (Linux Webview Manager)

**Tài liệu đặc tả kiến trúc và thiết kế (Design Specification)**  
**Ngày tạo:** 12/09/2026  
**Trạng thái:** Chờ phê duyệt (Pending Review)

---

## 1. Giới Thiệu & Mục Tiêu Dự Án

### 1.1. Bối cảnh
Khi sử dụng Google Chrome trên Linux truy cập các web app như [Zalo Web](https://chat.zalo.me), người dùng có thể "Cài đặt ứng dụng" (Install PWA) để tạo ra một cửa sổ độc lập không có header trình duyệt. Tuy nhiên, cơ chế PWA mặc định của trình duyệt có nhiều hạn chế trên môi trường máy tính để bàn Linux:
- Không thể tự do tùy biến cơ chế bắt thông báo và quét phần tử DOM (ví dụ: Zalo Web đôi khi không phát âm thanh hoặc không làm sáng thanh taskbar khi có tin mới).
- Không tự động làm sáng taskbar (`flashFrame` / urgency hint) hoặc cập nhật huy hiệu số tin chưa đọc (badge count) trên Dock/Taskbar của KDE Plasma và GNOME.
- Khó quản lý nhiều tài khoản riêng biệt chạy song song với shortcut độc lập.

### 1.2. Mục tiêu
Xây dựng một ứng dụng máy tính dành riêng cho Linux (**Linux Webview Manager**) cho phép:
1. Tạo và quản lý nhiều website độc lập (mỗi website là 1 profile cô lập dữ liệu 100%).
2. Khởi chạy từng website như một app native độc lập (cửa sổ không header, icon riêng trên taskbar/dock, shortcut riêng trong Start Menu của KDE/GNOME).
3. Thiết lập **XPath Selector** để tự động quét định kỳ: khi phát hiện tin nhắn mới/số unread, lập tức kích hoạt:
   - Làm sáng/nhấp nháy icon trên Taskbar (`flashFrame` / Urgency hint).
   - Hiển thị badge số đếm trên icon Taskbar và System Tray.
   - Gửi Desktop Notification chuẩn qua DBus.
4. Tự động xóa trạng thái cảnh báo (tắt nhấp nháy, xóa badge) ngay khi người dùng click focus vào cửa sổ ứng dụng.
5. Hỗ trợ chạy ngầm trên Khay hệ thống (System Tray) khi đóng [X] cửa sổ.
6. Tự động sinh file shortcut `.desktop` chuẩn XDG vào `~/.local/share/applications/` và cập nhật cơ sở dữ liệu menu hệ thống ngay tức thì.

---

## 2. Kiến Trúc Tổng Thể

### 2.1. Công nghệ nền tảng (Tech Stack)
* **Runtime**: [Electron](https://www.electronjs.org/) (Chromium + Node.js)
  * Đảm bảo khả năng tương thích 100% với các tính năng chuyên sâu của Zalo Web: gọi video/thoại WebRTC, xin quyền Microphone/Camera, dán ảnh từ clipboard, kéo thả file, phát âm thanh chuông báo.
* **Ngôn ngữ**: TypeScript
* **Tích hợp Linux**:
  * FreeDesktop Desktop Entry Specification (chuẩn `.desktop`)
  * DBus Notifications (`org.freedesktop.Notifications`)
  * Unity / KDE LauncherEntry (`com.canonical.Unity.LauncherEntry`) qua API `app.setBadgeCount`
  * X11 / Wayland Urgency (`window.flashFrame`)
* **Giao diện Manager**: HTML5, Vanilla CSS hiện đại (Dark/Light mode, Responsive), TypeScript (Renderer process được bảo vệ bởi Context Isolation).

### 2.2. Mô hình Tiến trình & Điều phối (Process Architecture)
Ứng dụng sử dụng kiến trúc **Multi-Instance Runner + Manager GUI**:
* **Lệnh khởi chạy**:
  * `zaloview` hoặc `zaloview --manager`: Khởi động giao diện Dashboard quản lý profile.
  * `zaloview --profile <profile-id>`: Khởi động cửa sổ webview của profile tương ứng.
* **Single Instance Lock theo Profile**:
  * Mỗi profile chạy độc lập được bảo vệ bởi `app.requestSingleInstanceLock({ profileId })`.
  * Nếu người dùng nhấp vào shortcut của profile đang chạy, ứng dụng sẽ gửi signal focus cửa sổ hiện có lên trên cùng thay vì khởi chạy một cửa sổ trùng lặp.

---

## 3. Cấu Trúc Dữ Liệu & Phân Vùng Cô Lập (Data Models & Storage)

### 3.1. Thư mục lưu trữ chuẩn XDG
Toàn bộ dữ liệu người dùng được lưu trữ tại `~/.config/zaloview/`:
```text
~/.config/zaloview/
├── profiles.json           # File cấu hình danh sách profile
├── icons/                  # Thư mục chứa icon PNG/SVG của các profile
│   ├── zalo.png
│   └── messenger.png
└── Partitions/             # Thư mục lưu cache & cookies cô lập của Chromium
    ├── zaloview_zalo/
    └── zaloview_custom/
```

### 3.2. Cấu trúc `ProfileConfig` (`profiles.json`)
```typescript
export interface XPathConfig {
  selector: string;                     // Chuỗi XPath (ví dụ: //span[contains(@class, 'tab-red-dot')])
  mode: 'badge_count' | 'text_content' | 'existence'; // Kiểu trích xuất
  pollIntervalMs: number;               // Chu kỳ quét dự phòng (mặc định 3000ms - 5000ms)
}

export interface DesktopIntegrationConfig {
  flashTaskbar: boolean;                // Làm sáng taskbar khi có tin
  showTaskbarBadge: boolean;            // Hiện số đếm unread trên dock/taskbar
  minimizeToTray: boolean;              // Ẩn xuống tray khi đóng [X]
  showDesktopNotification: boolean;     // Bắn popup notification của Linux
  createDesktopShortcut: boolean;       // Tự động duy trì file .desktop
}

export interface Profile {
  id: string;                           // Slug định danh duy nhất (vd: 'zalo', 'zalo-work')
  name: string;                         // Tên hiển thị (vd: 'Zalo Cá Nhân')
  url: string;                          // URL truy cập (vd: 'https://chat.zalo.me')
  iconPath?: string;                    // Đường dẫn tuyệt đối đến file icon
  userAgent?: string;                   // Custom User-Agent (tùy chọn)
  windowBounds?: {                      // Vị trí và kích thước cửa sổ lưu tự động
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized: boolean;
  };
  xpathConfig: XPathConfig;
  desktopConfig: DesktopIntegrationConfig;
  createdAt: string;
  updatedAt: string;
}
```

### 3.3. Phân vùng phiên làm việc (Session Partitioning)
* Cửa sổ profile được khởi tạo với:
  ```typescript
  const partition = `persist:zaloview_${profile.id}`;
  const customSession = session.fromPartition(partition);
  ```
* Chromium tự động phân tách toàn bộ Cookies, LocalStorage, IndexedDB, Cache vào thư mục riêng của partition đó, đảm bảo các tài khoản độc lập tuyệt đối.

---

## 4. Cơ Chế XPath Observer & Trích Xuất Thông Báo

### 4.1. Preload Script (`webview-preload.ts`)
Preload script được inject trực tiếp vào trang web và chạy trong ngữ cảnh cô lập (`contextIsolation: true`):
1. **Hybrid Observer**:
   * **MutationObserver**: Lắng nghe mọi biến động DOM trên `document.body` (`childList`, `subtree`, `characterData`). Khi có biến động, kích hoạt hàm kiểm tra với cơ chế **Debounce (300ms)** để gom các thay đổi liên tiếp, tránh lãng phí CPU.
   * **Fallback Timer**: Chạy định kỳ mỗi `pollIntervalMs` (mặc định 3s) để phát hiện sự thay đổi ngay cả khi trang web bị Chromium throttle tác vụ nền.
2. **Hàm đánh giá XPath**:
   ```javascript
   function evaluateXPath(selector) {
     const result = document.evaluate(
       selector,
       document,
       null,
       XPathResult.FIRST_ORDERED_NODE_TYPE,
       null
     );
     return result.singleNodeValue;
   }
   ```
3. **Trích xuất dữ liệu theo chế độ**:
   * `badge_count`: Trích xuất text, lọc ký tự số bằng regex (`/\d+/`). Nếu nội dung là `"99+"`, parse thành `99`.
   * `text_content`: Lấy `element.innerText.trim()` (làm tiêu đề hoặc trích đoạn tin nhắn).
   * `existence`: Trả về `true` nếu tìm thấy node, `false` nếu không.

### 4.2. Bộ lọc chống trùng lặp (Deduplication & Throttling)
* Quản lý trạng thái thông báo gần nhất (`lastState`):
  * Chỉ gửi IPC `xpath:alert` lên Main Process khi:
    1. Node mới xuất hiện (từ không có thành có).
    2. HOẶC số đếm tăng lên (`newCount > lastCount`).
    3. HOẶC nội dung text mới khác nội dung cũ.
* Thiết lập **Cooldown (2000ms)** giữa 2 lần gửi popup thông báo ra màn hình để tránh làm phiền người dùng khi có nhiều tin nhắn dồn dập trong vài giây.

---

## 5. Tích Hợp Hệ Thống Linux (Desktop Integration)

### 5.1. Taskbar Flash & Urgency Hint
* Khi nhận sự kiện `xpath:alert`:
  * Nếu cửa sổ **chưa được focus**:
    * Gọi `mainWindow.flashFrame(true)`.
    * Hệ thống kích hoạt cờ `_NET_WM_STATE_DEMANDS_ATTENTION` (X11) hoặc token XDG Activation (Wayland).
    * Thanh Taskbar / Dock của KDE Plasma và GNOME sẽ nhấp nháy phát sáng báo hiệu có tin nhắn mới.

### 5.2. Taskbar Unread Badge
* Gọi `app.setBadgeCount(count)`.
* Hệ điều hành Linux (thông qua DBus LauncherEntry) sẽ hiển thị một huy hiệu đếm màu đỏ chứa số tin nhắn trên icon ứng dụng ở Dock/Panel.
* Khi `count === 0`, badge tự động ẩn.

### 5.3. System Tray (Khay Hệ Thống)
* Tạo icon System Tray cho từng profile:
  * **Trạng thái bình thường**: Hiển thị icon profile.
  * **Trạng thái có tin**: Đổi sang icon có chấm đỏ nổi bật, cập nhật tooltip: `"<Tên App> - <Số tin> tin nhắn mới"`.
* Menu ngữ cảnh chuột phải:
  * *Mở cửa sổ* (Hiện và Focus)
  * *Đánh dấu đã đọc* (Xóa alert state)
  * *Mở Trình Quản Lý (Manager)*
  * *Thoát hoàn toàn*
* **Thu nhỏ khi đóng [X]**: Bắt sự kiện `close` của `BrowserWindow`, nếu `minimizeToTray: true` thì gọi `event.preventDefault()` và `window.hide()`.

### 5.4. Cơ chế Tự Động Xóa Cảnh Báo Khi Focus (Focus Auto-Clear)
Khi người dùng chuyển sang cửa sổ webview (sự kiện `window.on('focus')`):
1. Gọi `mainWindow.flashFrame(false)` -> Tắt nhấp nháy taskbar.
2. Gọi `app.setBadgeCount(0)` -> Xóa badge số đếm trên taskbar.
3. Đặt lại icon System Tray về icon mặc định (xóa chấm đỏ).
4. Gửi tín hiệu IPC `window:focus-cleared` xuống Preload để đồng bộ trạng thái đã xem.

### 5.5. Tích Hợp Start Menu (KDE & GNOME `.desktop` File)
* Đường dẫn file: `~/.local/share/applications/zaloview-<profile.id>.desktop`
* Nội dung mẫu:
  ```ini
  [Desktop Entry]
  Version=1.0
  Type=Application
  Name=Zalo
  GenericName=Web App
  Comment=Zalo Webview Client
  Exec=/usr/local/bin/zaloview --profile zalo %u
  Icon=/home/username/.config/zaloview/icons/zalo.png
  Terminal=false
  StartupWMClass=zaloview-zalo
  Categories=Network;InstantMessaging;Chat;
  Keywords=zalo;chat;tin nhắn;
  ```
* **Kỹ thuật then chốt `StartupWMClass`**:
  * Khi khởi tạo `BrowserWindow`, gán `wmClass: 'zaloview-' + profile.id`.
  * Khớp hoàn hảo với `StartupWMClass=zaloview-<profile.id>` trong file `.desktop`.
  * Đảm bảo cửa sổ không bị gom chung vào icon Electron mà xuất hiện như một ứng dụng native riêng biệt với đầy đủ tên, icon và chức năng pin lên Dock.
* **Cập nhật tức thời**: Gọi lệnh `update-desktop-database ~/.local/share/applications/` ngay sau khi tạo hoặc xóa file để Start Menu (KDE Kickoff, GNOME Shell) nhận diện ngay lập tức.

---

## 6. Giao Diện Quản Lý (Manager Dashboard UI)

Giao diện Manager được tối ưu theo phong cách hiện đại, tinh gọn:
1. **Header**: Logo ứng dụng, nút "Thêm Profile Mới", nút chuyển Dark/Light theme, thanh tìm kiếm profile.
2. **Danh sách Profile (Profile Cards)**:
   * Hiển thị danh thiếp cho từng profile với icon lớn, tên, URL đích, trạng thái (Đang mở / Đã đóng), unread badge hiện tại.
   * Thao tác: **[Khởi chạy]**, **[Chỉnh sửa]**, **[Tạo Shortcut Start Menu]**, **[Xóa]**.
3. **Modal Thêm / Chỉnh Sửa Profile**:
   * Tên profile & URL.
   * Icon: Tự động tải từ website (favicon / apple-touch-icon) hoặc chọn file từ máy tính.
   * Bộ cấu hình XPath:
     * Ô nhập XPath selector.
     * Chọn kiểu dữ liệu (Đếm số unread / Đọc text / Kiểm tra tồn tại).
     * Nút **[Kiểm Tra XPath]**: Mở webview ngầm thực thi XPath và hiển thị kết quả trực quan (highlight element và preview text).
   * Cài đặt thông báo & tích hợp: Checkbox bật/tắt Taskbar flash, Tray, Desktop notification, Start menu shortcut.

---

## 7. Cấu Trúc Thư Mục Dự Án (Codebase Architecture)

```text
ZaloWebView/
├── package.json
├── tsconfig.json
├── src/
│   ├── main/
│   │   ├── index.ts               # Entry point, phân tích CLI arguments (--manager, --profile)
│   │   ├── profile-manager.ts    # Quản lý đọc/ghi profiles.json & session partitions
│   │   ├── desktop-service.ts    # Tạo/xóa file .desktop, cập nhật desktop-database
│   │   ├── tray-manager.ts       # Quản lý khay hệ thống, icon badge và menu
│   │   ├── window-service.ts     # Tạo BrowserWindow, quản lý kích thước, focus, flashFrame
│   │   ├── notifier.ts           # Dịch vụ thông báo DBus, debounce, deduplication
│   │   └── icon-fetcher.ts       # Tự động tải favicon/apple-touch-icon từ website
│   ├── preload/
│   │   ├── webview-preload.ts    # Preload cho Webview: MutationObserver, XPath evaluator, IPC
│   │   └── manager-preload.ts    # ContextBridge an toàn cho giao diện Manager
│   └── renderer/
│       └── manager/              # Giao diện web cho Manager UI
│           ├── index.html
│           ├── styles.css
│           └── app.ts
└── docs/
    └── superpowers/specs/
        └── 2026-09-12-linux-webview-manager-design.md
```

---

## 8. Kế Hoạch Kiểm Thử & Nghiệm Thu (Verification Plan)

### 8.1. Kiểm thử tự động (Automated Unit Tests)
* **`xpath-evaluator.test.ts`**:
  * Kiểm tra trích xuất XPath với các mẫu DOM giả lập (text, badge count `3`, badge `99+`, thẻ ẩn/hiện).
  * Kiểm tra cơ chế lọc trùng lặp (Deduplication) và Cooldown.
* **`desktop-service.test.ts`**:
  * Kiểm tra định dạng file `.desktop` sinh ra: đúng `StartupWMClass`, `Icon`, `Exec`, `Categories`.
  * Kiểm tra xử lý escape ký tự trong đường dẫn.
* **`profile-manager.test.ts`**:
  * Kiểm tra tính toàn vẹn dữ liệu khi thêm/sửa/xóa profile trong `profiles.json`.

### 8.2. Kiểm thử thực tế trên Linux (Manual Verification Checklist)
1. **Kiểm tra Start Menu**:
   * Tạo profile `Zalo` với URL `https://chat.zalo.me`.
   * Bấm "Tạo Shortcut Start Menu" -> Bấm phím `Super`, gõ "Zalo" -> Kiểm tra ứng dụng xuất hiện với đúng icon.
2. **Kiểm tra Độc lập & Tách biệt Session**:
   * Tạo 2 profile: `Zalo 1` và `Zalo 2`.
   * Đăng nhập 2 tài khoản Zalo khác nhau -> Xác nhận không bị đăng xuất chéo, cookies tách biệt hoàn toàn.
3. **Kiểm tra Luồng Thông Báo (Notification Flow)**:
   * Khi nhận tin nhắn mới:
     * [ ] Taskbar nhấp nháy sáng (`flashFrame` hoạt động trên KDE Plasma / GNOME).
     * [ ] Icon trên Dock/Taskbar hiển thị số tin nhắn chưa đọc.
     * [ ] Icon trên System Tray đổi sang chấm đỏ và cập nhật tooltip.
     * [ ] Popup Notification của hệ điều hành xuất hiện.
4. **Kiểm tra Xóa Cảnh Báo Khi Focus**:
   * [ ] Nhấp chuột focus vào cửa sổ Zalo -> Ngay lập tức taskbar ngừng nhấp nháy, badge biến mất, icon tray trở lại bình thường.
5. **Kiểm tra Thu Nhỏ Khay Hệ Thống**:
   * [ ] Nhấn nút đóng [X] -> Cửa sổ ẩn xuống Tray, app vẫn chạy ngầm theo dõi XPath.
   * [ ] Click icon Tray -> Cửa sổ hiện lại ngay lập tức.
