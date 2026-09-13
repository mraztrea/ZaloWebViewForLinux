# Mô hình dữ liệu: Shortcut desktop theo profile

## Profile

Thực thể hiện có cung cấp dữ liệu đầu vào cho shortcut.

| Trường liên quan | Quy tắc |
| --- | --- |
| `id` | Bất biến, duy nhất, đúng slug hiện hành, tối đa 64 ký tự |
| `name` | Không rỗng, tối đa 120 ký tự, không chứa control character |
| `iconPath` | Tùy chọn; chỉ dùng khi là file tuyệt đối do ứng dụng quản lý |
| `desktopConfig.createDesktopShortcut` | `true` để tạo/cập nhật; `false` để gỡ |

Một Profile có tối đa một DesktopShortcut. Đồng bộ không thay đổi bất kỳ trường Profile nào.

## InstalledLauncher

Điểm vào sản phẩm được Desktop Entry thực thi.

| Trường | Kiểu | Quy tắc |
| --- | --- | --- |
| `path` | absolute path | Tồn tại, regular file, executable, không chứa control character |
| `installRoot` | absolute path | Chứa nguyên bundle; di chuyển làm launcher cũ mất hiệu lực |
| `architecture` | string | Khớp kiến trúc runtime đã đóng gói |
| `applicationRoot` | relative bundle location | `resources/app` chứa `package.json` tối thiểu và `dist/` |

InstalledLauncher không phụ thuộc Node, npm, cwd, PATH hoặc devDependencies sau khi cài.

## DesktopShortcut

Biểu diễn logic của một Desktop Entry do ZaloWebView quản lý.

| Trường | Kiểu | Quy tắc |
| --- | --- | --- |
| `profileId` | string | ID profile đã validate |
| `path` | absolute path | `$XDG_DATA_HOME/applications/zaloview-<id>.desktop` hoặc fallback |
| `desktopName` | string | `zaloview-<id>`; khớp basename và identity runner |
| `name` | string | Tên profile sau Desktop Entry string encoding |
| `execArgv` | tuple | `[launcherPath, '--profile', profileId]`; từng phần encode độc lập, không shell |
| `icon` | string | Managed absolute path hoặc `applications-internet` |
| `startupWmClass` | string | Bằng `desktopName`; chỉ kết quả đo X11 chứng minh ghép X11 |
| `ownerProfileId` | string | Marker `X-ZaloWebView-ProfileId`; phải khớp trước update/remove |
| `mode` | permission | `0644` |

### Bất biến validation

- ID phải hợp lệ trước khi tạo `path`.
- `path` không được thoát khỏi applications dir.
- File hiện có phải là regular file không phải symlink và có marker khớp trước update/remove.
- Nội dung chỉ có bộ key đã chốt; không có field code/action ngoài hợp đồng.
- Registry, session và icon gốc không thuộc vòng đời DesktopShortcut.

## ShortcutSyncResult

Kết quả tách biệt để caller phối hợp với lưu Profile.

```typescript
export type ShortcutSyncResult =
  | { status: 'created' | 'updated' | 'removed' | 'unchanged'; path: string }
  | { status: 'error'; path: string; message: string };
```

- Validation sai được từ chối trước I/O.
- I/O/collision/ownership failure trả `error` để caller hiển thị và retry.
- `path` luôn là mục tiêu đã resolve từ ID hợp lệ.
- `message` không chứa dữ liệu nhạy cảm ngoài đường shortcut và nguyên nhân có thể hành động.

## DesktopEnvironmentEvidence

Bản ghi nghiệm thu, không phải cấu hình runtime.

| Trường | Giá trị |
| --- | --- |
| `desktop` | KDE Plasma hoặc GNOME |
| `sessionType` | X11 hoặc Wayland |
| `distributionAndVersion` | Distro/version đã kiểm tra |
| `electronVersion` | `44.3.x` thực tế |
| `desktopId` | `zaloview-<id>.desktop` |
| `validator` | PASS, FAIL hoặc Chưa kiểm thử |
| `menuDiscovery` | Thời gian tìm thấy hoặc Chưa kiểm thử |
| `launch` | Đúng profile/PID/socket/window hoặc lỗi quan sát |
| `identity` | WM_CLASS trên X11 hoặc app_id trên Wayland |
| `iconAndPin` | Kết quả menu/taskbar/pin/unpin |
| `limitations` | Compositor, extension, sandbox hoặc policy liên quan |

## Quan hệ

- Profile `1 — 0..1` DesktopShortcut.
- DesktopShortcut `N — 1` InstalledLauncher.
- DesktopShortcut `1 — 0..N` DesktopEnvironmentEvidence theo các môi trường được nghiệm thu.
- ShortcutSyncResult mô tả một lần chuyển trạng thái của đúng một DesktopShortcut.

## Chuyển trạng thái

| Trạng thái trước | Sự kiện | Điều kiện | Kết quả | Trạng thái sau |
| --- | --- | --- | --- | --- |
| Absent | Sync enabled | Input hợp lệ, không collision | `created` | Current |
| Current | Sync enabled | Bytes giống hệt | `unchanged` | Current |
| Stale | Sync enabled | File owned, bytes khác | `updated` | Current |
| Current/Stale | Sync disabled hoặc remove | File owned | `removed` | Absent |
| Absent | Sync disabled hoặc remove | Không có file | `unchanged` | Absent |
| Bất kỳ | Sync/remove | Validation sai | Reject trước I/O | Không đổi |
| Bất kỳ | Sync/remove | Symlink/unowned/I/O error | `error` | Không đổi; bản cũ được giữ nếu có |
