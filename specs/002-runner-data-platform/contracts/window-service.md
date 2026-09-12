# Interface Contract: Dịch vụ Cửa sổ và Chính sách Bảo mật (Window Service)

**Tệp**: `specs/002-runner-data-platform/contracts/window-service.md`
**Phạm vi**: Main Process — `src/main/window-service.ts`

---

## 1. Mô tả Tổng quan
Module `WindowService` chịu trách nhiệm tạo lập, cấu hình, quản lý vòng đời và thiết lập các chính sách bảo mật cho cửa sổ `BrowserWindow` của Profile Runner.

---

## 2. Thiết lập Cửa sổ và Định danh Linux

```typescript
export interface CreateWindowOptions {
  profile: Profile;
  windowState: WindowState;
  onWindowStateChange: (newState: WindowState) => void;
}

export function createRunnerWindow(options: CreateWindowOptions): BrowserWindow;
```

### Các tham số cấu hình BrowserWindow bắt buộc:
- `width`: `windowState.width` (mặc định 1024)
- `height`: `windowState.height` (mặc định 768)
- `x`: `windowState.x` (nếu hợp lệ sau khi kẹp tọa độ màn hình)
- `y`: `windowState.y` (nếu hợp lệ sau khi kẹp tọa độ màn hình)
- `autoHideMenuBar`: `true` (ẩn hoàn toàn thanh menu mặc định của Electron)
- `title`: `options.profile.name`
- `webPreferences`:
  - `contextIsolation`: `true`
  - `nodeIntegration`: `false`
  - `sandbox`: `true`
  - `webSecurity`: `true`
  - `preload`: Đường dẫn tuyệt đối tới tệp preload script đã đóng gói
  - `partition`: `'persist:zaloview_' + options.profile.id`

---

## 3. Quản lý Tọa độ và Giới hạn Màn hình (Screen Clamping)

Trước khi khởi tạo vị trí cửa sổ từ `windowState`:
1. Lấy danh sách các màn hình đang kết nối: `screen.getAllDisplays()`.
2. Xác định xem hình chữ nhật `{ x, y, width, height }` có nằm trong hoặc giao cắt tối thiểu 100x100 pixel với diện tích khả dụng (`display.workArea`) của bất kỳ màn hình nào không.
3. Nếu không giao cắt với bất kỳ màn hình nào (ví dụ màn hình phụ vừa bị rút cáp):
   - Đặt lại tọa độ về trung tâm của màn hình chính: `display = screen.getPrimaryDisplay()`.
   - `x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)`.
   - `y = Math.round(display.workArea.y + (display.workArea.height - height) / 2)`.
4. Sau khi cửa sổ hiển thị: nếu `windowState.isMaximized === true`, gọi `win.maximize()`.

---

## 4. Quản lý Quyền Thiết bị (Session Permission Handlers)

Trên phiên làm việc (`session`) của runner:

```typescript
// 1. Kiểm tra quyền tĩnh
session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
  // Chỉ chấp nhận các origin khớp với profile.url hoặc whitelist được cấp phép
  return isPermissionGranted(options.profile.id, requestingOrigin, permission);
});

// 2. Yêu cầu cấp quyền động
session.setPermissionRequestHandler((webContents, permission, callback, details) => {
  if (permission === 'media') { // Camera & Microphone
    promptUserForPermission(options.profile, details.requestingUrl, permission)
      .then((granted) => {
        savePermissionDecision(options.profile.id, details.requestingUrl, permission, granted);
        callback(granted);
      })
      .catch(() => callback(false));
    return;
  }
  
  // Mặc định từ chối các quyền khác
  callback(false);
});
```

---

## 5. Chính sách Điều hướng và Liên kết Ngoài (Navigation & Windows)

- **`will-navigate`**:
  - Kiểm tra URL đích.
  - Nếu chuyển hướng ra ngoài domain của website profile và không thuộc luồng xác thực đăng nhập: chặn điều hướng (`event.preventDefault()`) và mở bằng trình duyệt hệ thống (`shell.openExternal(url)`).
- **`setWindowOpenHandler`**:
  - Mọi yêu cầu mở cửa sổ mới (`target="_blank"` hoặc `window.open`):
  - Chặn mở cửa sổ Electron con: `{ action: 'deny' }`.
  - Mở liên kết qua trình duyệt mặc định của hệ điều hành: `shell.openExternal(details.url)`.
