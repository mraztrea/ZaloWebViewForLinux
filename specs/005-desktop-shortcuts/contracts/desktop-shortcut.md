# Hợp đồng: Desktop shortcut service

## API công khai nội bộ

```typescript
import type { Profile, ShortcutSyncResult } from '../shared/types';

export function syncProfileShortcut(
  profile: Profile,
  launcherPath: string
): Promise<ShortcutSyncResult>;

export function removeProfileShortcut(
  profileId: string
): Promise<ShortcutSyncResult>;
```

`syncProfileShortcut` đọc `profile.desktopConfig.createDesktopShortcut`: `true` tạo/cập nhật, `false` gỡ. Cả hai hàm không ghi registry, không điều khiển runner và không xóa session/icon nguồn.

## Kết quả

```typescript
export type ShortcutSyncResult =
  | { status: 'created' | 'updated' | 'removed' | 'unchanged'; path: string }
  | { status: 'error'; path: string; message: string };
```

| Trạng thái | Ý nghĩa |
| --- | --- |
| `created` | Không có file và shortcut mới đã được ghi thành công |
| `updated` | File owned tồn tại, nội dung khác và đã được thay thế nguyên tử |
| `removed` | File owned tồn tại và đã được gỡ |
| `unchanged` | Nội dung đã khớp hoặc yêu cầu gỡ file không tồn tại |
| `error` | Input đã resolve nhưng ownership, collision hoặc I/O ngăn thao tác; state cũ giữ nguyên |

Input sai contract bị từ chối trước filesystem; không trả `error` với một path được ghép từ ID chưa validate.

## Định dạng Desktop Entry

Thứ tự key ổn định để so sánh bytes:

```ini
[Desktop Entry]
Version=1.5
Type=Application
Name=<desktop-string(profile.name)>
Exec=<exec-arg(launcherPath)> --profile <exec-arg(profile.id)>
Icon=<desktop-string(managedIconPath hoặc applications-internet)>
Terminal=false
Categories=Network;
StartupWMClass=zaloview-<id>
X-ZaloWebView-ProfileId=<id>
```

File kết thúc bằng đúng một newline, encoding UTF-8 và mode `0644`.

## Validation

- `profile` phải vượt validation hiện có; ID được kiểm tra trước khi resolve filename.
- `launcherPath` phải tuyệt đối, regular, executable và không có CR/LF/NUL/C0/DEL.
- Icon chỉ được dùng khi là regular file tuyệt đối dưới vùng icon do ứng dụng quản lý; nếu thiếu hoặc ngoài vùng thì dùng `applications-internet`.
- `Name` không được tạo dòng/key mới.
- `Exec` chỉ chứa ba argv: launcher, literal `--profile`, ID; không có shell, field code hoặc URL argument.
- Trước update/remove: dùng `lstat`, từ chối symlink/non-regular file và kiểm tra marker ownership khớp ID.
- Invalid `XDG_DATA_HOME` rỗng/tương đối dùng fallback hiện có; applications path không được thoát base directory.

## Phối hợp Phase 5

Workflow lưu profile trả hai phần độc lập:

```typescript
type SaveProfileOutcome = {
  profile: Profile;
  shortcut: ShortcutSyncResult;
};
```

Đây là contract tiêu thụ tương lai, không yêu cầu Phase 4 thêm GUI/IPC. Nếu `shortcut.status === 'error'`, `profile` vẫn là dữ liệu đã lưu; retry chỉ gọi `syncProfileShortcut(profile, launcherPath)`.
