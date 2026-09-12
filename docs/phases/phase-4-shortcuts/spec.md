# Đặc tả phase 4 — Shortcut và cài launcher

Ngày đối chiếu: 12/09/2026. Trạng thái: chưa có service sinh shortcut; đã có launcher phát triển và desktop fixture. Phạm vi: Task 6 của [kế hoạch tổng](../../detailed_tasks_plan.md).

## Mục tiêu, đầu vào và giới hạn

Người dùng bật shortcut cho profile, tìm thấy trong menu Linux và mở đúng runner từ desktop session. Mở lặp khôi phục instance cũ. Đổi tên/icon cập nhật entry; tắt shortcut hoặc xóa profile gỡ đúng entry do ứng dụng quản lý.

Đầu vào là profile đã validate, đường launcher đã cài và kết quả đo danh tính Linux từ nền tảng runner. Kế thừa [thiết kế chuẩn](../../design_specification.md) và [ràng buộc chung](../README.md). Không triển khai CRUD GUI trong phase này; không tự động pin/unpin, không thêm `--edit`, `%u`, cài toàn cục bằng sudo hoặc thư viện desktop mới.

Không coi launcher dev hiện tại là bản phân phối: `bin/zaloview.js` còn cần `node_modules/electron/cli.js`. Trước nghiệm thu phải có một cách cài cụ thể hoạt động ngoài shell phát triển. Nếu chưa có bằng chứng identity trên backend đang dùng, giữ tiêu chí tách icon/pin ở trạng thái chưa kiểm thử.

## Yêu cầu và tiêu chí chấp nhận

| Mã | Yêu cầu | Ca kiểm tra bắt buộc |
| --- | --- | --- |
| P4-01 | Resolve XDG tuyệt đối hoặc fallback; tên `zaloview-<id>.desktop` trong applications | XDG tùy chỉnh, rỗng, tương đối; ID traversal/không hợp lệ không tạo file |
| P4-02 | `Exec` mở launcher đã cài với `--profile <id>` | Từ cwd và PATH khác dev vẫn mở đúng profile; launcher thiếu/không executable trả lỗi rõ |
| P4-03 | Encode riêng Desktop Entry string và Exec argument, không shell interpolation | Khoảng trắng, quote, backslash, dollar, backtick, percent; CR/LF/NUL bị từ chối; không tạo field code/action ngoài ý muốn |
| P4-04 | Desktop filename, desktopName và WM_CLASS/app ID nhất quán với phép đo | Không chép StartupWMClass fixture thành kết luận Wayland; entry mở đúng icon trên backend có bằng chứng |
| P4-05 | Name đúng tên profile; Icon là đường tuyệt đối đã quản lý hoặc icon theme fallback | Tên tiếng Việt, đổi tên/icon, icon thiếu đều xử lý được; không đưa URL tùy ý vào trường Icon |
| P4-06 | Ghi nguyên tử, mode `0644`; không làm yếu quyền registry `0600` | Ghi mới/cập nhật, lỗi write/rename giữ file cũ; test quyền bằng stat |
| P4-07 | Bật/tắt/cập nhật/xóa là thao tác có thể lặp an toàn | Chỉ tác động entry của ID đã validate; tắt hai lần thành công; file của app khác và session được giữ |
| P4-08 | Lưu profile và đồng bộ shortcut có kết quả riêng | Registry đã lưu nhưng ghi entry lỗi: trả trạng thái đã lưu kèm lỗi shortcut; retry không tạo profile trùng |
| P4-09 | Không phụ thuộc `update-desktop-database` để đảm bảo refresh menu | Utility thiếu không chặn tạo entry; nếu sử dụng thì gọi argument array và báo giới hạn |
| P4-10 | Nghiệm thu menu/pin/restore thực trên từng môi trường | `desktop-file-validate` khi có; menu tìm được profile, mở lặp không thêm runner, pin/unpin/icon có ghi kết quả |

## Hợp đồng đề xuất cho phase 5

Đây là API dự kiến, chưa có trong code. Đặt type dùng chung ở `src/shared/types.ts`; service main dự kiến tại `src/main/desktop-service.ts`.

```typescript
type ShortcutSyncResult =
  | { status: 'created' | 'updated' | 'removed' | 'unchanged'; path: string }
  | { status: 'error'; path: string; message: string };

function syncProfileShortcut(
  profile: Profile,
  launcherPath: string
): Promise<ShortcutSyncResult>;

function removeProfileShortcut(profileId: string): Promise<ShortcutSyncResult>;
```

`syncProfileShortcut` đọc `desktopConfig.createDesktopShortcut`: false thì gỡ; true thì tạo/cập nhật. Hàm không ghi registry. `removeProfileShortcut` dùng trong workflow xóa profile và chỉ gỡ entry của ID hợp lệ; file không tồn tại trả `unchanged`. Invalid ID/input bị từ chối trước thao tác filesystem; không tạo đường dẫn bằng ID chưa validate. Với input hợp lệ nhưng I/O lỗi, trả `status: 'error'` để UI cho retry.

Kết quả save phía Manager giữ hai phần: profile đã lưu và `ShortcutSyncResult`. Lỗi shortcut không đảo ngược registry một cách âm thầm. Không đổi ID hoặc xóa session khi đồng bộ entry.

## Điều kiện hoàn thành

- [ ] P4-01…P4-10 có kết quả và bằng chứng, xử lý điểm tích hợp R01/R02 trong [hướng dẫn sửa](../../code_remediation_guide.md).
- [ ] Typecheck/test/build đạt; entry được mở thực từ menu qua đường cài đã ghi trong hướng dẫn.
- [ ] Bàn giao API sync/remove, đường launcher, kết quả identity và giới hạn KDE/GNOME, X11/Wayland cho phase 5.
