# Kế Hoạch Triển Khai Theo Từng Giai Đoạn (Phased Implementation Roadmap)

**Dự án:** Linux Webview Manager (Zalo & Custom Web Apps)  
**Tài liệu tham chiếu thiết kế:** [docs/superpowers/specs/2026-09-12-linux-webview-manager-design.md](file:///home/buiducthanh/projects/canhan/ZaloWebView/docs/superpowers/specs/2026-09-12-linux-webview-manager-design.md)  
**Mục tiêu:** Chia nhỏ toàn bộ dự án thành **5 Phase lũy tiến (Incremental Phases)**. Mỗi phase kết thúc đều mang lại một sản phẩm có thể chạy và nghiệm thu độc lập trước khi sang phase tiếp theo.

---

## Bảng Tổng Quan Lộ Trình 5 Phase

| Phase | Tên Giai Đoạn | Trọng Tâm / Tính Năng Chính | Sản Phẩm Đầu Ra (Deliverable) |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Core Webview Runner & Session Isolation** | Khung dự án, CLI runner, cửa sổ frameless/PWA, cô lập cookie/cache bằng partition. | Mở được Zalo Web độc lập qua CLI, đăng nhập lưu phiên vĩnh viễn, đầy đủ quyền mic/cam WebRTC. |
| **Phase 2** | **XPath Observer Engine & Deduplication** | Preload script, MutationObserver + Polling, trích xuất unread badge/text, chống spam thông báo. | Bắt sự kiện tin nhắn mới từ DOM của Zalo Web và bắn IPC lên Main process một cách chính xác. |
| **Phase 3** | **Linux Desktop Integration & Attention Reset** | Làm sáng taskbar (`flashFrame`), badge số đếm, khay hệ thống (Tray), **tự động tắt active state khi focus**. | Trải nghiệm thông báo native hoàn chỉnh trên KDE Plasma và GNOME: taskbar sáng, tray đổi icon, focus tự tắt. |
| **Phase 4** | **Start Menu Integration (.desktop Generator)** | Sinh file `~/.local/share/applications/zaloview-<id>.desktop`, cấu hình `StartupWMClass`, cập nhật desktop database. | Ứng dụng xuất hiện trên Start Menu (KDE/GNOME), gõ phím Super tìm thấy ngay, icon độc lập trên Dock. |
| **Phase 5** | **Manager Dashboard GUI** | Giao diện Dashboard quản trị, thêm/sửa profile trực quan, công cụ test XPath trực tiếp, 1-click tạo shortcut. | Ứng dụng hoàn chỉnh 100% với giao diện quản lý đồ họa hiện đại, không cần chỉnh sửa config JSON thủ công. |

---

## Chi Tiết Từng Phase

---

### 🔹 Phase 1: Core Webview Runner & Session Isolation (MVP Cốt Lõi)

> **Mục tiêu:** Xây dựng khung ứng dụng Electron + TypeScript, tạo cơ chế cấu hình profile bằng JSON và mở được cửa sổ webview độc lập, không thanh địa chỉ, cookies tách biệt hoàn toàn.

#### 1. Công việc cần thực hiện
- [ ] Khởi tạo dự án: `package.json`, `tsconfig.json`, `vitest.config.ts`.
- [ ] Cài đặt các dependencies: `electron`, `typescript`, `vitest`, `jsdom`.
- [ ] Xây dựng thư viện kiểu dữ liệu chung: `src/shared/types.ts` (`Profile`, `XPathConfig`, `DesktopConfig`).
- [ ] Xây dựng `ProfileManager` (`src/main/profile-manager.ts`):
  - Tự động tạo thư mục `~/.config/zaloview/` và `Partitions/`.
  - Đọc/ghi cấu hình các profile từ `~/.config/zaloview/profiles.json`.
- [ ] Xây dựng `WindowService` (`src/main/window-service.ts`):
  - Tạo `BrowserWindow` không header, auto-hide menu bar.
  - Thiết lập phân vùng `partition: persist:zaloview_<profile.id>`.
  - Cấp quyền WebRTC (Camera, Microphone, Notifications, Clipboard) phục vụ gọi thoại/video Zalo.
  - Tự động lưu/khôi phục kích thước cửa sổ (`windowBounds`).
- [ ] Xây dựng CLI Dispatcher cơ bản (`src/main/index.ts`):
  - Hỗ trợ cờ lệnh `zaloview --profile <id>`.
  - Cơ chế Single Instance Lock chống mở trùng cửa sổ.

#### 2. Tiêu chí nghiệm thu (Acceptance Criteria)
1. Chạy lệnh với profile mẫu:
   ```bash
   npm start -- --profile zalo
   ```
2. Cửa sổ Zalo Web mở lên không có thanh URL hay thanh menu (trông hệt như app PWA).
3. Đăng nhập tài khoản Zalo, tắt cửa sổ đi và mở lại -> Vẫn giữ nguyên đăng nhập (cookies lưu trong partition độc lập).
4. Tạo profile thứ 2 (`zaloview --profile test`), mở lên -> Là một phiên duyệt web hoàn toàn mới, không bị dính cookie của profile Zalo.

---

### 🔹 Phase 2: XPath Observer Engine & Deduplication (Cơ Chế Bắt Tin Nhắn)

> **Mục tiêu:** Xây dựng module preload script chạy trong trang web để theo dõi sự biến đổi của DOM, đánh giá XPath trích xuất số tin chưa đọc/nội dung tin, và lọc chống spam thông báo.

#### 1. Công việc cần thực hiện
- [ ] Viết module `XPathEvaluator` (`src/preload/xpath-evaluator.ts`):
  - Hàm `evaluateXPath(document, selector)` trả về DOM Node.
  - Hàm `extractXPathData(node, mode)` hỗ trợ 3 chế độ:
    - `badge_count`: Đọc text, lọc ký tự số (ví dụ: `"3"` -> 3, `"99+"` -> 99).
    - `text_content`: Lấy nội dung text tin nhắn.
    - `existence`: Kiểm tra node có hiển thị hay không.
- [ ] Viết module `AlertDeduplicator` (`src/preload/xpath-evaluator.ts`):
  - Chống gửi lặp lại thông báo khi DOM không thay đổi.
  - Thiết lập Cooldown (2000ms) giữa các lần bắn cảnh báo liên tiếp.
  - Hàm `reset()` để xóa trạng thái khi người dùng đã đọc tin.
- [ ] Viết `webview-preload.ts` (`src/preload/webview-preload.ts`):
  - Kết hợp `MutationObserver` (bắt sự kiện thay đổi DOM tức thì kèm debounce 300ms) và fallback timer (3s - 5s).
  - Bắn sự kiện IPC `xpath:alert` kèm dữ liệu `{ count, text, mode }` lên Main Process.
- [ ] Viết Unit Tests kiểm thử độc lập cho module XPath & Deduplicator bằng Vitest + JSDOM.

#### 2. Tiêu chí nghiệm thu (Acceptance Criteria)
1. Chạy `npm test` -> Toàn bộ test case cho XPath evaluator và Deduplicator pass 100%.
2. Mở Zalo Web với cấu hình XPath của badge thông báo (ví dụ: `//span[contains(@class, 'tab-red-dot')]`).
3. Khi có người gửi tin nhắn đến tài khoản Zalo:
   - Terminal Main Process in ra log IPC nhận được sự kiện `xpath:alert` với đúng số tin nhắn.
   - Khi không có tin nhắn mới phát sinh, hệ thống không bắn log lặp lại thừa thãi.

---

### 🔹 Phase 3: Linux Desktop Integration & Attention Reset (Tích Hợp Sâu Hệ Thống)

> **Mục tiêu:** Hiện thực hóa toàn bộ trải nghiệm tương tác với hệ điều hành Linux: làm sáng taskbar, hiển thị badge unread, khay hệ thống (tray), popup notification và tự động xóa cảnh báo khi focus cửa sổ.

#### 1. Công việc cần thực hiện
- [ ] Xây dựng `LinuxNotifier` (`src/main/notifier.ts`):
  - Kích hoạt làm sáng/nhấp nháy taskbar: `window.flashFrame(true)`.
  - Hiển thị badge số đếm unread trên taskbar/dock qua DBus: `app.setBadgeCount(count)`.
  - Gửi desktop notification qua giao thức `org.freedesktop.Notifications`.
  - Xử lý sự kiện click vào popup notification -> Tự động khôi phục và focus cửa sổ.
- [ ] Xây dựng `ProfileTrayManager` (`src/main/tray-manager.ts`):
  - Tạo icon khay hệ thống (System Tray) cho từng profile.
  - Khi có tin mới: Đổi icon sang chấm đỏ và hiển thị tooltip số tin nhắn.
  - Menu ngữ cảnh chuột phải: Mở app, Đánh dấu đã đọc, Thoát.
  - Bắt sự kiện đóng cửa sổ [X]: Ẩn cửa sổ (`window.hide()`) để app tiếp tục chạy ngầm trong Tray.
  - Click chuột trái vào Tray: Hiện/ẩn cửa sổ nhanh.
- [ ] **Hiện thực hóa cơ chế Focus Auto-Clear (`window.on('focus')`)**:
  - Khi người dùng click vào cửa sổ webview:
    1. Gọi `window.flashFrame(false)` -> Tắt nhấp nháy taskbar.
    2. Gọi `app.setBadgeCount(0)` -> Xóa badge số đếm.
    3. Trả icon System Tray về bình thường (xóa chấm đỏ).
    4. Gửi tín hiệu IPC `window:focused` xuống preload để reset `AlertDeduplicator`.

#### 2. Tiêu chí nghiệm thu (Acceptance Criteria)
1. Mở cửa sổ Zalo và thu nhỏ hoặc chuyển sang cửa sổ khác.
2. Gửi tin nhắn đến:
   - [ ] Thanh Taskbar/Dock của KDE hoặc GNOME nhấp nháy phát sáng (Urgency color).
   - [ ] Icon trên Dock hiển thị badge đếm màu đỏ.
   - [ ] Icon dưới khay hệ thống (Tray) đổi sang trạng thái có chấm đỏ.
   - [ ] Popup thông báo của Linux xuất hiện góc màn hình.
3. Nhấp chuột vào cửa sổ Zalo:
   - [ ] Thanh Taskbar lập tức ngừng nhấp nháy.
   - [ ] Badge số đếm trên Dock biến mất (về 0).
   - [ ] Icon Tray trở lại bình thường.
4. Bấm nút [X] ở góc cửa sổ -> Cửa sổ biến mất nhưng icon Tray vẫn còn, app vẫn tiếp tục nhận tin nhắn ngầm.

---

### 🔹 Phase 4: Start Menu Integration (.desktop Generator)

> **Mục tiêu:** Tích hợp với Start Menu (Application Launcher) của KDE Plasma và GNOME Shell để từng website xuất hiện như một ứng dụng native độc lập, có icon riêng trên Dock.

#### 1. Công việc cần thực hiện
- [ ] Xây dựng `DesktopService` (`src/main/desktop-service.ts`):
  - Hàm sinh nội dung file `.desktop` chuẩn XDG Desktop Entry Specification.
  - Thiết lập trường quan trọng:
    - `Exec=zaloview --profile <id> %u`
    - `Icon=<đường_dẫn_tuyệt_đối_tới_icon.png>`
    - `StartupWMClass=zaloview-<id>`
  - Lưu file vào thư mục: `~/.local/share/applications/zaloview-<id>.desktop`.
  - Tự động gọi lệnh `update-desktop-database ~/.local/share/applications/`.
  - Hàm xóa file `.desktop` khi profile bị xóa.
- [ ] Cấu hình thuộc tính cửa sổ trong Electron (`WindowService`):
  - Gán `wmClass: 'zaloview-' + profile.id` khi khởi tạo `BrowserWindow`.
  - Đảm bảo Window Manager của Linux nhóm đúng cửa sổ vào icon riêng trên Dock thay vì icon Electron chung.
- [ ] Xây dựng script tạo file nhị phân chạy toàn cục (`bin/zaloview.js`).

#### 2. Tiêu chí nghiệm thu (Acceptance Criteria)
1. Gọi hàm tạo shortcut cho profile `zalo`.
2. Kiểm tra file `~/.local/share/applications/zaloview-zalo.desktop` đã được tạo với đầy đủ thông tin chuẩn.
3. Nhấn phím **Super (phím Windows)** trên bàn phím:
   - Gõ "Zalo" -> Ứng dụng hiển thị ngay trong danh sách tìm kiếm của KDE Kickoff / GNOME Shell.
4. Click vào shortcut trên menu để mở Zalo:
   - Cửa sổ mở lên với icon Zalo riêng biệt trên Dock/Taskbar.
   - Có thể chuột phải vào icon trên Dock và chọn "Pin to Dash / Pin to Taskbar" như một phần mềm cài đặt từ hệ thống.

---

### 🔹 Phase 5: Manager Dashboard GUI (Giao Diện Quản Trị)

> **Mục tiêu:** Xây dựng giao diện Dashboard đồ họa hiện đại, cho phép người dùng thêm, sửa, xóa profile, cấu hình XPath, kiểm tra XPath trực quan và 1-click tạo shortcut Start Menu mà không cần can thiệp file cấu hình.

#### 1. Công việc cần thực hiện
- [ ] Xây dựng Preload Bridge an toàn (`src/preload/manager-preload.ts`):
  - Expose API `window.api`: `getProfiles()`, `saveProfile()`, `deleteProfile()`, `launchProfile()`, `testXPath()`.
- [ ] Thiết kế giao diện HTML/CSS (`src/renderer/manager/index.html`, `styles.css`):
  - Phong cách giao diện hiện đại (Dark theme, Clean layout).
  - Khung lưới hiển thị danh sách profile dạng thẻ (Card view).
  - Modal form Thêm / Chỉnh sửa profile:
    - Nhập Tên, URL, Icon.
    - Cấu hình XPath Selector & Mode.
    - Các checkbox bật/tắt tính năng Desktop (Flash, Badge, Tray, Start Menu).
- [ ] Xây dựng Logic Renderer (`src/renderer/manager/app.ts`):
  - Render danh sách profile động.
  - Bắt sự kiện form submit để lưu profile.
  - Tích hợp nút **"Kiểm tra XPath"**: Mở webview ngầm thực thi XPath và hiển thị kết quả trực tiếp lên modal để người dùng biết XPath có hoạt động hay không.
- [ ] Tích hợp chế độ chạy Manager vào `src/main/index.ts`:
  - Khi chạy `zaloview` không kèm tham số hoặc `zaloview --manager`, cửa sổ Dashboard sẽ được mở ra.

#### 2. Tiêu chí nghiệm thu (Acceptance Criteria)
1. Chạy `zaloview` -> Giao diện Manager hiển thị đẹp mắt, trực quan.
2. Nhấn "+ Thêm Profile Mới", nhập:
   - Tên: `Zalo Cá Nhân`
   - URL: `https://chat.zalo.me`
   - XPath: `//span[contains(@class, 'tab-red-dot')]`
   - Tích chọn: Bật sáng taskbar, Hiện badge, Thu nhỏ tray, Tạo Start Menu.
3. Bấm "Lưu Profile":
   - Thẻ profile xuất hiện trên màn hình chính.
   - File shortcut trong Start Menu tự động được tạo.
4. Bấm "Mở App" từ thẻ profile -> Cửa sổ Zalo mở lên và hoạt động hoàn hảo với đầy đủ các tính năng đã phát triển từ Phase 1 đến Phase 4.

---

## Tóm Tắt Nguyên Tắc Triển Khai (Execution Guidelines)

1. **Tuân thủ thứ tự:** Thực hiện tuần tự từ Phase 1 ➔ Phase 5. Không nhảy cóc phase vì mỗi phase sau đều kế thừa nền tảng của phase trước.
2. **Nghiệm thu trước khi chuyển tiếp:** Ở cuối mỗi phase, thực hiện toàn bộ các bước trong mục **Tiêu chí nghiệm thu**. Chỉ chuyển sang phase tiếp theo khi phase hiện tại đã hoạt động ổn định.
3. **Commit Git rõ ràng:** Sau mỗi phase hoặc sau mỗi tính năng con hoàn thành, thực hiện commit với thông điệp rõ ràng (ví dụ: `feat(phase1): core webview runner with isolated partition`).
